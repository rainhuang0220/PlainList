export type PlanType = 'habit' | 'todo';
export type PluginCategory = 'language' | 'theme' | 'widget';
export type ThemeVars = Record<string, string>;

// --------------- Plugin Marketplace Types ---------------

export interface PluginRegistryEntry {
  id: string;
  name: string;
  category: PluginCategory;
  author: string;
  description: string;
  longDescription?: string;
  iconUrl?: string;
  repoUrl?: string;
  homepageUrl?: string;
  license?: string;
  tags: string[];
  capabilities: string[];
  isOfficial: boolean;
  downloadCount: number;
  latestVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface PluginVersionEntry {
  pluginId: string;
  version: string;
  changelog?: string;
  manifest: PluginVersionManifest;
  archiveUrl?: string;
  archiveSha256?: string;
  minAppVersion?: string;
  isLatest: boolean;
  publishedAt: string;
}

export interface PluginVersionManifest {
  runtime: 'manifest' | 'iframe' | 'webcomponent';
  entrypoint?: string;
  themes?: ThemeDefinition[];
  translation?: PluginTranslationBundle;
  widgetUrl?: string;
  /** Local directory (relative to the app root) to copy the widget from instead of git-cloning repoUrl */
  sourcePath?: string;
  permissions?: string[];
  configSchema?: Record<string, PluginConfigField>;
}

export interface PluginConfigField {
  type: 'string' | 'number' | 'boolean' | 'select';
  label: string;
  default?: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
}

export interface UserPluginRecord {
  pluginId: string;
  version: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  installedAt: string;
}

export interface MarketplaceSearchParams {
  q?: string;
  category?: PluginCategory | 'all';
  tag?: string;
  sortBy?: 'downloads' | 'newest' | 'updated';
  page?: number;
  pageSize?: number;
}

export interface MarketplaceSearchResult {
  plugins: PluginRegistryEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublishPluginPayload {
  id: string;
  name: string;
  category: PluginCategory;
  author: string;
  description: string;
  longDescription?: string;
  iconUrl?: string;
  repoUrl?: string;
  homepageUrl?: string;
  license?: string;
  tags?: string[];
  capabilities?: string[];
  version: string;
  changelog?: string;
  manifest: PluginVersionManifest;
  archiveUrl?: string;
  archiveSha256?: string;
  minAppVersion?: string;
}

export interface AuthenticatedUser {
  id: number;
  username: string;
  isAdmin: boolean;
}

export interface AuthAccount {
  username: string;
  isAdmin: boolean;
}

export interface AuthSuccessResponse {
  token: string;
  username: string;
  isAdmin: boolean;
}

export interface PlanRecord {
  id: number;
  type: PlanType;
  name: string;
  description?: string | null;
  time: string;
  sortOrder: number;
  durationMinutes?: number | null;
  /** For todos: which calendar day this task belongs to. Habits omit this. */
  scheduledDate?: string | null;
  /**
   * Earliest date this plan is relevant: min(creation date, first check date).
   * Habits are hidden on history days before this, so past days in the yearly
   * calendar don't show habits that didn't exist yet.
   */
  visibleFrom?: string | null;
}

export interface CheckDayState {
  done: boolean;
  actualMinutes?: number | null;
}

export type ChecksByPlan = Record<string, Record<string, CheckDayState>>;

export interface DurationChartMerge {
  label: string;
  planIds: number[];
}

export interface DurationChartPrefs {
  hiddenPlanIds: number[];
  merges: DurationChartMerge[];
}

export type AiIntakePriority = 'high' | 'normal' | 'low';

export interface AiIntakeItem {
  name: string;
  type: PlanType;
  time: string;
  priority?: AiIntakePriority;
  order?: number;
  why?: string;
  note?: string;
}

export interface AiIntakeDiscarded {
  text: string;
  reason: string;
}

export interface AiIntakeDirectives {
  clearTodayTodos?: boolean;
  clearReason?: string;
  matchedText?: string;
}

export interface AiIntakeResponse {
  items: AiIntakeItem[];
  discarded: AiIntakeDiscarded[];
  directives?: AiIntakeDirectives;
  summary?: string;
  advice?: string;
  source: 'ai' | 'fallback';
  model: string;
  generatedAt: string;
  notes?: string;
}

export interface UserProfileEvidenceRecord {
  id: number;
  traitId: number;
  reviewDate: string;
  excerpt: string;
  observation: string;
  impactNote: string;
  weight: number;
  createdAt: string;
}

export interface UserProfileTraitRecord {
  id: number;
  traitKey: string;
  title: string;
  generatedSummary: string;
  userSummary?: string | null;
  effectiveSummary: string;
  impactRatio: number;
  confidence: number;
  supportCount: number;
  enabled: boolean;
  lastEvidenceDate?: string | null;
  updatedAt: string;
  evidence?: UserProfileEvidenceRecord[];
}

export interface UserProfileRunRecord {
  id: number;
  fromDate: string;
  toDate: string;
  status: 'success' | 'failed';
  model?: string | null;
  message?: string | null;
  evidenceCount: number;
  analyzedAt: string;
}

export interface UserProfileResponse {
  traits: UserProfileTraitRecord[];
  lastRun?: UserProfileRunRecord | null;
}

export interface UserProfileAnalyzeResponse {
  ok: true;
  evidenceCount: number;
  traitCount: number;
  model?: string | null;
}

export const WEEKLY_SUMMARY_PROMPT_VERSION = 'weekly-summary-v2';

export interface WeeklySummaryContent {
  overall: string;
  summary: string;
  comparison: string;
  positive: string;
  concerns: string;
  nextFocus: string[];
  narrativeMarkdown?: string;
}

export type WeeklySummaryStatus = 'ready' | 'missing' | 'unavailable' | 'pending' | 'generating' | 'error' | 'no_data' | 'no_provider';

export interface WeeklyReviewSection {
  weekStart: string;
  weekEnd: string;
  status: WeeklySummaryStatus;
  content?: WeeklySummaryContent;
  narrativeMarkdown?: string;
  notice?: WeeklySummaryResponse['notice'];
  model?: string | null;
  provider?: string | null;
  generatedAt?: string;
  source?: 'model' | 'deterministic';
}

export interface WeeklyReviewDailyEntry {
  date: string;
  summaryMarkdown: string;
  activityCount: number;
  conversationCount: number;
}

export interface WeeklyReviewPlanItem {
  kind: 'goal' | 'plan' | 'task' | 'intention';
  text: string;
}

export interface WeeklyReviewRuntime {
  weeklyProvider: string | null;
  weeklyModel: string | null;
  weeklySource: 'user' | 'server' | 'none';
  weeklyHost: string | null;
  activityMethod: 'deterministic_local';
}

export interface WeeklyReviewPage {
  asOfDate: string;
  isMonday: boolean;
  trueEmpty: boolean;
  hasPriorHistory: boolean;
  previousWeekState: 'summary' | 'preparing' | 'first_week';
  previousClosedWeek: WeeklyReviewSection | null;
  currentWeek: WeeklyReviewSection | null;
  currentDailyJournals: WeeklyReviewDailyEntry[];
  currentPlans: WeeklyReviewPlanItem[];
  runtime: WeeklyReviewRuntime;
}

export interface WeeklySummaryResponse {
  status: WeeklySummaryStatus;
  weekStart: string;
  weekEnd: string;
  promptVersion: string;
  sourceHash?: string;
  model?: string | null;
  generatedAt?: string;
  cached?: boolean;
  reason?: string;
  content?: WeeklySummaryContent;
  reviewAsOfDate?: string;
  fallback?: boolean;
  notice?: 'updating' | 'not_updated' | 'unavailable' | 'no_data' | 'no_provider' | 'preparing';
  page?: WeeklyReviewPage;
}

export interface InstalledPlugin {
  id: string;
  enabled: boolean;
  installedAt: string;
}

export interface PluginTranslationBundle {
  messages?: Record<string, string>;
  lists?: Record<string, string[]>;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  vars: ThemeVars;
}

export type AiProvider = 'openai' | 'anthropic';

/** Per-user AI provider config (BYOK). Empty apiKey falls back to server .env. */
export interface AiUserSettings {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  intakeModel?: string;
  apiKey: string;
  timeoutMs: number;
  anthropicVersion?: string;
}

/** Safe subset returned to the client — never includes the full API key. */
export interface AiUserSettingsView {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  intakeModel: string;
  effectiveIntakeModel: string;
  timeoutMs: number;
  anthropicVersion?: string;
  apiKeyConfigured: boolean;
  apiKeyPreview: string | null;
  effectiveSource: 'user' | 'server' | 'none';
  effectiveProvider: AiProvider | null;
  effectiveModel: string | null;
  effectiveHost: string | null;
  lastSuccessfulProvider: string | null;
  lastSuccessfulModel: string | null;
}

export type ChatgptConnectionDisplayState =
  | 'not_connected'
  | 'bootstrapping'
  | 'waiting_archive'
  | 'no_activity'
  | 'ready';

export interface ChatgptActivityConnectionView {
  status: 'not_connected' | 'connected' | 'bootstrapping';
  viaDesktop: boolean;
  lastSyncedAt: string | null;
  checked?: number;
  changed?: number;
  skipped?: number;
  processed?: number;
  journalCount: number;
  earliestJournalDate: string | null;
  latestJournalDate: string | null;
  historicalStartDate: string;
  displayState: ChatgptConnectionDisplayState;
}

/**
 * Same as AiUserSettingsView, but ALSO returns the full apiKey.
 * Only used by `POST /ai-intake/settings/apply-default` so the demo form
 * can be pre-filled with the server-side default key. Never exposed by
 * GET endpoints (which always use AiUserSettingsView).
 */
export interface AiUserSettingsViewWithKey extends AiUserSettingsView {
  apiKey: string;
}

export interface AiConnectionTestResult {
  ok: true;
  provider: AiProvider;
  model: string;
  latencyMs: number;
  preview: string;
  source: 'user' | 'server';
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  category: PluginCategory;
  author: string;
  description: string;
  longDescription?: string;
  features?: string[];
  themes?: ThemeDefinition[];
  translation?: PluginTranslationBundle;
  widgetUrl?: string;
  repoUrl?: string;
  runtime: 'manifest';
}
