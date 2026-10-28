// Formas de respuesta del backend (ver backend/src/lib/scans.ts, treatments.ts, redemptions.ts).

export interface NotificationTexts {
  reminder_title: string;
  reminder_body: string;
  nudge_body: string;
  backup_title: string;
  backup_body: string;
  repurchase_title: string;
  repurchase_body: string;
}

export interface AppConfig {
  min_app_version: string;
  notification_texts: NotificationTexts;
  settings: {
    point_value_cop: number;
    min_points_to_redeem: number;
    points_expiration_days: number;
    offline_scan_max_hours: number;
    allow_parallel_treatments: boolean;
  };
  links: { ios_store_url: string; android_store_url: string; app_domain: string };
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: string;
  needs_data_consent: boolean;
}

export interface Me {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  timezone: string;
  data_consent_at: string | null;
  created_at: string;
  balance: number;
}

export interface DoseRef {
  id: string;
  window_start: string;
  window_end: string;
}

export type DoseStatus = "scheduled" | "on_time" | "late" | "missed";

export interface Dose extends DoseRef {
  status: DoseStatus;
  recorded_at: string | null;
}

export type RejectReason = "invalid_signature" | "replayed" | "owned_by_other" | "blocked" | "offline_expired";

export type ScanResponse = { idempotent_replay?: boolean } & (
  | {
      result: "activation_required";
      activation_token: string;
      expires_in: number;
      product: { id: string; name: string };
      variant: { id: string; name: string; volume_ml: number | null };
      suggested_times: string[];
      config: {
        doses_per_day: number;
        duration_days: number;
        points_per_dose: number;
        welcome_points: number;
        window_minutes_before: number;
        window_minutes_after: number;
        schedule_change_min_notice_hours: number;
      };
    }
  | {
      result: "dose_recorded";
      dose_id: string;
      points_earned: number;
      bonus_points: number;
      streak: number;
      balance: number;
      next_dose: DoseRef | null;
      treatment_completed: boolean;
    }
  | { result: "too_early"; opens_at: string; window_end: string; dose_id: string }
  | { result: "late"; dose_id: string; points_earned: number; balance: number; next_dose: DoseRef | null; treatment_completed: boolean }
  | { result: "no_pending_dose"; next_dose: DoseRef | null }
  | { result: "treatment_finished"; treatment_id: string | null; repurchase_suggested: boolean }
  | { result: "rejected"; reason: RejectReason }
);

export interface ScanRequest {
  tag_url: string;
  device_time?: string;
  offline?: boolean;
}

export interface TreatmentSummary {
  id: string;
  tag_uid: string;
  status: "active" | "finished" | "cancelled";
  start_date: string;
  end_date: string;
  reminder_times: string[];
  points_earned: number;
  product: { id: string; name: string };
  variant: { id: string; name: string; volume_ml: number | null; shopify_variant_id: string | null };
  config: {
    id: string;
    version: number;
    doses_per_day: number;
    duration_days: number;
    points_per_dose: number;
    window_minutes_before: number;
    window_minutes_after: number;
    reminder_nudges: number[];
    schedule_change_min_notice_hours: number;
    schedule_change_max_count: number;
    schedule_change_period_days: number;
  };
  progress: { total: number; on_time: number; late: number; missed: number };
  schedule_changes_left: number;
  days_left: number;
  repurchase_suggested: boolean;
  created_at: string;
  finished_at: string | null;
}

export interface TreatmentDetail extends TreatmentSummary {
  doses: Dose[];
}

export interface CreateTreatmentRequest {
  activation_token: string;
  reminder_times?: string[];
  start_date?: string;
}

export interface PointsInfo {
  balance: number;
  value_cop: number;
  upcoming_expirations: { date: string; amount: number }[];
}

export interface LedgerEntry {
  id: number;
  amount: number;
  reason: string;
  reference_type: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface LedgerPage {
  entries: LedgerEntry[];
  next_before: number | null;
}

export type RewardType = "fixed_amount" | "percentage" | "free_product" | "free_shipping";

export interface RedemptionOption {
  id: string;
  name: string;
  points_cost: number;
  reward_type: RewardType;
  reward_value: number | null;
  affordable: boolean;
}

export interface RedemptionOptions {
  balance: number;
  min_points_to_redeem: number;
  options: RedemptionOption[];
}

export interface Redemption {
  id: string;
  option_id: string;
  option_name: string;
  reward_type: RewardType;
  points: number;
  code: string | null;
  status: "pending" | "issued" | "used" | "expired" | "failed";
  expires_at: string | null;
  used_at: string | null;
  created_at: string;
}
