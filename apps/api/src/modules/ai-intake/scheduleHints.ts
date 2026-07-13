import {
  addHoursToTime,
  detectDurationHours,
  detectTimeRange,
  findOpenSlot,
  formatTime,
  parseIntakeHour,
  parseScheduleContext,
  timeToMinutes,
  type DurationTask,
  type ScheduleContext,
  type TimeRange,
} from '@plainlist/shared';

export type { DurationTask, ScheduleContext, TimeRange };
export {
  detectDurationHours,
  detectTimeRange,
  findOpenSlot,
  parseScheduleContext,
};

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
}

function labelsLikelyMatch(left: string, right: string): boolean {
  const normalize = (value: string) => value.replace(/[还要选满干做学练刷个]/g, '').trim();
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const aChars = [...a].filter((char) => char.length > 0);
  return aChars.some((char) => b.includes(char) && char !== '事');
}

export function buildScheduleHints(text: string): string | null {
  const { occupied, durations } = parseScheduleContext(text);

  if (occupied.length === 0 && durations.length === 0) {
    return null;
  }

  const lines = ['【日程排布参考（必须遵守，避免时段冲突）】'];

  if (occupied.length > 0) {
    lines.push('已占用时段（这些时间内禁止插入其他事项）：');
    for (const block of occupied) {
      lines.push(`- ${block.start}-${block.end} ${block.label}（固定占用）`);
    }
  }

  for (const task of durations) {
    const slot = findOpenSlot(occupied, task.hours);
    if (slot) {
      lines.push(
        `- 「${task.label}」连续 ${task.hours} 小时 → 建议 ${slot.start}-${slot.end}（note=连续${task.hours}小时，why=不与已占用时段重叠）`,
      );
    } else {
      lines.push(
        `- 「${task.label}」连续 ${task.hours} 小时 → 需找不重叠空档；禁止塞进已占用时段中间`,
      );
    }
  }

  lines.push(
    '排程原则：先固定「X点到Y点」的占用块；连续N小时若与中间定点事项（如10点抢课）冲突，必须拆成多条（如09:00-10:00 + 10:00抢课 + 10:00-14:00续做）；其余连续时长整块放进空档；duration 的 time=段开始，why=段结束。',
  );

  return lines.join('\n');
}

function minutesToTime(minutes: number): string {
  return formatTime(Math.floor(minutes / 60), minutes % 60);
}

function parseItemDurationHours(item: { name: string; note?: string; why?: string }): number | null {
  const source = `${item.name} ${item.note ?? ''} ${item.why ?? ''}`;
  const continuous = source.match(/连续\s*([0-9一二两俩三四五六七八九十]{1,2})\s*小时/);
  if (continuous) {
    return parseIntakeHour(continuous[1]);
  }

  const atLeast = source.match(/(?:至少|不少于)\s*([0-9一二两俩三四五六七八九十]{1,2})\s*小时/);
  if (atLeast) {
    return parseIntakeHour(atLeast[1]);
  }

  const plain = source.match(/([0-9一二两俩三四五六七八九十]{1,2})\s*小时/);
  if (plain && /学|练|刷|打|玩|CS|cs/i.test(source)) {
    return parseIntakeHour(plain[1]);
  }

  return null;
}

function parseEndTimeFromWhy(why?: string): number | null {
  if (!why) {
    return null;
  }
  const match = why.match(/(\d{2}:\d{2})/);
  return match ? timeToMinutes(match[1]) : null;
}

function isDurationItem(item: { name: string; note?: string; why?: string }): boolean {
  return parseItemDurationHours(item) !== null;
}

function getDurationRange(item: { name: string; time: string; note?: string; why?: string }): { start: number; end: number; hours: number } | null {
  const hours = parseItemDurationHours(item);
  if (hours === null) {
    return null;
  }

  const start = timeToMinutes(item.time);
  const endFromWhy = parseEndTimeFromWhy(item.why);
  const end = endFromWhy !== null && endFromWhy > start ? endFromWhy : start + hours * 60;
  return { start, end, hours };
}

function isHabitLike(item: { name: string; type?: string }): boolean {
  return item.type === 'habit' || /午饭|晚饭|早餐|洗澡|睡觉|休息/.test(item.name);
}

function itemsLikelySameActivity(left: { name: string }, right: { name: string }): boolean {
  return labelsLikelyMatch(left.name, right.name);
}

function splitDurationAroundFixedTasks<T extends {
  name: string;
  time: string;
  type?: string;
  priority?: string;
  why?: string;
  note?: string;
  order?: number;
}>(items: T[]): T[] {
  const durationIndexes = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isDurationItem(item));

  if (durationIndexes.length === 0) {
    return items;
  }

  const removed = new Set<number>();
  const additions: T[] = [];

  for (const { item: durationItem, index: durationIndex } of durationIndexes) {
    const range = getDurationRange(durationItem);
    if (!range) {
      continue;
    }

    const interrupts = items
      .map((item, index) => ({ item, index }))
      .filter(({ item, index }) => {
        if (index === durationIndex || removed.has(index) || isDurationItem(item)) {
          return false;
        }
        if (itemsLikelySameActivity(item, durationItem)) {
          return false;
        }
        const interruptAt = timeToMinutes(item.time);
        return interruptAt > range.start && interruptAt < range.end;
      })
      .sort((left, right) => timeToMinutes(left.item.time) - timeToMinutes(right.item.time));

    if (interrupts.length === 0) {
      continue;
    }

    removed.add(durationIndex);
    let cursor = range.start;
    let part = 1;
    const baseName = durationItem.name
      .replace(/（续）/g, '')
      .replace(/\s*连续.*/g, '')
      .trim();

    for (const { item: interrupt } of interrupts) {
      const interruptAt = timeToMinutes(interrupt.time);
      if (interruptAt > cursor) {
        additions.push({
          ...durationItem,
          name: part === 1 ? durationItem.name : `${baseName}（续）`,
          time: minutesToTime(cursor),
          why: minutesToTime(interruptAt),
          note: part === 1
            ? durationItem.note ?? `连续${range.hours}小时`
            : `续至${minutesToTime(interruptAt)}`,
        });
        part += 1;
      }
      cursor = interruptAt;
    }

    const tailEnd = range.end;
    if (cursor < tailEnd) {
      additions.push({
        ...durationItem,
        name: part === 1 ? durationItem.name : `${baseName}（续）`,
        time: minutesToTime(cursor),
        why: minutesToTime(tailEnd),
        note: part === 1
          ? durationItem.note ?? `连续${range.hours}小时`
          : `续至${minutesToTime(tailEnd)}`,
      });
    }
  }

  if (removed.size === 0) {
    return items;
  }

  const kept = items.filter((_, index) => !removed.has(index));
  return [...kept, ...additions];
}

function resolveSameTimeConflicts<T extends {
  name: string;
  time: string;
  type?: string;
  priority?: string;
  why?: string;
  note?: string;
  order?: number;
}>(items: T[]): T[] {
  const corrected = items.map((item) => ({ ...item }));
  const priorityRank = (priority?: string) => {
    if (priority === 'high') return 3;
    if (priority === 'low') return 1;
    return 2;
  };

  for (let index = 0; index < corrected.length; index += 1) {
    const current = corrected[index];
    const currentStart = timeToMinutes(current.time);
    const currentEnd = isDurationItem(current)
      ? (getDurationRange(current)?.end ?? currentStart + 30)
      : currentStart + 30;

    const conflicts = corrected
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter(({ item, itemIndex }) => {
        if (itemIndex === index) {
          return false;
        }
        const otherStart = timeToMinutes(item.time);
        return otherStart >= currentStart && otherStart < currentEnd;
      });

    for (const { item: other, itemIndex: otherIndex } of conflicts) {
      if (other.time !== current.time) {
        continue;
      }

      const moveHabit = isHabitLike(other) && !isHabitLike(current);
      const moveLowerPriority = !isDurationItem(current)
        && !isDurationItem(other)
        && priorityRank(other.priority) < priorityRank(current.priority);

      if (moveHabit || moveLowerPriority) {
        const bumped = moveHabit
          ? Math.max(8 * 60, currentStart - 60)
          : Math.max(8 * 60, currentEnd);
        corrected[otherIndex].time = minutesToTime(bumped);
        if (corrected[otherIndex].why && /^\d{2}:\d{2}$/.test(corrected[otherIndex].why!)) {
          const whyMinutes = timeToMinutes(corrected[otherIndex].why!);
          if (whyMinutes <= bumped) {
            corrected[otherIndex].why = minutesToTime(bumped + 60);
          }
        }
      }
    }
  }

  return corrected;
}

export function applyScheduleCorrections<T extends {
  name: string;
  time: string;
  type?: string;
  priority?: string;
  why?: string;
  note?: string;
  order?: number;
}>(text: string, items: T[]): T[] {
  const { occupied, durations } = parseScheduleContext(text);
  let corrected = items.map((item) => ({ ...item }));

  if (occupied.length > 0 || durations.length > 0) {
    for (const block of occupied) {
      const blockStart = timeToMinutes(block.start);
      const blockEnd = timeToMinutes(block.end);
      const matchIdx = corrected.findIndex((item) => {
        const itemStart = timeToMinutes(item.time);
        return labelsLikelyMatch(item.name, block.label)
          || (itemStart >= blockStart - 30 && itemStart < blockEnd);
      });

      if (matchIdx >= 0) {
        corrected[matchIdx].time = block.start;
        corrected[matchIdx].why = block.end;
      }
    }

    for (const task of durations) {
      const matchIdx = corrected.findIndex((item) => {
        const note = item.note ?? '';
        const hasDurationNote = /连续.*小时|小时/.test(note);
        return hasDurationNote || labelsLikelyMatch(item.name, task.label);
      });
      if (matchIdx < 0) {
        continue;
      }

      const item = corrected[matchIdx];
      const startMin = timeToMinutes(item.time);
      const endMin = startMin + task.hours * 60;
      const overlaps = occupied.some((block) =>
        rangesOverlap(startMin, endMin, timeToMinutes(block.start), timeToMinutes(block.end)),
      );

      if (overlaps) {
        const slot = findOpenSlot(occupied, task.hours);
        if (slot) {
          item.time = slot.start;
          item.why = slot.end;
          item.note = `连续${task.hours}小时`;
        }
      } else {
        item.note = item.note?.includes('连续') ? item.note : `连续${task.hours}小时`;
        if (!item.why) {
          item.why = addHoursToTime(item.time, task.hours);
        }
      }
    }
  }

  corrected = splitDurationAroundFixedTasks(corrected);
  corrected = resolveSameTimeConflicts(corrected);

  corrected.sort((left, right) => {
    const byTime = left.time.localeCompare(right.time);
    if (byTime !== 0) {
      return byTime;
    }
    const leftDuration = isDurationItem(left);
    const rightDuration = isDurationItem(right);
    if (leftDuration !== rightDuration) {
      return leftDuration ? 1 : -1;
    }
    return 0;
  });
  corrected.forEach((item, index) => {
    item.order = index + 1;
  });

  return corrected;
}
