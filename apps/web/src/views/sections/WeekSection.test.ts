import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

const weekSectionPath = resolve(__dirname, 'WeekSection.vue');

describe('WeekSection AI summary layout', () => {
  it('renders summary blocks as regular flow content, not page sections', () => {
    const source = readFileSync(weekSectionPath, 'utf8');
    const { descriptor } = parse(source, { filename: weekSectionPath });
    const template = descriptor.template?.content ?? '';

    expect(template).not.toMatch(/<section\s+class="week-ai-block"/);
  });

  it('loads persisted weekly intelligence without triggering generation from the page', () => {
    const source = readFileSync(weekSectionPath, 'utf8');

    expect(source).toContain("api.get(`/activity/weekly?weekStart=${durationFrom.value}`)");
    expect(source).not.toContain("api.post('/activity/weekly/generate'");
  });
});
