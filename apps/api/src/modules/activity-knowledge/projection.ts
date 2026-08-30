export interface ProjectionFact { id: number; category: string; summary: string; outputState: string; explorationState: string; }
export interface DailyDigestContent { dateKey: string; mainProgress: string; outputs: string[]; learnings: string[]; unresolved: string[]; evidenceFactIds: number[]; }

export function buildDailyDigest(dateKey: string, facts: ProjectionFact[]): DailyDigestContent {
  const outputs = facts.filter((fact) => fact.outputState === 'produced' || fact.category === 'output').map((fact) => fact.summary).slice(0, 8);
  const learnings = facts.filter((fact) => fact.explorationState === 'explored' || fact.category === 'learning').map((fact) => fact.summary).slice(0, 8);
  const unresolved = facts.filter((fact) => fact.category === 'unresolved').map((fact) => fact.summary).slice(0, 8);
  const progress = outputs[0] ?? facts[0]?.summary ?? '当天没有足够的活动事实。';
  return { dateKey, mainProgress: progress, outputs, learnings, unresolved, evidenceFactIds: facts.slice(0, 20).map((fact) => fact.id) };
}

export function buildWeeklyIntelligence(
  weekStart: string,
  daily: DailyDigestContent[],
  goals: Array<{ id: number; title: string; priorityRank: number; status: string }>,
) {
  const ordered = daily.slice().sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const outputs = ordered.flatMap((item) => item.outputs).slice(0, 12);
  const evidenceFactIds = [...new Set(ordered.flatMap((item) => item.evidenceFactIds))].slice(0, 30);
  const activeGoals = goals.filter((goal) => goal.status === 'active').sort((a, b) => a.priorityRank - b.priorityRank);
  const primary = activeGoals[0];
  return {
    weekStart, progress: outputs.length ? 'advanced' : 'unknown', alignment: primary ? 'unknown' : 'neutral',
    output: outputs.length ? 'produced' : 'unknown', exploration: ordered.some((item) => item.learnings.length) ? 'explored' : 'unknown',
    opportunityCost: 'unknown', summary: outputs.length ? `本周形成 ${outputs.length} 项可核对产出。` : '本周记录不足，无法判断稳定进展。',
    outputs, openLoops: ordered.flatMap((item) => item.unresolved).slice(0, 12),
    suggestedNextFocus: primary ? [`围绕「${primary.title}」选择下一项可交付成果。`] : [], evidenceFactIds,
    unknowns: primary ? ['当前 facts 未提供足够证据判断目标对齐。'] : ['尚未设置 active goal。'],
  } as const;
}
