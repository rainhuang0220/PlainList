import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'PlansSection.vue'), 'utf8');

describe('PlansSection daily journal surface', () => {
  it('does not embed Daily AI Journal articles in the handwritten review pane', () => {
    expect(source).not.toContain('ChatgptDailyJournal');
  });
});
