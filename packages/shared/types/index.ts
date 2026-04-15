export type PlanType = 'habit' | 'todo';
export type PluginCategory = 'language' | 'theme';
export type ThemeVars = Record<string, string>;

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
  time: string;
  sortOrder: number;
}

export type ChecksByPlan = Record<string, Record<string, boolean>>;

export type AiReviewPeriod = 'day' | 'week' | 'month' | 'year';

export interface AiReviewPlanSummary {
  id: number;
  name: string;
  type: PlanType;
  completedDays: number;
  expectedDays: number;
  completionRate: number;
}

export interface AiReviewDaySummary {
  date: string;
  completedChecks: number;
  expectedChecks: number;
  completionRate: number;
}

export interface AiReviewSummary {
  period: AiReviewPeriod;
  periodLabel: string;
  referenceDate: string;
  from: string;
  to: string;
  totalPlans: number;
  habitCount: number;
  todoCount: number;
  activeDays: number;
  expectedChecks: number;
  completedChecks: number;
  completionRate: number;
  perfectDays: number;
  perfectDayRate: number;
  currentPerfectStreak: number;
  longestPerfectStreak: number;
  bestPlans: AiReviewPlanSummary[];
  weakestPlans: AiReviewPlanSummary[];
  mostMissedDays: AiReviewDaySummary[];
}

export interface AiReviewResponse {
  period: AiReviewPeriod;
  review: string;
  model: string;
  source: 'ai' | 'fallback';
  generatedAt: string;
  summary: AiReviewSummary;
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
  runtime: 'manifest';
}
