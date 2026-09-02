export type ProfileFactKind =
  | 'goal'
  | 'preference'
  | 'dislike'
  | 'project'
  | 'habit'
  | 'journal'
  | 'weekly'
  | 'activity'
  | 'plan'
  | 'check'
  | 'diary';

export interface ProfileFact {
  date: string;
  kind: ProfileFactKind;
  text: string;
  explicit?: boolean;
  baseWeight: number;
}

export interface PortraitSection {
  id: string;
  title: string;
  body: string;
}

const HALF_LIFE_DAYS = 240;

export function daysBetween(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

export function recencyWeight(date: string, today: string): number {
  return Math.exp(-daysBetween(date, today) / HALF_LIFE_DAYS);
}

export function scoreFact(fact: ProfileFact, today: string): number {
  const explicitBoost = fact.explicit ? 1.35 : 1;
  return fact.baseWeight * recencyWeight(fact.date, today) * explicitBoost;
}

function topicKey(fact: ProfileFact): string {
  const text = fact.text.toLowerCase();
  if (/qwen|deepseek|dashscope|siliconflow|模型/.test(text)) return `${fact.kind}:model`;
  if (/plainlist/.test(text)) return `${fact.kind}:plainlist`;
  return `${fact.kind}:${text.replace(/\s+/g, '').slice(0, 12)}`;
}

export function resolveContradictions(facts: ProfileFact[]): ProfileFact[] {
  const groups = new Map<string, ProfileFact[]>();
  for (const fact of facts) {
    const key = topicKey(fact);
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  const resolved: ProfileFact[] = [];
  for (const group of groups.values()) {
    const explicit = group.filter((item) => item.explicit).sort((left, right) => right.date.localeCompare(left.date));
    if (explicit.length) {
      resolved.push(explicit[0]);
      continue;
    }
    resolved.push([...group].sort((left, right) => right.date.localeCompare(left.date))[0]);
  }
  return resolved;
}

function clip(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function pick(facts: ProfileFact[], kinds: ProfileFactKind[], today: string, limit: number): ProfileFact[] {
  return facts
    .filter((fact) => kinds.includes(fact.kind))
    .sort((left, right) => scoreFact(right, today) - scoreFact(left, today) || right.date.localeCompare(left.date))
    .slice(0, limit);
}

function bulletsToParagraph(facts: ProfileFact[]): string {
  const texts = [...new Set(facts.map((fact) => clip(fact.text, 80)))];
  if (!texts.length) return '';
  if (texts.length === 1) return texts[0];
  return `${texts.slice(0, -1).join('；')}；以及${texts.at(-1)}`;
}

function section(id: string, title: string, facts: ProfileFact[]): PortraitSection | null {
  if (!facts.length) return null;
  return { id, title, body: bulletsToParagraph(facts) };
}

export function composeUserPortrait(facts: ProfileFact[], today: string): { markdown: string; sections: PortraitSection[] } {
  const usable = resolveContradictions(facts.filter((fact) => fact.text.trim().length >= 4));
  const sections = [
    section('focus', '当前重点', pick(usable, ['activity', 'journal', 'project', 'plan'], today, 4)),
    section('goals', '长期目标', pick(usable, ['goal'], today, 4)),
    section('interests', '兴趣 / 研究方向', pick(usable, ['project', 'journal', 'weekly'], today, 4)),
    section('style', '工作与学习方式', pick(usable, ['habit', 'diary', 'preference'], today, 3)),
    section('projects', '持续项目', pick(usable.filter((fact) => /plainlist|foreshadow|项目|论文/i.test(fact.text)), ['project', 'plan', 'activity', 'goal'], today, 4)),
    section('prefs', '偏好与倾向', pick(usable, ['preference', 'dislike', 'diary'], today, 4)),
    section('recent', '最近状态', pick(usable, ['journal', 'weekly', 'activity', 'check'], today, 3)),
  ].filter((item): item is PortraitSection => Boolean(item));

  const markdown = sections.map((item) => `## ${item.title}\n\n${item.body}`).join('\n\n');
  return { markdown, sections };
}

export function portraitTraitSummary(markdown: string): string {
  return markdown.trim();
}
