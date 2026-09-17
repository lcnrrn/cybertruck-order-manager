/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_GOOGLE_SHEET_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Google Identity Services (GIS) — loaded via script tag */
interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GoogleAccountsOauth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }) => GoogleTokenClient;
  revoke: (token: string, callback?: () => void) => void;
}

interface GoogleAccountsId {
  initialize: (config: unknown) => void;
  prompt: () => void;
}

interface GoogleAccounts {
  oauth2: GoogleAccountsOauth2;
  id: GoogleAccountsId;
}

interface GoogleGis {
  accounts: GoogleAccounts;
}

interface Window {
  google?: GoogleGis;
}
