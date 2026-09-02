function millisecondsUntilNextLocalMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, next.getTime() - now.getTime());
}

function createChatgptSyncSignalCoordinator(input) {
  let dirtyTimer = null;
  let midnightTimer = null;
  let stopped = false;
  const scheduleMidnight = () => {
    if (stopped) return;
    midnightTimer = input.setTimer(() => {
      if (stopped) return;
      input.notify('midnight');
      scheduleMidnight();
    }, millisecondsUntilNextLocalMidnight(input.now()));
  };
  scheduleMidnight();
  return {
    request(reason) {
      if (!stopped) input.notify(reason);
    },
    markDirty() {
      if (stopped) return;
      if (dirtyTimer !== null) input.clearTimer(dirtyTimer);
      dirtyTimer = input.setTimer(() => {
        dirtyTimer = null;
        if (!stopped) input.notify('archive-change');
      }, input.debounceMilliseconds);
    },
    stop() {
      stopped = true;
      if (dirtyTimer !== null) input.clearTimer(dirtyTimer);
      if (midnightTimer !== null) input.clearTimer(midnightTimer);
    },
  };
}
module.exports = { createChatgptSyncSignalCoordinator, millisecondsUntilNextLocalMidnight };
