import { createHash } from 'node:crypto';
import type {
  ChecksByPlan,
  PlanRecord,
  UserProfileTraitRecord,
  WeeklySummaryContent,
} from '@plainlist/shared';
import {
  WEEKLY_SUMMARY_PROMPT_VERSION,
  getWeekStart,
  reviewWindowFor,
  toDateKey,
  visiblePlansOnDate,
  weeklySummaryContentSchema,
} from '@plainlist/shared';
import { extractJsonObject, repairTruncatedJson, stripModelArtifacts } from '../ai-shared/llm';

export { WEEKLY_SUMMARY_PROMPT_VERSION };

export const WEEKLY_SUMMARY_SETTING_PREFIX = 'weekly_ai_summary:';

const DIARY_MAX_CHARS = 2000;
const PROFILE_LIMIT = 6;
const EVIDENCE_PER_TRAIT = 3;

export interface WeeklyEvidenceItem {
  id: number;
  name: string;
  type: 'habit' | 'todo';
  time: string;
  done: boolean;
  actualMinutes: number | null;
  durationMinutes: number | null;
}

export interface WeeklyEvidenceDay {
  date: string;
  diary: string | null;
  chatgptJournal?: string | null;
  items: WeeklyEvidenceItem[];
}

export interface WeeklyEvidenceConflict {
  date: string;
  planId: number;
  planName: string;
  checkDone: boolean;
  kind: 'diary-vs-unchecked';
  note: string;
}

export interface WeeklyEvidenceProfile {
  traitKey: string;
  title: string;
  summary: string;
  evidence: Array<{ reviewDate: string; excerpt: string }>;
}

export interface WeeklyEvidencePayload {
  weekStart: string;
  weekEnd: string;
  lookbackStart: string;
  todayKey: string;
  days: WeeklyEvidenceDay[];
  conflicts: WeeklyEvidenceConflict[];
  profile: WeeklyEvidenceProfile[];
}

export function reviewSourceDataCount(evidence: WeeklyEvidencePayload): number {
  return evidence.days.reduce((count, day) => (
    count + (day.diary ? 1 : 0) + (day.chatgptJournal ? 1 : 0) + day.items.filter((item) => item.done).length
  ), 0);
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function shiftDateKey(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function normalizeWeekStart(dateKey: string): string {
  return toDateKey(getWeekStart(parseDateKey(dateKey)));
}

export function weeklyLookbackRange(weekStart: string): { from: string; to: string } {
  const monday = normalizeWeekStart(weekStart);
  return {
    from: shiftDateKey(monday, -28),
    to: shiftDateKey(monday, 6),
  };
}

export function weeklySummarySettingKey(weekStart: string): string {
  return `${WEEKLY_SUMMARY_SETTING_PREFIX}${normalizeWeekStart(weekStart)}`;
}

export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
}

export function sourceHash(payload: unknown): string {
  return createHash('sha256').update(stableSerialize(payload)).digest('hex');
}

export function isWeeklySummaryCacheFresh(
  cache: { weekStart?: string; sourceHash?: string; promptVersion?: string } | null | undefined,
  expected: { weekStart: string; sourceHash: string; promptVersion: string },
): boolean {
  return Boolean(
    cache
    && cache.weekStart === expected.weekStart
    && cache.sourceHash === expected.sourceHash
    && cache.promptVersion === expected.promptVersion,
  );
}

function clip(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function iterateDateKeys(from: string, to: string): string[] {
  const keys: string[] = [];
  let current = from;
  while (current <= to) {
    keys.push(current);
    current = shiftDateKey(current, 1);
  }
  return keys;
}

function diaryMentionsName(diary: string, name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return false;
  }
  return diary.includes(trimmed);
}

export function assembleWeeklyEvidence(input: {
  weekStart: string;
  todayKey: string;
  plans: PlanRecord[];
  checks: ChecksByPlan;
  reviews: Record<string, string>;
  profile: UserProfileTraitRecord[];
  chatgptJournals?: Record<string, string>;
}): WeeklyEvidencePayload {
  const weekStart = normalizeWeekStart(input.weekStart);
  const range = weeklyLookbackRange(weekStart);
  const days: WeeklyEvidenceDay[] = [];
  const conflicts: WeeklyEvidenceConflict[] = [];

  for (const date of iterateDateKeys(range.from, range.to)) {
    if (date > input.todayKey) {
      continue;
    }

    const diaryRaw = input.reviews[date]?.trim() ?? '';
    const diary = diaryRaw ? clip(diaryRaw, DIARY_MAX_CHARS) : null;
    const items = visiblePlansOnDate(input.plans, date)
      .slice()
      .sort((left, right) => left.id - right.id)
      .map((plan) => {
        const cell = input.checks[String(plan.id)]?.[date];
        return {
          id: plan.id,
          name: plan.name,
          type: plan.type,
          time: plan.time,
          done: Boolean(cell?.done),
          actualMinutes: cell?.actualMinutes ?? null,
          durationMinutes: plan.durationMinutes ?? null,
        };
      });

    if (diary) {
      for (const item of items) {
        if (!item.done && diaryMentionsName(diary, item.name)) {
          conflicts.push({
            date,
            planId: item.id,
            planName: item.name,
            checkDone: false,
            kind: 'diary-vs-unchecked',
            note: `任务记录未显示完成，但日记明确记录了「${item.name}」，因此更倾向于认为实际已经完成，只是记录未同步。必须写明冲突。`,
          });
        }
      }
    }

    const chatgptJournal = input.chatgptJournals?.[date]?.trim() || null;
    days.push({ date, diary, ...(chatgptJournal ? { chatgptJournal } : {}), items });
  }

  const profile = input.profile
    .filter((trait) => trait.enabled && trait.supportCount > 0)
    .sort((left, right) => right.impactRatio - left.impactRatio || left.id - right.id)
    .slice(0, PROFILE_LIMIT)
    .sort((left, right) => left.traitKey.localeCompare(right.traitKey) || left.id - right.id)
    .map((trait) => ({
      traitKey: trait.traitKey,
      title: trait.title,
      summary: trait.effectiveSummary,
      evidence: [...(trait.evidence ?? [])]
        .sort((left, right) => left.reviewDate.localeCompare(right.reviewDate) || left.excerpt.localeCompare(right.excerpt))
        .slice(0, EVIDENCE_PER_TRAIT)
        .map((item) => ({
          reviewDate: item.reviewDate,
          excerpt: clip(item.excerpt, 240),
        })),
    }));

  conflicts.sort((left, right) => left.date.localeCompare(right.date) || left.planId - right.planId);

  return {
    weekStart,
    weekEnd: range.to,
    lookbackStart: range.from,
    todayKey: input.todayKey,
    days,
    conflicts,
    profile,
  };
}

/**
 * Snapshot evidence is always cut off at yesterday in the app timezone.
 * The historical comparison horizon remains four calendar weeks, but the
 * visible review window is never a rolling seven-day range.
 */
export function assembleReviewSnapshotEvidence(input: {
  reviewAsOfDate: string;
  plans: PlanRecord[];
  checks: ChecksByPlan;
  reviews: Record<string, string>;
  profile: UserProfileTraitRecord[];
  chatgptJournals?: Record<string, string>;
}): WeeklyEvidencePayload {
  const window = reviewWindowFor(input.reviewAsOfDate);
  const evidence = assembleWeeklyEvidence({
    weekStart: window.windowStartDate,
    todayKey: window.windowEndDate,
    plans: input.plans,
    checks: input.checks,
    reviews: input.reviews,
    profile: input.profile,
    chatgptJournals: input.chatgptJournals,
  });

  return {
    ...evidence,
    weekStart: window.windowStartDate,
    weekEnd: window.windowEndDate,
    todayKey: input.reviewAsOfDate,
  };
}

export function parseWeeklySummaryContent(text: string): WeeklySummaryContent | null {
  const stripped = stripModelArtifacts(text);
  const json = extractJsonObject(stripped) ?? repairTruncatedJson(stripped);
  if (!json) {
    return null;
  }

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const result = weeklySummaryContentSchema.safeParse({
      overall: parsed.overall,
      summary: parsed.summary,
      comparison: parsed.comparison,
      positive: parsed.positive,
      concerns: parsed.concerns,
      nextFocus: parsed.nextFocus ?? parsed.next_focus,
      narrativeMarkdown: parsed.narrativeMarkdown ?? parsed.narrative_markdown,
    });
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function composeDeterministicWeeklyContent(evidence: WeeklyEvidencePayload): WeeklySummaryContent | null {
  const relevantDays = evidence.days.filter((day) => day.date >= evidence.weekStart && day.date <= evidence.weekEnd);
  const bodies = relevantDays
    .map((day) => day.chatgptJournal?.trim() || day.diary?.trim() || '')
    .filter(Boolean);
  const completed = relevantDays.flatMap((day) => day.items.filter((item) => item.done).map((item) => `${day.date} 完成了${item.name}`));
  if (!bodies.length && !completed.length) {
    return null;
  }

  const narrative = [
    ...bodies,
    completed.length ? `### 完成事项\n\n${completed.map((item) => `- ${item}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  return {
    overall: '周总结正在更新',
    summary: narrative.slice(0, 1800) || '已有每日记录，周总结正在更新。',
    comparison: '无法判断',
    positive: '无法判断',
    concerns: '无法判断',
    nextFocus: ['等待周总结更新'],
    narrativeMarkdown: narrative.slice(0, 4000),
  };
}

export function buildWeeklySummarySystemPrompt(): string {
  return [
    `你是 PlainList 的长期第三方观察者。promptVersion=${WEEKLY_SUMMARY_PROMPT_VERSION}。`,
    '你不是教练、老师、朋友、心理咨询师，也不是陪伴型 AI。你根据证据描述行为轨迹，没有情绪偏见。',
    '',
    '输出约束（最高优先级）：',
    '- 只输出一个 JSON 对象。第一个字符必须是 {，最后一个字符必须是 }。',
    '- 禁止输出分析过程、寒暄或 JSON 之外的文字。',
    '- JSON 字段：overall, summary, comparison, positive, concerns, next_focus, narrative_markdown。',
    '- overall/summary/comparison/positive/concerns 均为非空中文字符串。',
    '- next_focus 为 1 到 3 条短建议，不要鸡汤 TODO 清单。',
    '- narrative_markdown 是给用户阅读的周总结正文，中文约 400–600 字，默认约 500 字。',
    '- narrative_markdown 使用 Markdown。章节按实际内容动态出现，不要每周固定输出同一套 7 个标题。',
    '- 不要把 AI 建议写成用户已经完成。必须区分计划、讨论、尝试、推进、完成。',
    '',
    '证据优先级：用户人工日记 > 完成的任务/打卡 > ChatGPT Daily Journals > Activity Facts > Goals/Plans。',
    'ChatGPT 活动是增强来源，不是回顾的前提。没有 ChatGPT 记录时，仍必须根据日记、打卡和计划作答。',
    'chatgptJournal 是本地 ChatGPT archive 派生的每日小记，不是用户手写日记，也不是 raw transcript。',
    '日记优先，但日记不是绝对正确。若日记与任务状态冲突，必须明确写出冲突，并说明更倾向的判断及其依据；不得偷偷选定一边当成事实。',
    '未打卡不等于未完成。没有记录只说明没有记录，不能证明事情没有发生。',
    '不得把娱乐或休息自动判定为低效或荒废。不评价单个行为的道德价值。评价的是行为是否与用户长期目标和近期计划形成一致趋势。',
    '不得因为怕批评就合理化一切；连续多日核心目标无进展、娱乐挤占且趋势向下时，应直接指出趋势。',
    '',
    '必须跨周比较：至少对比上周，并在数据允许时观察近 2 周、近 4 周，区分偶然波动与持续趋势。',
    '数据不足时必须写「无法判断」并说明缺什么。不允许凭空补全。',
    '事实、观察、解释必须分离。解释必须使用「可能」「看起来」「更倾向于」「从现有记录来看」。',
    '',
    '不得讨好。不得羞辱。禁止道德评价、心理诊断、根据单日事件下长期结论、为了正能量掩盖问题、为了客观故意挑刺、把未打卡写成没做、把娱乐自动写成浪费。',
    '不得写「你已经做得很好啦」「休息也是为了更好地出发」这类陪伴话术。',
    '用户画像只是辅助线索，不得据此发明人格缺陷。',
    '',
    '字段含义：',
    '- overall：本周总体状态，一句话。',
    '- summary：本周真正重要的事情，不机械罗列全部任务。',
    '- comparison：与上周和近几周相比发生了什么变化。',
    '- positive：仅写有证据支持的变化。没有就写无法判断或没有足够证据。',
    '- concerns：值得注意的问题；没有则写无法判断或没有足够证据。',
    '- next_focus：下周最值得关注的 1 到 3 件事。只来自证据中的未完成事项、目标和明确意图，不要凭空猜测。',
    '- narrative_markdown：可读的周总结。完整自然周约 500 字；进行中的当前周按已完成天数写滚动进展，有几天写几天。',
  ].join('\n');
}

export function buildWeeklySummaryUserPrompt(evidence: WeeklyEvidencePayload): string {
  return [
    '下面是已压缩、已排序的证据。只根据这些证据作答。',
    'conflicts 是日记与打卡的冲突提示，必须在 summary 或 concerns 中写明冲突，不能把未打卡写成未完成事实。',
    'days 覆盖本周以及用于比较的近 4 周。diary 为空表示该日没有日记，不表示该日荒废。',
    'chatgptJournal 是本地 ChatGPT archive 派生的每日小记，不是用户手写日记，也不是 raw transcript。优先用它形成滚动周进展，但不要把它当成用户已经完成的唯一证据。',
    'profile 是既有用户画像证据，仅作辅助，不得升级成诊断。',
    '',
    JSON.stringify(evidence),
  ].join('\n');
}
