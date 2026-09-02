import { chineseCharCount, type DailySummaryInput } from './dailyNormalize';
import { isCompleteSemanticFact } from './semanticFact';

export type DailyCompositionMode = 'model' | 'fallback';
export type DailyFallbackReason =
  | 'provider_error'
  | 'timeout'
  | '429'
  | 'invalid_output'
  | 'validator_reject'
  | 'empty_output'
  | 'other';

export interface DailyComposeResult {
  text: string;
  compositionMode: DailyCompositionMode;
  providerCalled: boolean;
  fallbackReason?: DailyFallbackReason;
}

const GENERIC_FILLER = /取得了一定进展|开展了相关工作|进行了多方面探索/;
const KEYWORD_DUMP = /本地优先现场场景|数字化工作台|封板结果|工作树干净|基线已核对/;
const INTERNAL = /没有可提取的用户|无有效活动|\bextract\b|\bfallback\b|\bconversation\b|用户消息|对话标题|无论你怎么收口/i;

const SYSTEM_PROMPT = [
  '根据下面已经提取好的用户活动事实，写一段当天活动记录。',
  '规则：',
  '- 只写提供的事实',
  '- 不猜测',
  '- 不扩展',
  '- 一个自然段',
  '- 使用完整中文句子',
  '- 80–200 字，事实少时可以更短',
  '- 按重要程度组织',
  '- 合并同一项目',
  '- completed / discussed / planned 必须准确',
  '- 删除 DOI / URL / hash / 数字垃圾',
  '- 保留有意义的项目名、论文主题、模型名、版本号',
  '- 不使用“取得了一定进展”等空话',
  '- 不列点',
  '- 不加标题',
  '- 不使用 conversation、extract、fallback、用户消息 等内部词',
  '只返回正文。',
].join('\n');

const REPAIR_PROMPT = [
  '上一次输出不合格。',
  '只返回一段完整中文，不要标题、列表、Markdown、DOI、URL 或关键词拼接。',
  '必须是可以读通的句子，通常 80 到 200 字。',
].join('');

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clipToLimit(paragraph: string, limit = 200): string {
  if (chineseCharCount(paragraph) <= limit) return paragraph;
  const sentences = paragraph.split(/(?<=[。；])/u).filter(Boolean);
  let next = '';
  for (const sentence of sentences) {
    const trial = `${next}${sentence}`;
    if (chineseCharCount(trial) > limit) break;
    next = trial;
  }
  const text = next.trim() || paragraph;
  if (chineseCharCount(text) <= limit) {
    return /[。；]$/u.test(text) ? text.replace(/；$/u, '。') : `${text.replace(/[。；]?$/u, '')}。`;
  }
  return `${Array.from(text.replace(/。$/u, '')).slice(0, Math.max(1, limit - 1)).join('')}。`;
}

export function isReadableDailyParagraph(text: string): boolean {
  const value = text.trim();
  if (!value || value.includes('\n') || /^## /.test(value) || value.includes('### ')) return false;
  if (!/。/.test(value)) return false;
  if (/\b10\.\d{4,9}/.test(value) || /https?:\/\//i.test(value) || /\b(?:19|20)\d{2}\.\d+/.test(value)) return false;
  if (GENERIC_FILLER.test(value) || KEYWORD_DUMP.test(value) || INTERNAL.test(value)) return false;
  if (/(^|\n)[-*] /.test(value) || /推进[\u4e00-\u9fffA-Za-z]+ [\u4e00-\u9fff]{2,}/.test(value)) return false;
  if (/完了(?!成)/.test(value) || /当取|当天户|相关活动。$|讨论了没有/.test(value)) return false;
  if (/[“”"「」]/.test(value)) return false;
  if (!/今天|当天|完成了|继续|讨论了|确定了|计划了|计划第二天|核对了|修改了/.test(value)) return false;
  const count = chineseCharCount(value);
  return count > 12 && count <= 280;
}

function usableFacts(input: DailySummaryInput): string[] {
  const complete = (item: string) => isCompleteSemanticFact(item) && !INTERNAL.test(item);
  const picked: string[] = [];
  for (const topic of input.topics) {
    const first = topic.facts.find(complete);
    if (first && !picked.includes(first)) picked.push(first);
    if (picked.length >= 4) return picked;
  }
  for (const topic of input.topics) {
    for (const fact of topic.facts.filter((item) => complete(item) && !picked.includes(item))) {
      picked.push(fact);
      if (picked.length >= 4) return picked;
    }
  }
  return picked;
}

export function composeReadableFallback(input: DailySummaryInput): string {
  const facts = usableFacts(input);
  if (!facts.length) return '';
  const clauses = facts.map((item) => item.replace(/^[今天当天]/, '').replace(/。$/u, ''));
  if (facts.length === 1) {
    const only = facts[0].replace(/^当天/, '今天');
    return /^今天/.test(only) ? only : `今天${only}`;
  }
  const first = clauses[0];
  const rest = clauses.slice(1);
  const joined = rest.length === 1
    ? `今天主要${first}；同时${rest[0]}。`
    : `今天主要${first}；同时${rest[0]}；此外${rest.slice(1).join('；')}。`;
  return clipToLimit(joined);
}

function compactPayload(input: DailySummaryInput) {
  return {
    date: input.date,
    topics: input.topics.map((topic) => ({
      name: topic.name,
      status: topic.status,
      facts: topic.facts.filter((item) => isCompleteSemanticFact(item) && !INTERNAL.test(item)),
    })).filter((topic) => topic.facts.length),
  };
}

export function classifyProviderError(error: unknown): DailyFallbackReason {
  const status = Number((error as { status?: number })?.status || 0);
  const message = error instanceof Error ? error.message : String(error || '');
  if (status === 429 || /429/.test(message)) return '429';
  if (status === 504 || /timeout|超时|aborted|AbortError/i.test(message)) return 'timeout';
  if (status >= 500 || /network|ECONN|provider/i.test(message)) return 'provider_error';
  return 'other';
}

async function completeWithRetry(
  complete: (request: { system: string; user: string }) => Promise<string>,
  request: { system: string; user: string },
  retryDelayMs: number,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await complete(request);
    } catch (error) {
      lastError = error;
      const reason = classifyProviderError(error);
      if (!['timeout', '429', 'provider_error'].includes(reason) || attempt === 1) throw error;
      await sleep(retryDelayMs);
    }
  }
  throw lastError;
}

export async function composeDailyJournal(
  input: DailySummaryInput,
  options: {
    tryModel: boolean;
    complete?: (request: { system: string; user: string }) => Promise<string>;
    retryDelayMs?: number;
  },
): Promise<DailyComposeResult> {
  const fallback = composeReadableFallback(input);
  if (!input.topics.length || !fallback) {
    return { text: fallback, compositionMode: 'fallback', providerCalled: false, fallbackReason: 'empty_output' };
  }
  if (!options.tryModel || !options.complete) {
    return { text: fallback, compositionMode: 'fallback', providerCalled: false };
  }

  const payload = JSON.stringify(compactPayload(input));
  const retryDelayMs = options.retryDelayMs ?? 400;
  try {
    const first = (await completeWithRetry(options.complete, { system: SYSTEM_PROMPT, user: payload }, retryDelayMs)).trim();
    if (!first) {
      return { text: fallback, compositionMode: 'fallback', providerCalled: true, fallbackReason: 'empty_output' };
    }
    if (isReadableDailyParagraph(first)) {
      return { text: first.replace(/\s+/g, ''), compositionMode: 'model', providerCalled: true };
    }
    const second = (await completeWithRetry(options.complete, {
      system: `${SYSTEM_PROMPT}\n${REPAIR_PROMPT}`,
      user: payload,
    }, retryDelayMs)).trim();
    if (!second) {
      return { text: fallback, compositionMode: 'fallback', providerCalled: true, fallbackReason: 'empty_output' };
    }
    if (isReadableDailyParagraph(second)) {
      return { text: second.replace(/\s+/g, ''), compositionMode: 'model', providerCalled: true };
    }
    return { text: fallback, compositionMode: 'fallback', providerCalled: true, fallbackReason: 'validator_reject' };
  } catch (error) {
    return {
      text: fallback,
      compositionMode: 'fallback',
      providerCalled: true,
      fallbackReason: classifyProviderError(error),
    };
  }
}
