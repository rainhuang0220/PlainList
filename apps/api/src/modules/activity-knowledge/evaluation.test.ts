import { describe, expect, it } from 'vitest';
import { buildDailyDigest, buildWeeklyIntelligence } from './projection';

const scenarios = [
  ['research output', ['experiment', 'benchmark', 'paper artifact'], true],
  ['engineering versus research', ['release', 'deployment', 'bugfix'], true],
  ['learning without output', ['reading', 'tutorial', 'concept study'], false],
  ['exploration', ['OS exploration', 'RISC-V'], false],
  ['maintenance', ['dependency update', 'release maintenance'], true],
  ['chat discussion only', ['ideas', 'questions', 'discussion'], false],
  ['chat result artifact', ['architecture ADR', 'working bug fix'], true],
  ['progress supporting alignment', ['systems learning'], false],
  ['one rest day', ['experiment'], true],
  ['cross-day opportunity cost evidence', ['maintenance one', 'maintenance two', 'maintenance three'], true],
  ['goal priority change', ['deliverable'], true],
  ['sparse week', ['one recorded day'], false],
] as const;

describe('weekly intelligence synthetic evaluation fixtures', () => {
  it.each(scenarios)('%s preserves the intended output/activity distinction', (_name, items, shouldOutput) => {
    const daily = buildDailyDigest('2026-08-30', items.map((summary, id) => ({
      id: id + 1, category: shouldOutput ? 'output' : 'learning', summary,
      outputState: shouldOutput ? 'produced' : 'not_applicable', explorationState: shouldOutput ? 'not_applicable' : 'explored',
    })));
    const weekly = buildWeeklyIntelligence('2026-08-24', [daily], [{ id: 1, title: 'Research', priorityRank: 1, status: 'active' }]);
    expect(weekly.output === 'produced').toBe(shouldOutput);
    expect(weekly.evidenceFactIds).toEqual(daily.evidenceFactIds);
    expect(JSON.stringify(weekly)).not.toMatch(/messageCount|transcript|rawMessage/i);
  });

  it('allows high progress with supporting alignment and a rest day without inventing drift', () => {
    const daily = buildDailyDigest('2026-08-30', [{ id: 1, category: 'learning', summary: 'systems learning', outputState: 'not_applicable', explorationState: 'explored' }]);
    const weekly = buildWeeklyIntelligence('2026-08-24', [daily], [{ id: 1, title: 'Paper', priorityRank: 1, status: 'active' }]);
    expect(weekly.progress).toBe('unknown');
    expect(weekly.exploration).toBe('explored');
    expect(weekly.opportunityCost).not.toBe('evidenced');
  });
});
