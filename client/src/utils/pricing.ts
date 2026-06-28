/** מחירון שדרוגים — מקור אמת: SystemSettings ב-DB */

export const UPGRADE_LABELS: Record<string, string> = {
  baseDesign: 'עיצוב בסיסי',
  reception: 'קבלת פנים',
  separateReception: 'קבלת פנים נפרד',
  lighting: 'תאורה',
  amplification: 'הגברה',
  screens: 'מסכים',
  fireworks: 'זיקוקים',
  extraSecurity: 'מאבטח נוסף',
};

export const UPGRADE_DISPLAY_ORDER = [
  'baseDesign',
  'reception',
  'separateReception',
  'lighting',
  'amplification',
  'screens',
  'fireworks',
  'extraSecurity',
] as const;

export type UpgradeKey = (typeof UPGRADE_DISPLAY_ORDER)[number];

export const HALL_UPGRADE_KEYS = ['reception', 'separateReception', 'extraSecurity'] as const;

export const EXTERNAL_UPGRADE_KEYS = [
  'baseDesign',
  'lighting',
  'amplification',
  'screens',
  'fireworks',
] as const;

export const DEFAULT_UPGRADES_PRICING: Record<string, number> = {
  baseDesign: 4500,
  amplification: 1400,
  lighting: 1800,
  screens: 800,
  reception: 2000,
  separateReception: 3000,
  extraSecurity: 650,
  fireworks: 700,
};

/** שדות מחיר ב-SystemSettings — לתצוגה במסך הגדרות */
export interface SystemPriceField {
  field: string;
  label: string;
  hint?: string;
  suffix?: string;
  group: 'system' | 'upgrades';
  /** פריטי ליבה שלא ניתן להסיר מהמחירון */
  required?: boolean;
}

export const NON_REMOVABLE_PRICE_FIELDS = new Set(['vatRate', 'basePricePerPortion']);

export const SYSTEM_PRICE_FIELDS: SystemPriceField[] = [
  { field: 'vatRate', label: 'מע"מ', suffix: '%', group: 'system', required: true },
  { field: 'basePricePerPortion', label: 'מחיר בסיס למנה', suffix: '₪', group: 'system', required: true },
  {
    field: 'barPortionPrice',
    label: 'עלות מנת בר',
    suffix: '₪',
    group: 'system',
    hint: 'מינימום מנות בטופס הפקה ובחוזה',
  },
  { field: 'staffPortionPrice', label: 'מנה לאיש צוות', suffix: '₪', group: 'system' },
  { field: 'akumFee', label: 'אקו"ם (דמי רישום)', suffix: '₪', group: 'system' },
  { field: 'designBasePrice', label: UPGRADE_LABELS.baseDesign, suffix: '₪', group: 'upgrades' },
  { field: 'receptionPrice', label: UPGRADE_LABELS.reception, suffix: '₪', group: 'upgrades' },
  { field: 'separateReceptionPrice', label: UPGRADE_LABELS.separateReception, suffix: '₪', group: 'upgrades' },
  { field: 'lightingPrice', label: UPGRADE_LABELS.lighting, suffix: '₪', group: 'upgrades' },
  { field: 'soundSystemPrice', label: UPGRADE_LABELS.amplification, suffix: '₪', group: 'upgrades' },
  { field: 'screensPrice', label: UPGRADE_LABELS.screens, suffix: '₪', group: 'upgrades' },
  { field: 'fireworksPrice', label: UPGRADE_LABELS.fireworks, suffix: '₪', group: 'upgrades' },
  { field: 'extraSecurityPrice', label: UPGRADE_LABELS.extraSecurity, suffix: '₪', group: 'upgrades' },
];

export const SETTINGS_TO_UPGRADE: Record<UpgradeKey, string> = {
  baseDesign: 'designBasePrice',
  amplification: 'soundSystemPrice',
  lighting: 'lightingPrice',
  screens: 'screensPrice',
  reception: 'receptionPrice',
  separateReception: 'separateReceptionPrice',
  extraSecurity: 'extraSecurityPrice',
  fireworks: 'fireworksPrice',
};

export function parseHiddenPriceFields(settings?: Record<string, unknown> | null): string[] {
  const raw = settings?.hiddenPriceFields;
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

export function isPriceFieldHidden(
  settings: Record<string, unknown> | null | undefined,
  field: string,
): boolean {
  return parseHiddenPriceFields(settings).includes(field);
}

export function getVisibleSystemPriceFields(
  settings?: Record<string, unknown> | null,
): SystemPriceField[] {
  const hidden = new Set(parseHiddenPriceFields(settings));
  return SYSTEM_PRICE_FIELDS.filter((item) => !hidden.has(item.field));
}

export function getHiddenSystemPriceFields(
  settings?: Record<string, unknown> | null,
): SystemPriceField[] {
  const hidden = new Set(parseHiddenPriceFields(settings));
  return SYSTEM_PRICE_FIELDS.filter((item) => hidden.has(item.field));
}

export function filterUpgradeDisplayOrder(
  settings?: Record<string, unknown> | null,
): UpgradeKey[] {
  const hidden = new Set(parseHiddenPriceFields(settings));
  return UPGRADE_DISPLAY_ORDER.filter((key) => !hidden.has(SETTINGS_TO_UPGRADE[key]));
}

export function buildUpgradesPricingFromSettings(
  settings?: Record<string, unknown> | null,
): Record<string, number> {
  const result = { ...DEFAULT_UPGRADES_PRICING };
  if (!settings) return result;

  for (const key of UPGRADE_DISPLAY_ORDER) {
    const settingsField = SETTINGS_TO_UPGRADE[key];
    const raw = settings[settingsField as string];
    const num = Number(raw);
    if (Number.isFinite(num) && num >= 0) {
      result[key] = num;
    }
  }
  return result;
}

export function getSettingNumber(
  settings: Record<string, unknown> | null | undefined,
  field: string,
  fallback: number,
): number {
  const num = Number(settings?.[field]);
  return Number.isFinite(num) ? num : fallback;
}
