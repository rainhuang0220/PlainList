export interface ReminderPlanLike {
  id: number;
  type: 'habit' | 'todo';
  name: string;
  time: string; // HH:MM
  scheduledDate?: string | null; // YYYY-MM-DD
}

export interface ReminderScheduleItem {
  /** Stable id for Capacitor notification id (must fit JS number / int32 safely) */
  id: number;
  planId: number;
  title: string;
  body: string;
  at: Date;
}

export interface NotificationScheduler {
  requestPermission(): Promise<boolean>;
  syncFromPlans(plans: ReminderPlanLike[]): Promise<void>;
  clearAll(): Promise<void>;
}
