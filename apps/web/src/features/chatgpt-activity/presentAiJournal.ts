import type { ChatgptConnectionDisplayState } from '@plainlist/shared';

export function shiftIsoDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

export function presentJournalDate(date: string, today: string): { primary: string; secondary: string } {
  const [, month, day] = date.split('-').map(Number);
  const label = `${Number(month)} 月 ${Number(day)} 日`;
  if (date === today) return { primary: '今天', secondary: label };
  if (date === shiftIsoDate(today, -1)) return { primary: '昨天', secondary: label };
  return { primary: label, secondary: date.slice(0, 4) };
}

export function presentWeekRange(start: string, end: string): string {
  const [, startMonth, startDay] = start.split('-').map(Number);
  const [, endMonth, endDay] = end.split('-').map(Number);
  return `${Number(startMonth)} 月 ${Number(startDay)} 日–${Number(endMonth)} 月 ${Number(endDay)} 日`;
}

export function presentAiJournalEmpty(
  displayState: ChatgptConnectionDisplayState | undefined,
  progress?: { processed?: number; checked?: number },
): { title: string; body: string } {
  if (displayState === 'bootstrapping') {
    const progressLine = progress?.checked
      ? `已处理 ${progress.processed ?? 0} / ${progress.checked} 个对话。`
      : '';
    return { title: '正在建立历史周回顾', body: progressLine || 'Desktop 正在回填历史活动记录。' };
  }
  if (displayState === 'waiting_archive') {
    return { title: '等待 ChatGPT 本地资料库同步历史记录', body: '连接已建立，正在等待本机资料库完成历史导出。' };
  }
  if (displayState === 'no_activity' || displayState === 'ready') {
    return {
      title: '还没有已结束的周回顾。',
      body: displayState === 'no_activity'
        ? '已连接 Desktop。自然周结束后，这里会出现 Weekly Summary。'
        : '',
    };
  }
  return {
    title: '尚未连接 ChatGPT 本地资料库',
    body: '连接 PlainList Desktop 后，过去历周的 Weekly Summary 会自动出现在这里。',
  };
}
