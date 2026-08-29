import { msUntilNextLocalMidnight, toDateKey } from '@plainlist/shared';

export type LocalDayClockDeps = {
  now?: () => Date;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

export function createLocalDayClock(deps: LocalDayClockDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const setTimeoutFn = deps.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = deps.clearTimeoutFn ?? clearTimeout;

  let currentKey = toDateKey(now());
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<(dateKey: string) => void>();

  function todayKey(): string {
    return toDateKey(now());
  }

  function clearTimer() {
    if (timer !== null) {
      clearTimeoutFn(timer);
      timer = null;
    }
  }

  function scheduleMidnight() {
    clearTimer();
    const wait = msUntilNextLocalMidnight(now());
    const delay = wait > 0 ? wait : 24 * 60 * 60 * 1000;
    timer = setTimeoutFn(() => {
      timer = null;
      handleForeground();
    }, delay);
  }

  function handleForeground() {
    const next = todayKey();
    if (next !== currentKey) {
      currentKey = next;
      listeners.forEach((listener) => listener(next));
    }
    scheduleMidnight();
  }

  function start() {
    currentKey = todayKey();
    scheduleMidnight();
  }

  function stop() {
    clearTimer();
  }

  function subscribe(listener: (dateKey: string) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    todayKey,
    currentKey: () => currentKey,
    handleForeground,
    start,
    stop,
    subscribe,
  };
}

export type LocalDayClock = ReturnType<typeof createLocalDayClock>;

let appClock: LocalDayClock | undefined;

export function getAppDayClock(): LocalDayClock {
  if (!appClock) {
    appClock = createLocalDayClock();
  }
  return appClock;
}

export function resetAppDayClockForTests(): void {
  appClock?.stop();
  appClock = undefined;
}
