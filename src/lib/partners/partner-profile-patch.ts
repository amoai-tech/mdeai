export type PartnerProfileValues = {
  businessName: string;
  category: string;
  neighborhood: string;
  website: string;
  description: string;
};

const FIELDS = ["businessName", "category", "neighborhood", "website", "description"] as const;

/** Only send actual edited fields, so a stale form never overwrites unrelated changes. */
export function buildPartnerProfilePatch(
  current: PartnerProfileValues,
  saved: PartnerProfileValues,
): Partial<PartnerProfileValues> {
  const patch: Partial<PartnerProfileValues> = {};
  for (const key of FIELDS) {
    const value = current[key].trim();
    if (value !== saved[key].trim()) patch[key] = value;
  }
  return patch;
}

export function profileValuesFromSettings(
  settings: Record<string, unknown>,
): PartnerProfileValues {
  const value = (key: keyof PartnerProfileValues) =>
    typeof settings[key] === "string" ? (settings[key] as string) : "";
  return {
    businessName: value("businessName"),
    category: value("category"),
    neighborhood: value("neighborhood"),
    website: value("website"),
    description: value("description"),
  };
}
