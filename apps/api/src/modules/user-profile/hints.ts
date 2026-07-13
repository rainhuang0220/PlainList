import type { UserProfileTraitRecord } from '@plainlist/shared';

function percent(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function buildUserProfileHints(traits: UserProfileTraitRecord[]): string | null {
  const active = traits
    .filter((trait) => trait.enabled && trait.supportCount > 0 && trait.impactRatio > 0)
    .slice(0, 4);

  if (active.length === 0) {
    return null;
  }

  return [
    '【用户画像提示（可参考，若与本次明确指令冲突，以本次指令为准）】',
    ...active.map((trait) => {
      const summary = trait.effectiveSummary.replace(/\s+/g, ' ').trim();
      const evidence = `近 ${trait.supportCount} 次日记证据，影响 ${percent(trait.impactRatio)}%，置信 ${percent(trait.confidence)}%`;
      return `- ${trait.title}：${summary}（${evidence}）`;
    }),
    '应用原则：画像只影响模糊时间、可移动低优先级任务和建议说明；会议、deadline、明确时间点等硬约束不得被画像覆盖。',
  ].join('\n');
}
