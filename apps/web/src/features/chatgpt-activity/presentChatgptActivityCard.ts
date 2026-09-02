import type { ChatgptConnectionDisplayState } from '@plainlist/shared';

export type ChatgptActivityCardVariant =
  | 'desktop-disconnected'
  | 'desktop-connected'
  | 'desktop-paused'
  | 'web-disconnected'
  | 'web-connected'
  | 'web-bootstrapping'
  | 'web-waiting'
  | 'web-empty';

export interface ChatgptActivityCardModel {
  variant: ChatgptActivityCardVariant;
  connected: boolean;
  headline: string;
  body: string;
  lastUpdated: string | null;
  todayLine: string | null;
  progressLine: string | null;
  countLine: string | null;
  showDesktopDownload: boolean;
}

function countLineFor(checked?: number, processed?: number): string | null {
  if (!checked) return null;
  if (processed && processed !== checked) return `${checked} 个对话 · 已处理 ${processed}`;
  return `${checked} 个对话`;
}

export function presentChatgptActivityCard(input: {
  isDesktop: boolean;
  localStatus: string;
  rootName: string | null;
  connection: {
    status?: string;
    viaDesktop?: boolean;
    lastSyncedAt?: string | null;
    displayState?: ChatgptConnectionDisplayState;
    checked?: number;
    processed?: number;
    journalCount?: number;
    earliestJournalDate?: string | null;
  };
  lastResult: { changed?: number; activities?: number; processed?: number; checked?: number } | null;
}): ChatgptActivityCardModel {
  const lastUpdated = input.connection.lastSyncedAt ?? null;
  const processed = input.lastResult?.processed ?? input.connection.processed ?? 0;
  const total = input.lastResult?.checked ?? input.connection.checked ?? 0;
  const countLine = countLineFor(total, processed);
  const progressLine = total > 0 && processed > 0 && processed < total
    ? `已处理 ${processed} / ${total} 个对话`
    : null;

  if (input.isDesktop) {
    if (input.localStatus === 'paused' && input.rootName) {
      return {
        variant: 'desktop-paused',
        connected: true,
        headline: '已暂停自动记录',
        body: '资料库仍保留在本机。',
        lastUpdated,
        todayLine: null,
        progressLine,
        countLine,
        showDesktopDownload: false,
      };
    }
    if ((input.localStatus === 'enabled' || input.localStatus === 'paused') && input.rootName) {
      return {
        variant: 'desktop-connected',
        connected: true,
        headline: '自动记录中',
        body: '',
        lastUpdated,
        todayLine: null,
        progressLine: null,
        countLine,
        showDesktopDownload: false,
      };
    }
    return {
      variant: 'desktop-disconnected',
      connected: false,
      headline: '连接本机 ChatGPT 资料库后，活动会整理成每日小记。',
      body: '完整对话留在本机。',
      lastUpdated: null,
      todayLine: null,
      progressLine: null,
      countLine: null,
      showDesktopDownload: false,
    };
  }

  const displayState = input.connection.displayState
    ?? (input.connection.viaDesktop ? 'ready' : 'not_connected');

  if (displayState === 'bootstrapping') {
    return {
      variant: 'web-bootstrapping',
      connected: true,
      headline: '正在建立历史活动记录',
      body: progressLine ?? 'Desktop 正在回填 8 月 1 日以来的活动。',
      lastUpdated,
      todayLine: null,
      progressLine,
      countLine,
      showDesktopDownload: false,
    };
  }
  if (displayState === 'waiting_archive') {
    return {
      variant: 'web-waiting',
      connected: true,
      headline: '等待本地资料库同步',
      body: 'Desktop 已连接，正在等待历史导出。',
      lastUpdated,
      todayLine: null,
      progressLine: null,
      countLine: null,
      showDesktopDownload: false,
    };
  }
  if (displayState === 'no_activity') {
    return {
      variant: 'web-empty',
      connected: true,
      headline: '暂时没有可记录的活动',
      body: '已连接 Desktop。',
      lastUpdated,
      todayLine: null,
      progressLine: null,
      countLine,
      showDesktopDownload: false,
    };
  }
  if (displayState === 'ready' || input.connection.viaDesktop) {
    return {
      variant: 'web-connected',
      connected: true,
      headline: '自动记录中',
      body: '',
      lastUpdated,
      todayLine: null,
      progressLine: null,
      countLine,
      showDesktopDownload: false,
    };
  }

  return {
    variant: 'web-disconnected',
    connected: false,
    headline: '尚未连接桌面资料库',
    body: '用 PlainList Desktop 连接后，这里会显示每日活动记录。',
    lastUpdated: null,
    todayLine: null,
    progressLine: null,
    countLine: null,
    showDesktopDownload: true,
  };
}
