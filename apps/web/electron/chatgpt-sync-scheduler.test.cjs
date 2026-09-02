const assert = require('node:assert/strict');
const test = require('node:test');
const { createChatgptSyncSignalCoordinator, millisecondsUntilNextLocalMidnight } = require('./chatgpt-sync-scheduler.cjs');

test('calculates the next local midnight from the current calendar date', () => {
  const now = new Date(2026, 8, 1, 23, 59, 30);
  assert.equal(millisecondsUntilNextLocalMidnight(now), 30_000);
});

test('coalesces filesystem noise but forwards startup, wake, and midnight through one notifier', () => {
  const notifications = [];
  const timers = [];
  const coordinator = createChatgptSyncSignalCoordinator({
    notify: (reason) => notifications.push(reason),
    now: () => new Date(2026, 8, 1, 23, 59, 30),
    debounceMilliseconds: 30_000,
    setTimer: (callback, milliseconds) => { timers.push({ callback, milliseconds }); return timers.length; },
    clearTimer: () => {},
  });

  coordinator.request('startup');
  coordinator.request('wake');
  coordinator.markDirty();
  coordinator.markDirty();
  assert.deepEqual(notifications, ['startup', 'wake']);
  assert.equal(timers.filter((timer) => timer.milliseconds === 30_000).length, 3); // midnight + two debounce registrations

  timers.at(-1).callback();
  assert.deepEqual(notifications, ['startup', 'wake', 'archive-change']);
  timers[0].callback();
  assert.deepEqual(notifications, ['startup', 'wake', 'archive-change', 'midnight']);
  coordinator.stop();
});
