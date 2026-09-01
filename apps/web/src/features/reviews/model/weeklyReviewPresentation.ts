import type { WeeklySummaryContent, WeeklySummaryResponse } from '@plainlist/shared';

type Translate = (key: string, fallback: string) => string;

export interface WeeklyReviewPresentation {
  status: 'ready' | 'unavailable';
  summary: WeeklySummaryContent | null;
  message: string;
}

export function presentWeeklyReview(
  result: WeeklySummaryResponse,
  t: Translate,
): WeeklyReviewPresentation {
  const messageForNotice = () => {
    if (result.notice === 'updating') {
      return t('week.summary.updating', '本期回顾正在更新');
    }
    if (result.notice === 'not_updated') {
      return t('week.summary.not_updated', '本期回顾暂未更新');
    }
    return t('week.summary.unavailable', '本期回顾暂不可用');
  };

  if (result.status === 'ready' && result.content) {
    return {
      status: 'ready',
      summary: result.content,
      message: result.fallback ? messageForNotice() : '',
    };
  }

  return {
    status: 'unavailable',
    summary: null,
    message: messageForNotice(),
  };
}
