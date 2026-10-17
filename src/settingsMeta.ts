/** Per-key "last edited" timestamps for synced device settings (products, sources, SMS, filament). */
const META_KEY = 'cybertruck-settings-meta-v1';
export const SETTINGS_CHANGED_EVENT = 'cybertruck-settings-changed';
export const SETTINGS_APPLIED_EVENT = 'cybertruck-settings-applied';

export type SettingKey = 'products' | 'sources' | 'sms' | 'filament' | 'production' | 'expenses';

export const SETTING_LS_KEYS: Record<SettingKey, string> = {
  products: 'cybertruck-products-v1',
  sources: 'cybertruck-sources-v1',
  sms: 'cybertruck-sms-templates-v1',
  filament: 'cybertruck-filament-v1',
  production: 'cybertruck-production-settings-v1',
  expenses: 'cybertruck-expenses-v1',
};

export function getSettingsMeta(): Partial<Record<SettingKey, number>> {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) return JSON.parse(raw) as Partial<Record<SettingKey, number>>;
  } catch {
    /* ignore */
  }
  return {};
}

export function setSettingMeta(key: SettingKey, at: number): void {
  try {
    const m = getSettingsMeta();
    m[key] = at;
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

/** Call after a user edit is persisted to localStorage. */
export function markSettingChanged(key: SettingKey): void {
  setSettingMeta(key, Date.now());
  try {
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT, { detail: key }));
  } catch {
    /* ignore */
  }
}
