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
  showDesktopDownload: boolean;
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
  const todayLine = input.lastResult
    ? `这次整理了 ${input.lastResult.changed ?? 0} 个对话，形成 ${input.lastResult.activities ?? 0} 条活动记录。`
    : null;
  const processed = input.lastResult?.processed ?? input.connection.processed ?? 0;
  const total = input.lastResult?.checked ?? input.connection.checked ?? 0;
  const progressLine = total > 0 && processed < total
    ? `已处理 ${processed} / ${total} 个对话`
    : null;

  if (input.isDesktop) {
    if (input.localStatus === 'paused' && input.rootName) {
      return {
        variant: 'desktop-paused',
        connected: true,
        headline: '已暂停自动记录',
        body: '资料库仍保留在本机。恢复后会继续整理每日 AI 小记。',
        lastUpdated,
        todayLine,
        progressLine,
        showDesktopDownload: false,
      };
    }
    if ((input.localStatus === 'enabled' || input.localStatus === 'paused') && input.rootName) {
      return {
        variant: 'desktop-connected',
        connected: true,
        headline: '自动记录中',
        body: '完整对话保留在本机，PlainList 只保存整理后的活动摘要。',
        lastUpdated,
        todayLine: todayLine ?? '连接后，每天的活动会自动整理成 AI 小记。',
        progressLine,
        showDesktopDownload: false,
      };
    }
    return {
      variant: 'desktop-disconnected',
      connected: false,
      headline: '自动记录你通过 ChatGPT 完成的学习、研究和项目活动。',
      body: '完整对话保留在本机，PlainList 只保存整理后的活动摘要。',
      lastUpdated: null,
      todayLine: null,
      progressLine: null,
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
      showDesktopDownload: false,
    };
  }
  if (displayState === 'waiting_archive') {
    return {
      variant: 'web-waiting',
      connected: true,
      headline: '等待 ChatGPT 本地资料库同步历史记录',
      body: 'Desktop 已连接，正在等待 chatgpt-local-sync 完成历史导出。',
      lastUpdated,
      todayLine: null,
      progressLine: null,
      showDesktopDownload: false,
    };
  }
  if (displayState === 'no_activity') {
    return {
      variant: 'web-empty',
      connected: true,
      headline: '暂时没有可记录的 ChatGPT 活动',
      body: '已连接 Desktop。有值得记录的活动后，这里会出现每日摘要。',
      lastUpdated,
      todayLine: null,
      progressLine: null,
      showDesktopDownload: false,
    };
  }
  if (displayState === 'ready' || input.connection.viaDesktop) {
    return {
      variant: 'web-connected',
      connected: true,
      headline: '自动记录已通过 Desktop 开启',
      body: '每日活动记录会自动同步到这里，可在 AI 小记中查看。',
      lastUpdated,
      todayLine,
      progressLine: null,
      showDesktopDownload: false,
    };
  }

  return {
    variant: 'web-disconnected',
    connected: false,
    headline: '尚未连接桌面资料库',
    body: '通过 PlainList Desktop 连接 ChatGPT Local Sync 后，这里会自动显示每日活动记录。',
    lastUpdated: null,
    todayLine: null,
    progressLine: null,
    showDesktopDownload: true,
  };
}
