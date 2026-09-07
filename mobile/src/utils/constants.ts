// Domain enums/label maps shared across coordinator screens.
export const NEED_TYPES = [
  "Food",
  "Water",
  "Medical Evac",
  "Shelter",
  "Medicine",
  "Gen. Evac",
];
export const NEED_API: Record<string, string> = {
  Food: "food",
  Water: "water",
  "Medical Evac": "medical_evacuation",
  Shelter: "shelter",
  Medicine: "medicine",
  "Gen. Evac": "general_evacuation",
};
export const NEED_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(NEED_API).map(([label, api]) => [api, label]),
);

export const SEVERITIES = ["Low", "Medium", "High", "Critical"];
export const SEV_API: Record<string, string> = {
  Low: "low",
  Medium: "medium",
  High: "high",
  Critical: "critical",
};

export const FLAG_TYPES = [
  "Elderly Present",
  "Children Present",
  "Pregnancy",
  "Injury Reported",
  "Water Rising Fast",
  "Stranded / No Exit",
];
export const FLAG_API: Record<string, string> = {
  "Elderly Present": "elderly_present",
  "Children Present": "children_present",
  Pregnancy: "pregnancy",
  "Injury Reported": "injury_reported",
  "Water Rising Fast": "water_rising",
  "Stranded / No Exit": "stranded_no_exit",
};
export const FLAG_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(FLAG_API).map(([label, api]) => [api, label]),
);
