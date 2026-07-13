import { describe, expect, it } from 'vitest';
import { applyScheduleCorrections, buildScheduleHints, detectTimeRange, findOpenSlot } from './scheduleHints';

describe('detectTimeRange', () => {
  it('parses 10点到2点 as 10:00-14:00', () => {
    expect(detectTimeRange('早上10点钟打游戏打到2点钟')).toEqual({
      start: '10:00',
      end: '14:00',
      label: expect.any(String),
    });
  });
});

describe('findOpenSlot', () => {
  it('places 5h study after 10:00-14:00 gaming block', () => {
    const slot = findOpenSlot([{ start: '10:00', end: '14:00', label: '打游戏' }], 5);
    expect(slot).toEqual({ start: '14:00', end: '19:00' });
  });
});

describe('buildScheduleHints', () => {
  it('suggests non-overlapping study block', () => {
    const hint = buildScheduleHints('早上10点打游戏打到2点，还要选满5个小时学习');
    expect(hint).toContain('10:00-14:00');
    expect(hint).toContain('14:00-19:00');
    expect(hint).toContain('禁止插入');
  });
});

describe('applyScheduleCorrections', () => {
  it('moves overlapping 5h study out of gaming block', () => {
    const text = '早上10点打游戏打到2点，还要选满5个小时学习';
    const corrected = applyScheduleCorrections(text, [
      { name: '学习五小时', type: 'todo', time: '09:00', note: '连续5小时', order: 1 },
      { name: '打游戏', type: 'todo', time: '10:00', order: 2 },
    ] as never);

    const study = corrected.find((item) => item.name.includes('学'));
    expect(study?.time).toBe('14:00');
    expect(study?.why).toBe('19:00');
  });

  it('splits CS around 10:00 course registration', () => {
    const corrected = applyScheduleCorrections('', [
      { name: '早场打CS 5小时', type: 'todo', time: '09:00', note: '连续5小时', why: '14:00', order: 1 },
      { name: '抢选修课', type: 'todo', time: '10:00', priority: 'high', order: 2 },
      { name: '分段学习至少5小时', type: 'todo', time: '14:00', note: '连续5小时', why: '19:00', priority: 'high', order: 3 },
      { name: '吃午饭', type: 'habit', time: '14:00', order: 4 },
      { name: '吃晚饭', type: 'habit', time: '20:00', order: 5 },
    ] as never);

    expect(corrected.map((item) => `${item.time} ${item.name}`)).toEqual([
      '09:00 早场打CS 5小时',
      '10:00 抢选修课',
      '10:00 早场打CS 5小时（续）',
      '13:00 吃午饭',
      '14:00 分段学习至少5小时',
      '20:00 吃晚饭',
    ]);

    const csTail = corrected.find((item) => item.name.includes('续'));
    expect(csTail?.why).toBe('14:00');
  });
});
