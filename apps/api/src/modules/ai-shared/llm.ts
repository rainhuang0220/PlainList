import type { ResolvedAiConfig } from '../ai-intake/settings';
import { aiConfigIsReady } from '../ai-intake/settings';

export interface ChatRequest {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  jsonResponse?: boolean;
  /** Override user/env timeout for this call (e.g. AI intake needs longer than ping). */
  timeoutMs?: number;
  /** DeepSeek V4: explicitly disable/enable thinking mode (default off for deepseek-v4-*). */
  thinkingMode?: 'enabled' | 'disabled';
}

export interface ChatResult {
  text: string;
  model: string;
  provider: 'openai' | 'anthropic';
}

export type { ResolvedAiConfig };

function buildAbort(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, dispose: () => clearTimeout(timeout) };
}

function wrapUpstreamError(error: unknown, label: string, timeoutMs?: number): Error & { status: number } {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';
  const isAbort = name === 'AbortError' || /aborted/i.test(message);

  if (isAbort) {
    const timeoutHint = timeoutMs ? `（当前 ${timeoutMs}ms）` : '';
    return Object.assign(
      new Error(
        `${label} 请求超时或被中断${timeoutHint}。MiniMax-M3 等思维链模型较慢，AI 速记建议超时 ≥ 180000ms，保存后重试。`,
      ),
      { status: 504 },
    );
  }

  if (error instanceof Error && 'status' in error) {
    return error as Error & { status: number };
  }

  return Object.assign(new Error(`${label} 网络错误：${message}`), { status: 502 });
}

/** MiniMax-M3 等模型会在正文前输出 thinking 块，需剥离后再做 JSON 解析。 */
export function stripModelArtifacts(text: string): string {
  const redactedThinking = `${'redacted'}_${'thinking'}`;
  const redactedBlock = new RegExp(
    `<${redactedThinking}>[\\s\\S]*?<\\/${redactedThinking}>`,
    'gi',
  );
  return text
    .replace(redactedBlock, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim();
}

/** Pull the first balanced `{...}` object from model chatter (Flash 模型常在 JSON 前输出分析）。 */
export function extractJsonObject(text: string): string | null {
  const trimmed = stripModelArtifacts(text.trim());
  const start = trimmed.indexOf('{');
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(start, index + 1);
      }
    }
  }

  return null;
}

/** Close truncated JSON when the model hits max_tokens mid-object. */
export function repairTruncatedJson(text: string): string | null {
  const balanced = extractJsonObject(text);
  if (balanced) {
    return balanced;
  }

  const start = text.indexOf('{');
  if (start < 0) {
    return null;
  }

  let fragment = text.slice(start).trimEnd();
  fragment = fragment.replace(/,\s*"[^"]*":\s*"[^"]*$/u, '');
  fragment = fragment.replace(/,\s*"[^"]*":\s*$/u, '');
  fragment = fragment.replace(/,\s*\{[^{}]*$/u, '');
  fragment = fragment.replace(/,\s*$/u, '');

  const openBraces = (fragment.match(/\{/g) ?? []).length;
  const closeBraces = (fragment.match(/\}/g) ?? []).length;
  const openBrackets = (fragment.match(/\[/g) ?? []).length;
  const closeBrackets = (fragment.match(/\]/g) ?? []).length;

  fragment += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
  fragment += '}'.repeat(Math.max(0, openBraces - closeBraces));

  try {
    JSON.parse(fragment);
    return fragment;
  } catch {
    return null;
  }
}

function resolveThinkingMode(request: ChatRequest, model: string): 'enabled' | 'disabled' | undefined {
  if (request.thinkingMode) {
    return request.thinkingMode;
  }

  if (/deepseek-v4/i.test(model)) {
    return 'disabled';
  }

  return undefined;
}

function anthropicMessagesUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (normalized.endsWith('/v1')) {
    return `${normalized}/messages`;
  }
  return `${normalized}/v1/messages`;
}

function parseUpstreamErrorBody(errorText: string): string {
  const trimmed = errorText.trim();
  if (!trimmed) {
    return 'unknown upstream error';
  }

  try {
    const payload = JSON.parse(trimmed) as { error?: { message?: string }; message?: string };
    return payload.error?.message ?? payload.message ?? trimmed;
  } catch {
    return trimmed.slice(0, 500);
  }
}

function shouldRetryOpenAiWithoutJson(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('response_format')
    || message.includes('json_object')
    || message.includes('json mode')
    || message.includes('unsupported')
    || message.includes('not support');
}

function extractOpenAiText(
  payload: {
    choices?: Array<{
      message?: {
        content?: string | Array<{ text?: string; type?: string }>;
        reasoning_content?: string;
      };
    }>;
  },
  options?: { allowReasoningFallback?: boolean },
): string {
  const message = payload.choices?.[0]?.message;
  if (!message) {
    return '';
  }

  const { content, reasoning_content: reasoningContent } = message;
  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('');
  }

  if (!text.trim() && options?.allowReasoningFallback && typeof reasoningContent === 'string') {
    text = reasoningContent;
  }

  return stripModelArtifacts(text);
}

function shouldRetryOpenAiWithoutThinking(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('thinking')
    || message.includes('reasoning')
    || message.includes('unknown parameter')
    || message.includes('unrecognized');
}

async function callOpenAiOnce(
  config: ResolvedAiConfig,
  request: ChatRequest,
  timeoutMs: number,
  jsonResponse: boolean,
  thinkingMode?: 'enabled' | 'disabled' | null,
): Promise<ChatResult> {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const { controller, dispose } = buildAbort(timeoutMs);
  const resolvedThinking = thinkingMode === undefined
    ? resolveThinkingMode(request, config.model)
    : thinkingMode ?? undefined;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: request.temperature ?? 0.3,
        max_tokens: request.maxTokens ?? 800,
        stream: false,
        ...(jsonResponse ? { response_format: { type: 'json_object' } } : {}),
        ...(resolvedThinking ? { thinking: { type: resolvedThinking } } : {}),
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      const detail = parseUpstreamErrorBody(errorText || response.statusText);
      const error = new Error(`openai upstream failed: ${detail}`);
      (error as Error & { status: number }).status = response.status === 429 ? 503 : 502;
      throw error;
    }

    const payload = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ text?: string; type?: string }>;
          reasoning_content?: string;
        };
      }>;
    };
    const text = extractOpenAiText(payload, {
      allowReasoningFallback: resolvedThinking === 'enabled',
    });
    if (!text) {
      const error = new Error('openai upstream returned empty content');
      (error as Error & { status: number }).status = 502;
      throw error;
    }
    return { text, model: config.model, provider: 'openai' };
  } finally {
    dispose();
  }
}

async function callOpenAi(config: ResolvedAiConfig, request: ChatRequest): Promise<ChatResult> {
  const timeoutMs = request.timeoutMs ?? config.timeoutMs;
  const thinkingMode = resolveThinkingMode(request, config.model);

  try {
    if (request.jsonResponse) {
      try {
        return await callOpenAiOnce(config, request, timeoutMs, true, thinkingMode ?? null);
      } catch (error) {
        if (shouldRetryOpenAiWithoutJson(error)) {
          return await callOpenAiOnce(config, request, timeoutMs, false, thinkingMode ?? null);
        }
        throw error;
      }
    }

    try {
      return await callOpenAiOnce(config, request, timeoutMs, false, thinkingMode ?? null);
    } catch (error) {
      if (thinkingMode && shouldRetryOpenAiWithoutThinking(error)) {
        return await callOpenAiOnce(config, request, timeoutMs, false, null);
      }
      throw error;
    }
  } catch (error) {
    throw wrapUpstreamError(error, 'OpenAI 兼容接口', timeoutMs);
  }
}

async function callAnthropic(config: ResolvedAiConfig, request: ChatRequest): Promise<ChatResult> {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const timeoutMs = request.timeoutMs ?? config.timeoutMs;
  const { controller, dispose } = buildAbort(timeoutMs);
  const maxTokens = request.maxTokens ?? 4000;

  const messages: Array<{ role: string; content: unknown }> = [
    { role: 'user', content: [{ type: 'text', text: request.user }] },
  ];

  try {
    const response = await fetch(anthropicMessagesUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        Authorization: `Bearer ${config.apiKey}`,
        'anthropic-version': config.anthropicVersion,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTokens,
        temperature: request.temperature ?? 0.3,
        system: request.system,
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      const error = new Error(`anthropic upstream failed: ${errorText || response.statusText}`);
      (error as Error & { status: number }).status = 502;
      throw error;
    }

    const payload = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const blocks = payload.content ?? [];
    const text = blocks
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('')
      .trim();

    if (!text) {
      const blockTypes = blocks.map((b) => b.type ?? 'unknown').join(',') || 'none';
      const stopReason = payload.stop_reason ?? 'unknown';
      const usage = payload.usage
        ? `input=${payload.usage.input_tokens ?? '?'}, output=${payload.usage.output_tokens ?? '?'}/${maxTokens}`
        : 'no usage';
      const hint = stopReason === 'max_tokens'
        ? '（max_tokens 太小，思维链阶段吃完配额；调高 max_tokens）'
        : '';
      const error = new Error(
        `anthropic upstream returned no text block: stop_reason=${stopReason}, blocks=[${blockTypes}], usage=${usage}${hint}`,
      );
      (error as Error & { status: number }).status = 502;
      throw error;
    }
    return { text: stripModelArtifacts(text), model: config.model, provider: 'anthropic' };
  } catch (error) {
    throw wrapUpstreamError(error, 'Anthropic 兼容接口', timeoutMs);
  } finally {
    dispose();
  }
}

export async function chatComplete(config: ResolvedAiConfig, request: ChatRequest): Promise<ChatResult> {
  if (config.provider === 'anthropic') {
    return callAnthropic(config, request);
  }
  return callOpenAi(config, request);
}

export function aiProviderConfigured(config: ResolvedAiConfig | null): boolean {
  return aiConfigIsReady(config);
}
