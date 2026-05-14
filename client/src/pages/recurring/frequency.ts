export type Frequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY";

export const FREQUENCY_OPTIONS = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Bi-weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "ANNUALLY", label: "Annually" },
];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Bi-weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUALLY: "Annually",
};

const API_TO_UI_FREQUENCY: Record<string, Frequency> = {
  weekly: "WEEKLY",
  biweekly: "BIWEEKLY",
  monthly: "MONTHLY",
  quarterly: "QUARTERLY",
  annual: "ANNUALLY",
  annually: "ANNUALLY",
};

export function normalizeFrequency(value: string | null | undefined): Frequency {
  if (!value) return "MONTHLY";
  const normalized = value.trim();
  return API_TO_UI_FREQUENCY[normalized.toLowerCase()] ?? (normalized.toUpperCase() as Frequency);
}

export function frequencyLabel(value: string | null | undefined): string {
  return FREQUENCY_LABELS[normalizeFrequency(value)];
}
