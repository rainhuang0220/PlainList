const HOUR_WORDS: Record<string, number> = {
  '凌晨': 3,
  '清晨': 7,
  '早上': 8,
  '早晨': 8,
  '上午': 10,
  '中午': 12,
  '下午': 14,
  '傍晚': 18,
  '晚上': 20,
  '夜里': 22,
  '深夜': 23,
  '半夜': 0,
};

const CN_DIGITS: Record<string, number> = {
  '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '俩': 2,
  '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
};

export interface TimeRange {
  start: string;
  end: string;
  label: string;
}

export interface DurationTask {
  label: string;
  hours: number;
}

export interface ScheduleContext {
  occupied: TimeRange[];
  durations: DurationTask[];
}

export interface SegmentAnnotation {
  index: number;
  text: string;
  time: string | null;
  range: TimeRange | null;
  durationHours: number | null;
}

function parseChineseHour(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const digits = Number(trimmed);
    return Number.isFinite(digits) ? digits : null;
  }
  if (trimmed === '十') return 10;
  if (trimmed.startsWith('十')) {
    const tail = CN_DIGITS[trimmed.slice(1)];
    return tail === undefined ? null : 10 + tail;
  }
  if (trimmed.endsWith('十')) {
    const head = CN_DIGITS[trimmed.slice(0, -1)];
    return head === undefined ? null : head * 10;
  }
  if (trimmed.includes('十')) {
    const [headChar, tailChar] = trimmed.split('十');
    const head = CN_DIGITS[headChar];
    const tail = CN_DIGITS[tailChar];
    if (head === undefined || tail === undefined) return null;
    return head * 10 + tail;
  }
  if (CN_DIGITS[trimmed] !== undefined) return CN_DIGITS[trimmed];
  return null;
}

export function parseIntakeHour(value: string): number | null {
  return parseChineseHour(value);
}

export function formatTime(hour: number, minute = 0): string {
  const safeHour = ((hour % 24) + 24) % 24;
  const safeMinute = Math.min(Math.max(minute, 0), 59);
  return `${String(safeHour).padStart(2, '0')}:${String(safeMinute).padStart(2, '0')}`;
}

function applyPeriod(hour: number, period?: string): number {
  if (!period || HOUR_WORDS[period] === undefined) {
    return hour;
  }

  const periodHour = HOUR_WORDS[period];
  if (periodHour >= 12 && hour < 12) {
    return hour + 12;
  }
  if (periodHour < 6 && hour >= 12) {
    return hour - 12;
  }
  return hour;
}

function normalizeEndHour(startHour: number, endHour: number): number {
  if (endHour < startHour && endHour <= 12) {
    return endHour + 12;
  }
  return endHour;
}

export function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export function addHoursToTime(time: string, hours: number): string {
  const total = timeToMinutes(time) + hours * 60;
  return formatTime(Math.floor(total / 60) % 24, total % 60);
}

function extractActivityLabel(segment: string): string {
  const cleaned = segment
    .replace(/(?:从|自)?\s*(?:凌晨|清晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里|深夜|半夜)?\s*[0-9一二两俩三四五六七八九十]{1,3}\s*(?:点|时|:|：)[^，。；;]*/g, '')
    .replace(/(?:打到|持续到|直到|至)\s*(?:凌晨|清晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里|深夜|半夜)?\s*[0-9一二两俩三四五六七八九十]{1,3}\s*(?:点|时)/g, '')
    .replace(/[，,。；;]/g, '')
    .trim();
  return cleaned.slice(0, 24) || '事项';
}

export function splitIntakeSegments(text: string): string[] {
  return text
    .split(/[。；;\n]+/)
    .flatMap((chunk) => chunk.split(/，(?=[^，]{2,})/))
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 2);
}

export function detectTimeRange(segment: string): TimeRange | null {
  const isoRange = segment.match(/(\d{1,2}):(\d{2})\s*(?:到|至|-|~|—)\s*(\d{1,2}):(\d{2})/);
  if (isoRange) {
    const startHour = Number(isoRange[1]);
    const startMinute = Number(isoRange[2]);
    const endHour = Number(isoRange[3]);
    const endMinute = Number(isoRange[4]);
    if (startHour < 24 && endHour < 24 && startMinute < 60 && endMinute < 60) {
      return {
        start: formatTime(startHour, startMinute),
        end: formatTime(endHour, endMinute),
        label: extractActivityLabel(segment),
      };
    }
  }

  const cnRange = segment.match(
    /(凌晨|清晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里|深夜|半夜)?\s*([0-9一二两俩三四五六七八九十]{1,3})\s*(?:点|时|:|：)\s*(?:半|钟)?\s*(?:到|至|-|~|—|打到|持续到|直到)\s*(凌晨|清晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里|深夜|半夜)?\s*([0-9一二两俩三四五六七八九十]{1,3})\s*(?:点|时|点钟)?/,
  );
  if (cnRange) {
    const startRaw = parseChineseHour(cnRange[2]);
    const endRaw = parseChineseHour(cnRange[4]);
    if (startRaw !== null && endRaw !== null) {
      const startHour = applyPeriod(startRaw, cnRange[1]);
      let endHour = applyPeriod(endRaw, cnRange[3] ?? cnRange[1]);
      endHour = normalizeEndHour(startHour, endHour);
      return {
        start: formatTime(startHour),
        end: formatTime(endHour),
        label: extractActivityLabel(segment),
      };
    }
  }

  const looseRange = segment.match(
    /(凌晨|清晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里|深夜|半夜)?\s*([0-9一二两俩三四五六七八九十]{1,3})\s*(?:点|时|点钟).*?(?:打到|持续到|直到|至)\s*(凌晨|清晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里|深夜|半夜)?\s*([0-9一二两俩三四五六七八九十]{1,3})\s*(?:点|时|点钟)?/,
  );
  if (looseRange) {
    const startRaw = parseChineseHour(looseRange[2]);
    const endRaw = parseChineseHour(looseRange[4]);
    if (startRaw !== null && endRaw !== null) {
      const startHour = applyPeriod(startRaw, looseRange[1]);
      let endHour = applyPeriod(endRaw, looseRange[3] ?? looseRange[1]);
      endHour = normalizeEndHour(startHour, endHour);
      return {
        start: formatTime(startHour),
        end: formatTime(endHour),
        label: extractActivityLabel(segment),
      };
    }
  }

  return null;
}

export function detectDurationHours(segment: string): number | null {
  if (!/(选满|干满|做满|学满|练满|刷满|连续|持续|学习|学|练|刷|打|玩|至少|不少于)/.test(segment)) {
    return null;
  }

  const atLeastMatch = segment.match(
    /(?:至少|不少于)\s*([0-9一二两俩三四五六七八九十]{1,2})\s*(?:个)?\s*(?:小时|钟头|h)/i,
  );
  if (atLeastMatch) {
    const hours = parseChineseHour(atLeastMatch[1]);
    if (hours !== null && hours > 0 && hours <= 12) {
      return hours;
    }
  }

  const match = segment.match(
    /([0-9一二两俩三四五六七八九十]{1,2})\s*(?:个)?\s*(?:小时|钟头|h)/i,
  );
  if (!match) {
    return null;
  }

  const hours = parseChineseHour(match[1]);
  if (hours === null || hours <= 0 || hours > 12) {
    return null;
  }

  return hours;
}

export function detectTime(segment: string): string | null {
  const isoMatch = segment.match(/(\d{1,2}):(\d{2})/);
  if (isoMatch) {
    const hour = Number(isoMatch[1]);
    const minute = Number(isoMatch[2]);
    if (Number.isFinite(hour) && Number.isFinite(minute) && hour < 24 && minute < 60) {
      return formatTime(hour, minute);
    }
  }

  const rangeMatch = segment.match(/([0-9一二两俩三四五六七八九十]{1,3})\s*(?:到|至|-)\s*([0-9一二两俩三四五六七八九十]{1,3})\s*(?:点|时)/);
  if (rangeMatch) {
    const start = parseChineseHour(rangeMatch[1]);
    if (start !== null) {
      const period = segment.match(/(凌晨|清晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里|深夜|半夜)/)?.[1];
      let hour = start;
      if (period && HOUR_WORDS[period] >= 12 && hour < 12) hour += 12;
      if (period && HOUR_WORDS[period] < 6 && hour >= 12) hour -= 12;
      return formatTime(hour);
    }
  }

  const fuzzyMatch = segment.match(/([0-9一二两俩三四五六七八九十]{1,2})\s*([0-9一二两俩三四五六七八九十]{1,2})\s*点/);
  if (fuzzyMatch && fuzzyMatch[1] !== fuzzyMatch[2]) {
    const a = parseChineseHour(fuzzyMatch[1]);
    const b = parseChineseHour(fuzzyMatch[2]);
    if (a !== null && b !== null && Math.abs(b - a) === 1) {
      const period = segment.match(/(凌晨|清晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里|深夜|半夜)/)?.[1];
      let hour = a;
      if (period && HOUR_WORDS[period] >= 12 && hour < 12) hour += 12;
      return formatTime(hour);
    }
  }

  let modifier = 0;
  for (const [hint, base] of Object.entries(HOUR_WORDS)) {
    if (segment.includes(hint)) {
      modifier = base;
      break;
    }
  }

  const hourMatch = segment.match(/(凌晨|清晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里|深夜|半夜)?\s*([0-9一二两俩三四五六七八九十]{1,3})\s*(?:点|时|:|：)\s*([0-9一二两俩三四五六七八九十半]{0,3})?/);
  if (hourMatch) {
    let hour = parseChineseHour(hourMatch[2]);
    let minute = 0;
    const minuteRaw = hourMatch[3]?.trim();
    if (minuteRaw === '半') {
      minute = 30;
    } else if (minuteRaw && minuteRaw !== '钟' && minuteRaw !== '整') {
      const parsedMinute = parseChineseHour(minuteRaw);
      if (parsedMinute !== null && parsedMinute < 60) minute = parsedMinute;
    }

    if (hour !== null) {
      const period = hourMatch[1];
      if (period && HOUR_WORDS[period] !== undefined) {
        const periodHour = HOUR_WORDS[period];
        if (periodHour >= 12 && hour < 12) hour += 12;
        if (periodHour < 6 && hour >= 12) hour -= 12;
      }
      return formatTime(hour, minute);
    }
  }

  if (modifier) return formatTime(modifier);

  const englishMatch = segment.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (englishMatch) {
    let hour = Number(englishMatch[1]);
    const minute = englishMatch[2] ? Number(englishMatch[2]) : 0;
    const meridiem = englishMatch[3].toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return formatTime(hour, minute);
  }

  return null;
}

export function findOpenSlot(
  occupied: TimeRange[],
  durationHours: number,
): { start: string; end: string } | null {
  const sorted = [...occupied].sort((left, right) => timeToMinutes(left.start) - timeToMinutes(right.start));
  const need = durationHours * 60;
  const dayStart = 8 * 60;
  const dayEnd = 23 * 60;
  let cursor = dayStart;

  const gaps: Array<{ start: number; end: number }> = [];
  for (const block of sorted) {
    const blockStart = timeToMinutes(block.start);
    const blockEnd = timeToMinutes(block.end);
    if (blockStart - cursor >= need) {
      gaps.push({ start: cursor, end: blockStart });
    }
    cursor = Math.max(cursor, blockEnd);
  }

  if (dayEnd - cursor >= need) {
    gaps.push({ start: cursor, end: dayEnd });
  }

  const gap = gaps[0];
  if (!gap) {
    return null;
  }

  const start = formatTime(Math.floor(gap.start / 60), gap.start % 60);
  return { start, end: addHoursToTime(start, durationHours) };
}

export function parseScheduleContext(text: string): ScheduleContext {
  const segments = splitIntakeSegments(text);
  const occupied: TimeRange[] = [];
  const durations: DurationTask[] = [];

  for (const segment of segments) {
    const range = detectTimeRange(segment);
    if (range) {
      occupied.push(range);
      continue;
    }

    const hours = detectDurationHours(segment);
    if (hours) {
      durations.push({ label: extractActivityLabel(segment) || '连续任务', hours });
    }
  }

  return { occupied, durations };
}

export function parseSegmentAnnotations(text: string): SegmentAnnotation[] {
  return splitIntakeSegments(text).map((segment, index) => ({
    index,
    text: segment,
    time: detectTime(segment),
    range: detectTimeRange(segment),
    durationHours: detectDurationHours(segment),
  }));
}
