import { isFullClosedWeek, WEEKLY_SUMMARY_PROMPT_VERSION, type WeeklySummaryContent } from '@plainlist/shared';
import {
  buildWeeklySummarySystemPrompt,
  buildWeeklySummaryUserPrompt,
  composeDeterministicWeeklyContent,
  type WeeklyEvidencePayload,
} from './weeklySummaryCore';

export const CURRENT_WEEK_PROGRESS_PROMPT_VERSION = 'current-week-progress-v1';

export function shouldUseCurrentWeekProgress(windowStart: string, windowEnd: string): boolean {
  return !isFullClosedWeek(windowStart, windowEnd);
}

export function isStaleCurrentWeekSnapshot(snapshot: {
  windowStartDate: string;
  windowEndDate: string;
  promptVersion?: string | null;
}): boolean {
  return shouldUseCurrentWeekProgress(snapshot.windowStartDate, snapshot.windowEndDate)
    && snapshot.promptVersion !== CURRENT_WEEK_PROGRESS_PROMPT_VERSION;
}

export function reviewProgressForWindow(windowStart: string, windowEnd: string) {
  if (shouldUseCurrentWeekProgress(windowStart, windowEnd)) {
    return {
      promptVersion: CURRENT_WEEK_PROGRESS_PROMPT_VERSION,
      compose: composeDeterministicCurrentWeekProgress,
      systemPrompt: buildCurrentWeekProgressSystemPrompt,
      userPrompt: buildCurrentWeekProgressUserPrompt,
    };
  }
  return {
    promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
    compose: composeDeterministicWeeklyContent,
    systemPrompt: buildWeeklySummarySystemPrompt,
    userPrompt: buildWeeklySummaryUserPrompt,
  };
}

const DATE_HEADING = /^(?:#{1,6}\s*)?(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s*月\s*\d{1,2}\s*日)[：:]?\s*$/;
const WEEKDAY_ONLY = /^(?:#{1,6}\s*)?(?:周|星期)[一二三四五六日天][：:]?\s*$/;
const WEEKDAY_PREFIX = /^(?:#{1,6}\s*)?(?:周|星期)[一二三四五六日天][：:]\s*/;
const DATE_PREFIX = /^(?:#{1,6}\s*)?(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s*月\s*\d{1,2}\s*日)[：:]\s*/;
const SUBJECT = /^([A-Za-z][A-Za-z0-9._-]{1,}|[\u4e00-\u9fff]{2,12}(?=\s|做了|又|发布|修|改))/;

function stripDayChrome(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || DATE_HEADING.test(trimmed) || WEEKDAY_ONLY.test(trimmed)) return '';
      return trimmed.replace(WEEKDAY_PREFIX, '').replace(DATE_PREFIX, '');
    })
    .filter(Boolean)
    .join('\n');
}

function splitItems(text: string): string[] {
  const items: string[] = [];
  for (const para of text.split(/\n+/)) {
    const chunks = para.split(/(?<=[。；;])\s+/).map((part) => part.trim()).filter(Boolean);
    items.push(...(chunks.length ? chunks : [para.trim()].filter(Boolean)));
  }
  return items;
}

function subjectOf(item: string, fallback: string): string {
  const match = item.match(SUBJECT);
  return match?.[1] || fallback;
}

function remainderAfterSubject(item: string, subject: string): string {
  const stripped = item.replace(new RegExp(`^${escapeRegExp(subject)}\\s*`), '').replace(/[。；;]+$/g, '').trim();
  return stripped || item.replace(/[。；;]+$/g, '').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function composeDeterministicCurrentWeekProgress(
  evidence: WeeklyEvidencePayload,
): WeeklySummaryContent | null {
  const relevantDays = evidence.days.filter((day) => day.date >= evidence.weekStart && day.date <= evidence.weekEnd);
  const clusters = new Map<string, string[]>();
  const order: string[] = [];

  const push = (subject: string, remainder: string) => {
    if (!remainder) return;
    if (!clusters.has(subject)) {
      clusters.set(subject, []);
      order.push(subject);
    }
    const bucket = clusters.get(subject);
    if (bucket && !bucket.includes(remainder)) bucket.push(remainder);
  };

  for (const day of relevantDays) {
    const body = stripDayChrome(day.chatgptJournal?.trim() || day.diary?.trim() || '');
    let lastSubject = '本周';
    for (const item of splitItems(body)) {
      const subject = subjectOf(item, lastSubject);
      lastSubject = subject;
      push(subject, remainderAfterSubject(item, subject));
    }
    for (const item of day.items.filter((entry) => entry.done)) {
      push(item.name, '已完成');
    }
  }

  if (!order.length) return null;

  const narrative = order
    .map((subject) => `### ${subject}\n\n${(clusters.get(subject) ?? []).map((line) => `- ${line}`).join('\n')}`)
    .join('\n\n');

  return {
    overall: `本周按项目推进：${order.join('、')}。`,
    summary: order.map((subject) => `${subject}：${(clusters.get(subject) ?? []).join('；')}`).join('。'),
    comparison: '无法判断',
    positive: '无法判断',
    concerns: '无法判断',
    nextFocus: ['继续推进本周已开始的项目'],
    narrativeMarkdown: narrative.slice(0, 4000),
  };
}

export function buildCurrentWeekProgressSystemPrompt(): string {
  return [
    `你是 PlainList 的本周进展观察者。promptVersion=${CURRENT_WEEK_PROGRESS_PROMPT_VERSION}。`,
    '这是「本周进展」，不是封闭的上周回顾，也不是每日日记拼接。',
    '',
    '输出约束（最高优先级）：',
    '- 只输出一个 JSON 对象。第一个字符必须是 {，最后一个字符必须是 }。',
    '- JSON 字段：overall, summary, comparison, positive, concerns, next_focus, narrative_markdown。',
    '- overall/summary/comparison/positive/concerns 均为非空中文字符串。',
    '- next_focus 为 1 到 3 条短句。',
    '- narrative_markdown 使用 Markdown，按主题/项目组织，不要按日期组织。',
    '',
    '内容抽象：',
    '- 不要按星期几或日期逐日罗列。禁止「周一 / 周二 / 周三」或「9 月 N 日」章节。',
    '- 同一项目跨天的工作收成一条进展，而不是把每日小记首尾相接。',
    '- 用项目或主题做标题，不要用日记标题。',
    '- 不要改变已完成日期范围；只写证据窗口内已经发生的事。',
    '- 不要跨周比较，那是上周回顾的工作。comparison 写「无法判断」。',
    '- 不得讨好，不得羞辱，不得发明未发生的完成。',
  ].join('\n');
}

export function buildCurrentWeekProgressUserPrompt(evidence: WeeklyEvidencePayload): string {
  return [
    '下面是本周已完成日期范围内的证据。写成主题化的本周进展，不要写成日记。',
    'chatgptJournal 是每日小记，只作素材，不要保留它的日期标题。',
    '',
    JSON.stringify(evidence),
  ].join('\n');
}
