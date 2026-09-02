export type ChatgptActivityCardVariant =
  | 'desktop-disconnected'
  | 'desktop-connected'
  | 'desktop-paused'
  | 'web-disconnected'
  | 'web-connected';

export interface ChatgptActivityCardModel {
  variant: ChatgptActivityCardVariant;
  connected: boolean;
  headline: string;
  body: string;
  lastUpdated: string | null;
  todayLine: string | null;
}

export function presentChatgptActivityCard(input: {
  isDesktop: boolean;
  localStatus: string;
  rootName: string | null;
  connection: { status?: string; viaDesktop?: boolean; lastSyncedAt?: string | null };
  lastResult: { changed?: number; activities?: number } | null;
}): ChatgptActivityCardModel {
  const lastUpdated = input.connection.lastSyncedAt ?? null;
  const todayLine = input.lastResult
    ? `这次整理了 ${input.lastResult.changed ?? 0} 个对话，形成 ${input.lastResult.activities ?? 0} 条活动记录。`
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
      };
    }
    return {
      variant: 'desktop-disconnected',
      connected: false,
      headline: '自动记录你通过 ChatGPT 完成的学习、研究和项目活动。',
      body: '完整对话保留在本机，PlainList 只保存整理后的活动摘要。',
      lastUpdated: null,
      todayLine: null,
    };
  }

  if (input.connection.viaDesktop) {
    return {
      variant: 'web-connected',
      connected: true,
      headline: '自动记录已通过 Desktop 开启',
      body: '每日活动记录会自动同步到这里，可在 AI 小记中查看。',
      lastUpdated,
      todayLine,
    };
  }

  return {
    variant: 'web-disconnected',
    connected: false,
    headline: '尚未连接桌面资料库。',
    body: '请在 PlainList Desktop 中连接 ChatGPT Local Sync。连接后，每日活动记录会自动同步到这里。',
    lastUpdated: null,
    todayLine: null,
  };
}
