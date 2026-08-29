export const REVIEW_AUTOSAVE_MS = 350;

export type ReviewSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export type ReviewSaveCoordinatorDeps = {
  persist: (dateKey: string, content: string) => Promise<void>;
  debounceMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

type DateSlot = {
  pending: string | undefined;
  run: Promise<void> | null;
  timer: ReturnType<typeof setTimeout> | null;
  status: ReviewSaveStatus;
};

/**
 * Per-date diary persist queue.
 * persistTargetDate is the dateKey passed into schedule()/flush() — never today().
 */
export function createReviewSaveCoordinator(deps: ReviewSaveCoordinatorDeps) {
  const debounceMs = deps.debounceMs ?? REVIEW_AUTOSAVE_MS;
  const setTimeoutFn = deps.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = deps.clearTimeoutFn ?? clearTimeout;
  const slots = new Map<string, DateSlot>();
  const listeners = new Set<(dateKey: string, status: ReviewSaveStatus) => void>();

  function ensure(dateKey: string): DateSlot {
    let slot = slots.get(dateKey);
    if (!slot) {
      slot = { pending: undefined, run: null, timer: null, status: 'idle' };
      slots.set(dateKey, slot);
    }
    return slot;
  }

  function emit(dateKey: string, status: ReviewSaveStatus) {
    ensure(dateKey).status = status;
    listeners.forEach((listener) => listener(dateKey, status));
  }

  function clearTimer(slot: DateSlot) {
    if (slot.timer !== null) {
      clearTimeoutFn(slot.timer);
      slot.timer = null;
    }
  }

  async function drain(dateKey: string): Promise<void> {
    const slot = ensure(dateKey);
    clearTimer(slot);

    if (slot.run) {
      try {
        await slot.run;
      } catch {
        // Previous attempt already recorded error + dirty. Continue if still pending.
      }
    }

    if (slot.pending === undefined) {
      return;
    }

    const run = (async () => {
      while (slot.pending !== undefined) {
        const content = slot.pending;
        slot.pending = undefined;
        emit(dateKey, 'saving');
        try {
          await deps.persist(dateKey, content);
        } catch {
          if (slot.pending === undefined) {
            slot.pending = content;
          }
          emit(dateKey, 'error');
          return;
        }
      }
      emit(dateKey, 'saved');
    })();

    slot.run = run;
    try {
      await run;
    } finally {
      if (slot.run === run) {
        slot.run = null;
      }
    }
  }

  function schedule(dateKey: string, content: string) {
    const slot = ensure(dateKey);
    slot.pending = content;
    emit(dateKey, 'dirty');
    clearTimer(slot);
    slot.timer = setTimeoutFn(() => {
      slot.timer = null;
      void drain(dateKey);
    }, debounceMs);
  }

  async function flush(dateKey: string): Promise<boolean> {
    try {
      await drain(dateKey);
      return ensure(dateKey).status !== 'error';
    } catch {
      return false;
    }
  }

  async function flushAll(): Promise<void> {
    const keys = [...slots.keys()];
    for (const dateKey of keys) {
      await flush(dateKey);
    }
  }

  function isDirty(dateKey: string): boolean {
    const slot = slots.get(dateKey);
    if (!slot) {
      return false;
    }
    return slot.pending !== undefined || slot.run !== null || slot.status === 'error';
  }

  function status(dateKey: string): ReviewSaveStatus {
    return slots.get(dateKey)?.status ?? 'idle';
  }

  function onStatus(listener: (dateKey: string, status: ReviewSaveStatus) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function dispose() {
    slots.forEach((slot) => clearTimer(slot));
    listeners.clear();
  }

  return {
    schedule,
    flush,
    flushAll,
    isDirty,
    status,
    onStatus,
    dispose,
  };
}
