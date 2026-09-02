import type { AiUserSettingsView } from '@plainlist/shared';

export function formatWeeklyRuntimeLabel(view: Pick<
  AiUserSettingsView,
  'effectiveSource' | 'effectiveProvider' | 'effectiveModel' | 'effectiveHost' | 'lastSuccessfulProvider' | 'lastSuccessfulModel'
> | null | undefined): string {
  if (!view || view.effectiveSource === 'none' || !view.effectiveModel) {
    return '未配置';
  }
  const source = view.effectiveSource === 'user' ? '个人配置' : '服务器默认';
  const configured = [
    view.effectiveProvider,
    view.effectiveModel,
    view.effectiveHost,
    source,
  ].filter(Boolean).join(' · ');
  if (
    view.lastSuccessfulModel
    && view.lastSuccessfulProvider
    && (view.lastSuccessfulModel !== view.effectiveModel || view.lastSuccessfulProvider !== view.effectiveProvider)
  ) {
    return `${configured} · 最近成功 ${view.lastSuccessfulProvider} · ${view.lastSuccessfulModel}`;
  }
  return configured;
}
