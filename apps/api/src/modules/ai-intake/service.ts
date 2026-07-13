import type {
  AiIntakeDirectives,
  AiIntakeDiscarded,
  AiIntakeItem,
  AiIntakePriority,
  AiIntakeResponse,
  AuthenticatedUser,
  PlanType,
} from '@plainlist/shared';
import {
  aiIntakeDirectivesSchema,
  aiIntakeDiscardedSchema,
  aiIntakeItemSchema,
  aiIntakeRequestSchema,
  toDateKey,
} from '@plainlist/shared';
import {
  applyScheduleCorrections,
  buildScheduleHints,
} from './scheduleHints';
import {
  detectDurationHours,
  detectTime,
  detectTimeRange,
  splitIntakeSegments,
} from '@plainlist/shared';
import { aiProviderConfigured, chatComplete, extractJsonObject, repairTruncatedJson, stripModelArtifacts } from '../ai-shared/llm';
import { assertAiConfigured, resolveAiConfigForUser, resolveIntakeAiConfigForUser, resolveIntakeTimeout } from './settings';
import { buildUserProfileHints } from '../user-profile/hints';
import { loadEnabledProfileTraitsForIntake } from '../user-profile/service';

function serviceError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

const DEFAULT_TIME = '09:00';

const CLEAR_VERB = '(清空|清掉|清除|清一下|清下|清理|删掉|删除|去掉|抹掉|重置|重排)';
const CLEAR_QUALIFIER_TODAY = '(今天|今日|当前|现在)';
const CLEAR_QUALIFIER_SCOPE = '(所有|全部|这些|那些)';
const CLEAR_TARGET = '(日程|任务|计划|安排|清单|事项|todo|to-do|to do)';

const CLEAR_VERB_BEFORE_QUALIFIER = new RegExp(
  CLEAR_VERB
    + '\\s*(一下|掉)?\\s*(?:'
    + CLEAR_QUALIFIER_TODAY + '\\s*' + CLEAR_QUALIFIER_SCOPE + '?\\s*的?\\s*' + CLEAR_TARGET + '?'
    + '|'
    + CLEAR_QUALIFIER_SCOPE + '\\s*' + CLEAR_QUALIFIER_TODAY + '?\\s*的?\\s*' + CLEAR_TARGET + '?'
    + '|'
    + '的?\\s*' + CLEAR_TARGET
    + ')',
  'i',
);

const CLEAR_QUALIFIER_BEFORE_VERB = new RegExp(
  '把?\\s*(?:'
    + CLEAR_QUALIFIER_TODAY + '\\s*的?\\s*' + CLEAR_QUALIFIER_SCOPE + '?\\s*' + CLEAR_TARGET + '?'
    + '|'
    + CLEAR_QUALIFIER_SCOPE + '\\s*' + CLEAR_QUALIFIER_TODAY + '?\\s*的?\\s*' + CLEAR_TARGET + '?'
    + '|'
    + '的?\\s*' + CLEAR_TARGET
    + ')'
    + '\\s*(全部|都|一并)?\\s*'
    + CLEAR_VERB
    + '\\s*(一下|掉)?',
  'i',
);

function detectClearIntent(text: string): { hit: boolean; matchedText?: string } {
  const verbFirst = text.match(CLEAR_VERB_BEFORE_QUALIFIER);
  const qualFirst = text.match(CLEAR_QUALIFIER_BEFORE_VERB);
  const match = verbFirst ?? qualFirst;
  if (!match) return { hit: false };
  const snippet = match[0].replace(/^[\s，,。;；、:：]+/, '').trim();
  return { hit: true, matchedText: snippet.slice(0, 200) };
}

function describeReferenceContext(referenceDate: string): string {
  const [year, month, day] = referenceDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const weekday = weekdays[date.getDay()];
  const now = new Date();
  const sameDay = now.getFullYear() === year && now.getMonth() + 1 === month && now.getDate() === day;
  const clock = sameDay
    ? `当前本地时间约为 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    : '';
  return `今日日期：${referenceDate}（${weekday}）${clock ? '，' + clock : ''}`;
}

function detectContinuousDurationHint(text: string): string | null {
  const hasDuration = /(?:选满|干满|做满|学满|练满|刷满|连续|持续).{0,8}[0-9一二两三四五六七八九十]{1,2}\s*(?:个)?\s*(?:小时|钟头|h)\b|[0-9一二两三四五六七八九十]{1,2}\s*(?:个)?\s*(?:小时|钟头|h)(?:的)?(?:专注|学习|工作|练习|刷题|coding)?/i.test(text);
  if (!hasDuration) {
    return null;
  }

  return '【连续时长】用户描述的是同一件事持续若干小时 → 只输出 1 条 item；time=开始时刻，note 写「连续N小时」，why 可写推算结束时刻；必须放进不与其它固定时段重叠的空档，禁止塞进用户已声明的占用块中间；禁止拆成「第1小时」「第2小时」或按小时数生成多条。';
}

function buildRelativeDayHints(text: string, referenceDate: string): string | null {
  if (!/(明天|后天|下周|下礼拜|下个星期)/.test(text)) {
    return null;
  }

  return `【日期提示】今日基准=${referenceDate}。凌晨口语里的「明天」常指今日晚些时候，应优先排进 items。仅当明确是其他日历日（如「7月5日」「下周」）才进 discarded。`;
}

function buildSystemPrompt(): string {
  return [
    '你是 PlainList 今日调度助理：把口语中文整理为今日可执行 JSON。只做决策，不寒暄、不反问、不解释你是 AI。',
    '',
    '输出约束（最高优先级）：',
    '- 第一个字符必须是 {，最后一个字符必须是 }；只输出一个 JSON 对象。',
    '- 禁止输出分析、推理、思考过程、「我们分析」等任何 JSON 以外的文字。',
    '',
    'JSON 格式：',
    '{"items":[{"name":"","type":"habit|todo","time":"HH:MM","priority":"high|normal|low","order":1,"why":"","note":""}],"discarded":[{"text":"","reason":""}],"directives":{"clearTodayTodos":false,"clearReason":"","matchedText":""},"summary":"","advice":""}',
    '',
    '规则：',
    '1) 切分：多件不同的事拆多条。连续N小时默认可合并为1条；但若中间有定点事项（如10点抢课）落在该时段内，必须拆成多段（例：09:00-10:00打CS → 10:00抢课 → 10:00-14:00续打CS）；学习等连续时长放进空档（如14:00-19:00）。',
    '1b) 时段占用：用户说「X点打到Y点」→ 固定占用块（time=X，why=Y）；此区间内除用户允许的打断外禁止插入其它事项。',
    '1c) 排程顺序：先落固定占用与定点事项，再排连续时长；order 按实际发生时间升序；同一时刻 duration 块排在定点事项之前。',
    '2) name 为 8~20 字动词宾语，去掉口语赘词；每日/习惯词 → habit，否则 todo；order 按时间升序从 1 编号。',
    '3) 时间：明示优先；下午/晚上 +12；模糊区间取起点（三五点→15:00，九十点晚上→21:00）；相对时间做算术（X前N小时、饭后+60~90min）；有连续N小时则结束时间=开始+N小时；无线索则按上下文合理推断，勿全填 09:00；冲突则微调并在 advice 说明。',
    '4) discarded：元指令、状态陈述、非今日、重复片段；重复只留最完整一条。',
    '5) clearTodayTodos：识别"清空今日任务/日程"类口令 → directives 为 true，附 matchedText/clearReason；不要变成 item，不要写 discarded。',
    '6) priority：答辩/面试/deadline/约会 → high；洗澡午饭休息 → normal；可推迟 → low。',
    '7) 用户消息里若有【本地预解析参考】【连续时长】【日程排布参考】，必须遵守占用时段与建议空档，可纠错但勿机械照抄。',
    '勿输出 Markdown 或多余文字。',
  ].join('\n');
}

function buildPreparseHints(text: string): string | null {
  const segments = splitIntakeSegments(text);

  if (segments.length < 2) {
    return null;
  }

  const clearHit = detectClearIntent(text);
  const lines = [
    '【本地预解析参考（可合并、纠错、丢弃；不要照抄，以语义为准）】',
    ...(clearHit.hit
      ? [`- 清空今日意图：「${clearHit.matchedText}」→ 写入 directives，不要变成 item`]
      : []),
    ...segments.map((segment, index) => {
      const time = detectTime(segment);
      const range = detectTimeRange(segment);
      const durationHours = detectDurationHours(segment);
      const clipped = segment.length > 120 ? `${segment.slice(0, 120)}…` : segment;
      const hints = [
        time ? `时间线索 ${time}` : null,
        range ? `占用 ${range.start}-${range.end}` : null,
        durationHours ? `连续 ${durationHours} 小时（须避开占用块）` : null,
      ].filter(Boolean).join('；');
      return `${index + 1}. 「${clipped}」${hints ? ` → ${hints}` : ''}`;
    }),
  ];

  return lines.join('\n');
}

function buildUserPrompt(text: string, referenceDate: string, profileHint?: string | null): string {
  const preparse = buildPreparseHints(text);
  const durationHint = detectContinuousDurationHint(text);
  const scheduleHint = buildScheduleHints(text);
  const relativeDayHint = buildRelativeDayHints(text, referenceDate);
  return [
    describeReferenceContext(referenceDate),
    '',
    ...(relativeDayHint ? [relativeDayHint, ''] : []),
    ...(scheduleHint ? [scheduleHint, ''] : []),
    ...(profileHint ? [profileHint, ''] : []),
    ...(durationHint ? [durationHint, ''] : []),
    ...(preparse ? [preparse, ''] : []),
    '原始输入（用户口述，可能含糊、有冲突、有元指令）：',
    '"""',
    text,
    '"""',
    '',
    '请直接输出 JSON 对象（不要输出分析过程）。',
  ].join('\n');
}

function safeJsonParse(text: string): unknown {
  const trimmed = stripModelArtifacts(text.trim());
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidates = [
    fenced?.[1]?.trim(),
    extractJsonObject(trimmed),
    repairTruncatedJson(trimmed),
    trimmed,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  return null;
}

function normalizePriority(value: unknown): AiIntakePriority | undefined {
  if (typeof value !== 'string') return undefined;
  const lowered = value.trim().toLowerCase();
  if (lowered === 'high' || lowered === 'normal' || lowered === 'low') return lowered;
  return undefined;
}

function coerceMisplacedDiscardedEntry(candidate: unknown): {
  salvageItem?: {
    name: string;
    type: PlanType;
    time: string;
    priority?: AiIntakePriority;
    order?: number;
    why?: string;
    note?: string;
  };
  discarded?: { text: string; reason: string };
} {
  if (!candidate || typeof candidate !== 'object') {
    return {};
  }

  const draft = candidate as {
    text?: unknown;
    title?: unknown;
    name?: unknown;
    reason?: unknown;
    time?: unknown;
    type?: unknown;
    order?: unknown;
    why?: unknown;
    note?: unknown;
    priority?: unknown;
  };

  const label = [draft.text, draft.title, draft.name]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim() ?? '';

  if (!label) {
    return {};
  }

  const reasonValue = typeof draft.reason === 'string' ? draft.reason.trim() : '';
  let time = typeof draft.time === 'string' ? draft.time.trim() : '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(time)) {
    const guessed = detectTime(label);
    if (guessed) {
      return {
        salvageItem: {
          name: label.slice(0, 200),
          type: typeof draft.type === 'string' && draft.type.trim().toLowerCase() === 'habit' ? 'habit' : 'todo',
          time: guessed,
          priority: normalizePriority(draft.priority),
          order: typeof draft.order === 'number' ? draft.order : undefined,
          why: typeof draft.why === 'string' ? draft.why.trim().slice(0, 280) : undefined,
          note: typeof draft.note === 'string' ? draft.note.trim().slice(0, 200) : undefined,
        },
      };
    }

    return {
      discarded: {
        text: label.slice(0, 400),
        reason: reasonValue || `非今日（${time}）`,
      },
    };
  }

  if (!/^\d{2}:\d{2}$/.test(time)) {
    const guessed = detectTime(`${label} ${time}`);
    if (guessed) {
      time = guessed;
    }
  }

  if (/^\d{2}:\d{2}$/.test(time)) {
    return {
      salvageItem: {
        name: label.slice(0, 200),
        type: typeof draft.type === 'string' && draft.type.trim().toLowerCase() === 'habit' ? 'habit' : 'todo',
        time,
        priority: normalizePriority(draft.priority),
        order: typeof draft.order === 'number' ? draft.order : undefined,
        why: typeof draft.why === 'string' ? draft.why.trim().slice(0, 280) : undefined,
        note: typeof draft.note === 'string' ? draft.note.trim().slice(0, 200) : undefined,
      },
    };
  }

  if (!reasonValue) {
    return {};
  }

  return {
    discarded: {
      text: label.slice(0, 400),
      reason: reasonValue.slice(0, 280),
    },
  };
}

function normalizeAiResponse(raw: unknown): {
  items: AiIntakeItem[];
  discarded: AiIntakeDiscarded[];
  directives?: AiIntakeDirectives;
  summary?: string;
  advice?: string;
} {
  if (!raw || typeof raw !== 'object') {
    return { items: [], discarded: [] };
  }

  const itemsValue = (raw as { items?: unknown }).items;
  const discardedValue = (raw as { discarded?: unknown }).discarded;
  const directivesValue = (raw as { directives?: unknown }).directives;
  const summaryValue = (raw as { summary?: unknown }).summary;
  const adviceValue = (raw as { advice?: unknown }).advice;

  const items: AiIntakeItem[] = [];
  if (Array.isArray(itemsValue)) {
    for (const candidate of itemsValue) {
      if (!candidate || typeof candidate !== 'object') continue;
      const draft = candidate as {
        name?: unknown;
        title?: unknown;
        task?: unknown;
        type?: unknown;
        time?: unknown;
        priority?: unknown;
        order?: unknown;
        why?: unknown;
        note?: unknown;
      };
      const nameRaw = [
        draft.name,
        draft.title,
        draft.task,
      ].find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
      if (!nameRaw) continue;
      const typeRaw = typeof draft.type === 'string' ? draft.type.trim().toLowerCase() : 'todo';
      const type: PlanType = typeRaw === 'habit' ? 'habit' : 'todo';
      let time = typeof draft.time === 'string' ? draft.time.trim() : '';
      if (!/^\d{2}:\d{2}$/.test(time)) {
        const guessed = detectTime(`${nameRaw} ${time}`);
        time = guessed ?? DEFAULT_TIME;
      }
      const order = typeof draft.order === 'number' && Number.isFinite(draft.order)
        ? Math.max(0, Math.min(99, Math.trunc(draft.order)))
        : undefined;

      const parsed = aiIntakeItemSchema.safeParse({
        name: nameRaw.slice(0, 200),
        type,
        time,
        priority: normalizePriority(draft.priority),
        order,
        why: typeof draft.why === 'string' ? draft.why.trim().slice(0, 280) : undefined,
        note: typeof draft.note === 'string' ? draft.note.trim().slice(0, 200) : undefined,
      });
      if (parsed.success) items.push(parsed.data);
    }
  }

  const discarded: AiIntakeDiscarded[] = [];
  if (Array.isArray(discardedValue)) {
    for (const candidate of discardedValue) {
      const coerced = coerceMisplacedDiscardedEntry(candidate);
      if (coerced.salvageItem) {
        const parsedSalvage = aiIntakeItemSchema.safeParse(coerced.salvageItem);
        if (parsedSalvage.success) {
          items.push(parsedSalvage.data);
          continue;
        }
      }

      if (!coerced.discarded) {
        const draft = candidate as { text?: unknown; reason?: unknown };
        const textValue = typeof draft.text === 'string' ? draft.text.trim() : '';
        const reasonValue = typeof draft.reason === 'string' ? draft.reason.trim() : '';
        if (!textValue || !reasonValue) continue;
        const parsed = aiIntakeDiscardedSchema.safeParse({
          text: textValue.slice(0, 400),
          reason: reasonValue.slice(0, 280),
        });
        if (parsed.success) discarded.push(parsed.data);
        continue;
      }

      const parsed = aiIntakeDiscardedSchema.safeParse(coerced.discarded);
      if (parsed.success) discarded.push(parsed.data);
    }
  }

  items.sort((left, right) => {
    const leftOrder = left.order ?? 99;
    const rightOrder = right.order ?? 99;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.time.localeCompare(right.time);
  });

  let directives: AiIntakeDirectives | undefined;
  if (directivesValue && typeof directivesValue === 'object') {
    const draft = directivesValue as {
      clearTodayTodos?: unknown;
      clearReason?: unknown;
      matchedText?: unknown;
    };
    const parsed = aiIntakeDirectivesSchema.safeParse({
      clearTodayTodos: typeof draft.clearTodayTodos === 'boolean' ? draft.clearTodayTodos : undefined,
      clearReason: typeof draft.clearReason === 'string' ? draft.clearReason.trim().slice(0, 280) : undefined,
      matchedText: typeof draft.matchedText === 'string' ? draft.matchedText.trim().slice(0, 400) : undefined,
    });
    if (parsed.success) {
      directives = parsed.data;
    }
  }

  return {
    items,
    discarded,
    directives,
    summary: typeof summaryValue === 'string' ? summaryValue.trim().slice(0, 600) : undefined,
    advice: typeof adviceValue === 'string' ? adviceValue.trim().slice(0, 600) : undefined,
  };
}

function mergeDirectives(
  aiDirectives: AiIntakeDirectives | undefined,
  regexHit: { hit: boolean; matchedText?: string },
): AiIntakeDirectives | undefined {
  const aiHit = aiDirectives?.clearTodayTodos === true;
  if (!aiHit && !regexHit.hit) return undefined;

  return {
    clearTodayTodos: true,
    clearReason: aiDirectives?.clearReason
      ?? '检测到"清空今日"类口令，将在加入新条目前批量删除当前 todo（习惯不受影响）。',
    matchedText: aiDirectives?.matchedText ?? regexHit.matchedText,
  };
}

async function requestModelIntake(text: string, referenceDate: string, userId: number) {
  const aiConfig = assertAiConfigured(await resolveIntakeAiConfigForUser(userId));
  const intakeTimeoutMs = resolveIntakeTimeout(aiConfig.timeoutMs);
  const profileHint = buildUserProfileHints(await loadEnabledProfileTraitsForIntake(userId));
  const baseRequest = {
    temperature: 0.15,
    maxTokens: 8192,
    jsonResponse: false,
    thinkingMode: 'disabled' as const,
    timeoutMs: intakeTimeoutMs,
  };

  let result = await chatComplete(aiConfig, {
    ...baseRequest,
    system: buildSystemPrompt(),
    user: buildUserPrompt(text, referenceDate, profileHint),
  });

  let parsed = safeJsonParse(result.text);
  if (parsed === null) {
    console.warn('[ai-intake] first pass was not JSON, retrying with strict prompt', {
      model: result.model,
      preview: result.text.slice(0, 160),
    });
    const scheduleHint = buildScheduleHints(text);
    result = await chatComplete(aiConfig, {
      ...baseRequest,
      temperature: 0,
      system: [
        '你是 JSON 转换器。只输出一个 JSON 对象，首字符 { 末字符 }。',
        '禁止输出分析、推理或「我们」开头段落。',
        '{"items":[],"discarded":[],"directives":{"clearTodayTodos":false},"summary":"","advice":""}',
      ].join('\n'),
      user: [
        `今日=${referenceDate}。把下面口述整理为今日 JSON；非今日事项进 discarded。`,
        ...(scheduleHint ? [scheduleHint, ''] : []),
        ...(profileHint ? [profileHint, ''] : []),
        '"""',
        text,
        '"""',
      ].join('\n'),
    });
    parsed = safeJsonParse(result.text);
  }
  const normalized = normalizeAiResponse(parsed);
  const items = applyScheduleCorrections(text, normalized.items);
  const regexHit = detectClearIntent(text);
  const directives = mergeDirectives(normalized.directives, regexHit);
  if (
    items.length === 0
    && normalized.discarded.length === 0
    && !directives?.clearTodayTodos
  ) {
    const rawPreview = result.text.slice(0, 800).replace(/\s+/g, ' ');
    const parseStatus = parsed === null
      ? 'JSON.parse 失败（模型没输出合法 JSON）'
      : `JSON 解析成功但 items/discarded 为空或全部 schema 校验未通过；解析后顶层键=[${
          parsed && typeof parsed === 'object' ? Object.keys(parsed).join(',') : 'non-object'
        }]`;
    console.error('[ai-intake] upstream returned no usable items.', {
      model: result.model,
      parseStatus,
      rawPreview,
    });
    throw serviceError(
      502,
      `模型返回无法整理为日程（${parseStatus}）。若使用 Flash 轻量模型，可换 DeepSeek-V3 或调大 max_tokens；原文前 200 字：${rawPreview.slice(0, 200)}`,
    );
  }
  return { ...normalized, items, directives, model: result.model };
}

export async function generateAiIntake(user: AuthenticatedUser, payload: unknown): Promise<AiIntakeResponse> {
  const input = aiIntakeRequestSchema.parse(payload);
  const referenceDate = input.referenceDate ?? toDateKey(new Date());
  const generatedAt = new Date().toISOString();
  const trimmedText = input.text.trim();

  if (!trimmedText) {
    throw serviceError(400, 'text is required');
  }

  const resolved = await resolveAiConfigForUser(user.id);
  if (!aiProviderConfigured(resolved)) {
    throw serviceError(
      503,
      '未配置可用的大模型。请点击右上角用户名 → 用户设置 → AI 速记，填写 API Key；或由管理员在 apps/api/.env 配置服务端默认 Key。',
    );
  }

  const result = await requestModelIntake(trimmedText, referenceDate, user.id);
  return {
    items: result.items,
    discarded: result.discarded,
    directives: result.directives,
    summary: result.summary,
    advice: result.advice,
    source: 'ai',
    model: result.model,
    generatedAt,
  };
}
