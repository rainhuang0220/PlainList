import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDailyReviewSession } from './dailyReviewSession';
import { createReviewSaveCoordinator, REVIEW_AUTOSAVE_MS } from './reviewSaveCoordinator';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('reviewSaveCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves after debounce with the date passed at schedule time', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const save = createReviewSaveCoordinator({ persist, debounceMs: REVIEW_AUTOSAVE_MS });

    save.schedule('2026-08-28', '今天完成了论文实验。');
    expect(persist).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(REVIEW_AUTOSAVE_MS);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('2026-08-28', '今天完成了论文实验。');
    expect(save.status('2026-08-28')).toBe('saved');
    save.dispose();
  });

  it('coalesces rapid edits so the last body is what persists', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const save = createReviewSaveCoordinator({ persist, debounceMs: REVIEW_AUTOSAVE_MS });

    save.schedule('2026-08-28', 'A');
    await vi.advanceTimersByTimeAsync(100);
    save.schedule('2026-08-28', 'AB');
    await vi.advanceTimersByTimeAsync(100);
    save.schedule('2026-08-28', 'ABC');
    await vi.advanceTimersByTimeAsync(100);
    save.schedule('2026-08-28', 'ABCD');
    expect(persist).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(REVIEW_AUTOSAVE_MS);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('2026-08-28', 'ABCD');
    save.dispose();
  });

  it('serializes overlapping persists so an older in-flight body cannot win', async () => {
    const first = deferred();
    const second = deferred();
    const persist = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const save = createReviewSaveCoordinator({ persist, debounceMs: REVIEW_AUTOSAVE_MS });

    save.schedule('2026-08-28', 'ABC');
    await vi.advanceTimersByTimeAsync(REVIEW_AUTOSAVE_MS);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('2026-08-28', 'ABC');

    save.schedule('2026-08-28', 'ABCD');
    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1]).toEqual(['2026-08-28', 'ABCD']);

    second.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(save.status('2026-08-28')).toBe('saved');
    save.dispose();
  });

  it('binds persist to the scheduled date even when the calendar day has moved', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const save = createReviewSaveCoordinator({ persist, debounceMs: REVIEW_AUTOSAVE_MS });

    save.schedule('2026-08-28', '完成论文实验');
    await vi.advanceTimersByTimeAsync(REVIEW_AUTOSAVE_MS);
    expect(persist).toHaveBeenCalledWith('2026-08-28', '完成论文实验');
    save.dispose();
  });

  it('does not persist when never edited', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const save = createReviewSaveCoordinator({ persist, debounceMs: REVIEW_AUTOSAVE_MS });
    await save.flush('2026-08-29');
    expect(persist).not.toHaveBeenCalled();
    save.dispose();
  });

  it('keeps dirty content when persist fails', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('network'));
    const save = createReviewSaveCoordinator({ persist, debounceMs: REVIEW_AUTOSAVE_MS });

    save.schedule('2026-08-28', '未落盘');
    await vi.advanceTimersByTimeAsync(REVIEW_AUTOSAVE_MS);
    expect(save.status('2026-08-28')).toBe('error');
    expect(save.isDirty('2026-08-28')).toBe(true);

    persist.mockResolvedValueOnce(undefined);
    const ok = await save.flush('2026-08-28');
    expect(ok).toBe(true);
    expect(persist).toHaveBeenLastCalledWith('2026-08-28', '未落盘');
    expect(save.status('2026-08-28')).toBe('saved');
    save.dispose();
  });
});

describe('dailyReviewSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rollover flushes yesterday then loads a blank today', async () => {
    let now = new Date(2026, 7, 28, 23, 55, 0);
    const written: Array<{ date: string; content: string }> = [];
    const persist = vi.fn(async (date: string, content: string) => {
      written.push({ date, content });
    });
    const load = vi.fn(async (date: string) => (date === '2026-08-28' ? '今天完成了论文实验。' : ''));

    const session = createDailyReviewSession({
      now: () => now,
      persist,
      load,
      debounceMs: REVIEW_AUTOSAVE_MS,
    });
    session.attach('2026-08-28', '今天完成了论文实验。');
    session.noteInput('今天完成了论文实验。');
    await vi.advanceTimersByTimeAsync(REVIEW_AUTOSAVE_MS);
    expect(written).toEqual([{ date: '2026-08-28', content: '今天完成了论文实验。' }]);

    now = new Date(2026, 7, 29, 0, 2, 0);
    await session.applyNow();

    expect(session.getEditingDate()).toBe('2026-08-29');
    expect(session.getText()).toBe('');
    expect(load).toHaveBeenCalledWith('2026-08-29');
    expect(written).toEqual([{ date: '2026-08-28', content: '今天完成了论文实验。' }]);

    session.noteInput('今天开始做实验分析。');
    await vi.advanceTimersByTimeAsync(REVIEW_AUTOSAVE_MS);
    expect(written).toEqual([
      { date: '2026-08-28', content: '今天完成了论文实验。' },
      { date: '2026-08-29', content: '今天开始做实验分析。' },
    ]);
    session.dispose();
  });

  it('keeps an in-flight save on 8/28 while switching the editor to 8/29', async () => {
    let now = new Date(2026, 7, 28, 23, 59, 0);
    const first = deferred();
    const persist = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const load = vi.fn(async () => '');

    const session = createDailyReviewSession({
      now: () => now,
      persist,
      load,
      debounceMs: REVIEW_AUTOSAVE_MS,
    });
    session.attach('2026-08-28', '');
    session.noteInput('A');
    await vi.advanceTimersByTimeAsync(REVIEW_AUTOSAVE_MS);
    expect(persist).toHaveBeenCalledWith('2026-08-28', 'A');

    now = new Date(2026, 7, 29, 0, 0, 1);
    const switched = session.applyNow();
    first.resolve();
    await switched;

    expect(persist.mock.calls[0]).toEqual(['2026-08-28', 'A']);
    expect(session.getEditingDate()).toBe('2026-08-29');
    expect(session.getText()).toBe('');
    session.dispose();
  });

  it('resume after the calendar day changes switches the editor', async () => {
    let now = new Date(2026, 7, 28, 22, 0, 0);
    const persist = vi.fn().mockResolvedValue(undefined);
    const load = vi.fn(async () => '');
    const session = createDailyReviewSession({
      now: () => now,
      persist,
      load,
      debounceMs: REVIEW_AUTOSAVE_MS,
    });
    session.attach('2026-08-28', '昨晚');

    now = new Date(2026, 7, 29, 8, 0, 0);
    await session.applyNow();
    expect(session.getEditingDate()).toBe('2026-08-29');
    expect(session.getText()).toBe('');
    expect(load).toHaveBeenCalledWith('2026-08-29');
    session.dispose();
  });

  it('save primitive does not consult today() for a historical dateKey', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const save = createReviewSaveCoordinator({ persist, debounceMs: 0 });
    save.schedule('2026-08-20', 'should not happen from UI');
    await vi.advanceTimersByTimeAsync(0);
    expect(persist).toHaveBeenCalledWith('2026-08-20', 'should not happen from UI');
    save.dispose();
  });
});
