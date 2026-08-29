import { toDateKey } from '@plainlist/shared';
import {
  createReviewSaveCoordinator,
  REVIEW_AUTOSAVE_MS,
  type ReviewSaveStatus,
} from './reviewSaveCoordinator';

export type DailyReviewSessionDeps = {
  now: () => Date;
  persist: (dateKey: string, content: string) => Promise<void>;
  load: (dateKey: string) => Promise<string>;
  debounceMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

/**
 * Owns editingDate for the diary textarea.
 * persist() is always called with the captured editingDate, never with today().
 */
export function createDailyReviewSession(deps: DailyReviewSessionDeps) {
  const save = createReviewSaveCoordinator({
    persist: deps.persist,
    debounceMs: deps.debounceMs ?? REVIEW_AUTOSAVE_MS,
    setTimeoutFn: deps.setTimeoutFn,
    clearTimeoutFn: deps.clearTimeoutFn,
  });

  let currentDate = toDateKey(deps.now());
  let editingDate = currentDate;
  let text = '';
  const listeners = new Set<() => void>();

  function notify() {
    listeners.forEach((listener) => listener());
  }

  function attach(dateKey: string, content: string) {
    currentDate = toDateKey(deps.now());
    editingDate = dateKey;
    text = content;
    notify();
  }

  function noteInput(content: string) {
    text = content;
    save.schedule(editingDate, content);
    notify();
  }

  async function applyNow(): Promise<void> {
    const next = toDateKey(deps.now());
    currentDate = next;
    if (next === editingDate) {
      await save.flush(editingDate);
      notify();
      return;
    }

    const previous = editingDate;
    await save.flush(previous);
    let loaded = '';
    try {
      loaded = await deps.load(next);
    } catch {
      loaded = '';
    }
    editingDate = next;
    text = loaded;
    notify();
  }

  function onChange(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    getCurrentDate: () => currentDate,
    getEditingDate: () => editingDate,
    getText: () => text,
    getStatus: () => save.status(editingDate),
    isDirty: () => save.isDirty(editingDate),
    attach,
    noteInput,
    applyNow,
    flush: () => save.flush(editingDate),
    flushAll: () => save.flushAll(),
    onChange,
    onStatus: save.onStatus,
    dispose: save.dispose,
  };
}
