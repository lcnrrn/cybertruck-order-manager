import { getClientId, SHEETS_SCOPE } from './config';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

let gisLoadPromise: Promise<void> | null = null;

export function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('GIS 스크립트 로드 실패')));
      if (window.google?.accounts?.oauth2) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisLoadPromise = null;
      reject(new Error('Google Identity Services 스크립트를 불러오지 못했습니다.'));
    };
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

export async function requestAccessToken(opts?: {
  prompt?: '' | 'consent' | 'select_account';
}): Promise<string> {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error('Google Client ID가 없습니다. 설정에서 Client ID를 입력해 주세요.');
  }

  await loadGisScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Google 로그인 라이브러리를 사용할 수 없습니다.');
  }

  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SHEETS_SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(
            new Error(
              response.error_description || response.error || 'Google 인증에 실패했습니다.',
            ),
          );
          return;
        }
        if (!response.access_token) {
          reject(new Error('액세스 토큰을 받지 못했습니다.'));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (err) => {
        reject(new Error(err.message || err.type || 'Google 인증이 취소되었습니다.'));
      },
    });

    client.requestAccessToken({ prompt: opts?.prompt ?? 'consent' });
  });
}

export function revokeAccessToken(token: string): void {
  try {
    window.google?.accounts?.oauth2?.revoke(token);
  } catch {
    /* ignore */
  }
}

/** Decode email from access token via tokeninfo (best-effort). */
export async function fetchTokenEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email || null;
  } catch {
    return null;
  }
}
