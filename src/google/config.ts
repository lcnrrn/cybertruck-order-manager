const LS_CLIENT_ID = 'cybertruck-google-client-id';
const LS_SHEET_ID = 'cybertruck-google-sheet-id';

export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export const ORDERS_SHEET_NAME = 'Orders';

export const ORDERS_HEADERS = [
  'id',
  'name',
  'items',
  'address',
  'phone',
  'group',
  'status',
  'priority',
  'updatedAt',
  'createdAt',
] as const;

/** Built-in defaults for this user's deployment (public OAuth client id + their sheet). */
const DEFAULT_CLIENT_ID =
  '489719252286-lol6b863pne0iahgbhf8j2lng6ovfiv1.apps.googleusercontent.com';
const DEFAULT_SHEET_ID = '18kxOtN0qRsfExLJeYWRDJeO3w4WeloygIkjrJ6orCP0';

export function getClientId(): string {
  try {
    const fromLs = localStorage.getItem(LS_CLIENT_ID)?.trim();
    if (fromLs) return fromLs;
  } catch {
    /* ignore */
  }
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_CLIENT_ID).trim();
}

export function getSheetId(): string {
  try {
    const fromLs = localStorage.getItem(LS_SHEET_ID)?.trim();
    if (fromLs) return fromLs;
  } catch {
    /* ignore */
  }
  return (import.meta.env.VITE_GOOGLE_SHEET_ID || DEFAULT_SHEET_ID).trim();
}

export function setClientIdOverride(value: string): void {
  const v = value.trim();
  if (v) localStorage.setItem(LS_CLIENT_ID, v);
  else localStorage.removeItem(LS_CLIENT_ID);
}

export function setSheetIdOverride(value: string): void {
  const v = value.trim();
  if (v) localStorage.setItem(LS_SHEET_ID, v);
  else localStorage.removeItem(LS_SHEET_ID);
}

export function hasGoogleConfig(): boolean {
  return Boolean(getClientId() && getSheetId());
}
