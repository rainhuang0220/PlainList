import type { AiIntakeItem } from '../types';
import {
  addHoursToTime,
  findOpenSlot,
  parseScheduleContext,
  timeToMinutes,
  type TimeRange,
} from './scheduleParse';

export type TimelineBlockKind = 'occupied' | 'suggested' | 'item' | 'point';

export interface TimelineBlock {
  id: string;
  kind: TimelineBlockKind;
  label: string;
  start: string;
  end: string;
  meta?: string;
  priority?: string;
}

export const DAY_VIEW_START = 8 * 60;
export const DAY_VIEW_END = 23 * 60;

export const SEGMENT_PALETTE = [
  '#2d6a4f',
  '#1d3557',
  '#b5651d',
  '#6a4c93',
  '#bc4749',
  '#0077b6',
  '#9b2226',
  '#386641',
];

export function minutesToPercent(minutes: number, dayStart = DAY_VIEW_START, dayEnd = DAY_VIEW_END): number {
  const span = dayEnd - dayStart;
  return Math.min(100, Math.max(0, ((minutes - dayStart) / span) * 100));
}

export function blockWidthPercent(start: string, end: string, dayStart = DAY_VIEW_START, dayEnd = DAY_VIEW_END): number {
  const left = minutesToPercent(timeToMinutes(start), dayStart, dayEnd);
  const right = minutesToPercent(timeToMinutes(end), dayStart, dayEnd);
  return Math.max(1.5, right - left);
}

export function blockLeftPercent(start: string, dayStart = DAY_VIEW_START, dayEnd = DAY_VIEW_END): number {
  return minutesToPercent(timeToMinutes(start), dayStart, dayEnd);
}

function itemEndTime(item: Pick<AiIntakeItem, 'time' | 'why' | 'note'>): string {
  if (item.why && /^\d{2}:\d{2}$/.test(item.why)) {
    return item.why;
  }
  const continuous = item.note?.match(/连续\s*([0-9一二两俩三四五六七八九十]{1,2})\s*小时/);
  if (continuous) {
    const hours = Number(continuous[1]) || 1;
    return addHoursToTime(item.time, hours);
  }
  return addHoursToTime(item.time, 0.5);
}

export function buildTimelineBlocksFromItems(items: AiIntakeItem[]): TimelineBlock[] {
  return [...items]
    .sort((left, right) => {
      const leftOrder = left.order ?? 99;
      const rightOrder = right.order ?? 99;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.time.localeCompare(right.time);
    })
    .map((item, index) => {
      const end = itemEndTime(item);
      const duration = timeToMinutes(end) - timeToMinutes(item.time);
      const isPoint = duration <= 30;
      return {
        id: `item-${item.order ?? index}`,
        kind: isPoint ? 'point' : 'item',
        label: item.name,
        start: item.time,
        end: isPoint ? addHoursToTime(item.time, 0.5) : end,
        meta: [item.note, item.why].filter(Boolean).join(' · ') || undefined,
        priority: item.priority,
      };
    });
}

/** @deprecated Use buildTimelineBlocksFromItems for UI viz — only shows final list items. */
export function buildTimelineBlocks(text: string, items: AiIntakeItem[] = []): TimelineBlock[] {
  if (items.length > 0) {
    return buildTimelineBlocksFromItems(items);
  }

  const { occupied, durations } = parseScheduleContext(text);
  const blocks: TimelineBlock[] = [];

  for (const [index, block] of occupied.entries()) {
    blocks.push({
      id: `occupied-${index}`,
      kind: 'occupied',
      label: block.label,
      start: block.start,
      end: block.end,
      meta: '固定占用',
    });
  }

  for (const [index, task] of durations.entries()) {
    const slot = findOpenSlot(occupied, task.hours);
    if (slot) {
      blocks.push({
        id: `suggested-${index}`,
        kind: 'suggested',
        label: task.label,
        start: slot.start,
        end: slot.end,
        meta: `建议空档 · 连续${task.hours}小时`,
      });
    }
  }

  for (const [index, item] of items.entries()) {
    const end = itemEndTime(item);
    const isPoint = end === item.time || timeToMinutes(end) - timeToMinutes(item.time) <= 30;
    blocks.push({
      id: `item-${index}-${item.order ?? 0}`,
      kind: isPoint ? 'point' : 'item',
      label: item.name,
      start: item.time,
      end: isPoint ? addHoursToTime(item.time, 0.5) : end,
      meta: item.note || item.why || undefined,
      priority: item.priority,
    });
  }

  return blocks.sort((left, right) => timeToMinutes(left.start) - timeToMinutes(right.start));
}

export interface ProcessedItemCard {
  order: number;
  name: string;
  time: string;
  endTime?: string;
  type: AiIntakeItem['type'];
  note?: string;
  priority?: string;
}

export function buildProcessedItemCards(items: AiIntakeItem[]): ProcessedItemCard[] {
  return [...items]
    .sort((left, right) => {
      const leftOrder = left.order ?? 99;
      const rightOrder = right.order ?? 99;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.time.localeCompare(right.time);
    })
    .map((item) => ({
      order: item.order ?? 0,
      name: item.name,
      time: item.time,
      endTime: item.why && /^\d{2}:\d{2}$/.test(item.why) ? item.why : undefined,
      type: item.type,
      note: item.note,
      priority: item.priority,
    }));
}

export function timeToTodayMs(time: string, referenceDate = new Date()): number {
  const [hour, minute] = time.split(':').map(Number);
  const date = new Date(referenceDate);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

export function dayViewportBounds(referenceDate = new Date()): { min: number; max: number } {
  const start = new Date(referenceDate);
  start.setHours(8, 0, 0, 0);
  const end = new Date(referenceDate);
  end.setHours(23, 0, 0, 0);
  return { min: start.getTime(), max: end.getTime() };
}

export function occupiedRangesFromContext(occupied: TimeRange[]): TimeRange[] {
  return [...occupied].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
}
