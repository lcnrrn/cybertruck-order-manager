import { APPS_SCRIPT_URL } from './buyer/config';

/**
 * 「접수 요청」 뒤 Bot 루틴 깨우기 — Apps Script(notifyEpost)가 대신 웹훅을 부름 (키는 Apps Script 속성에만 있음).
 * 시트에 pending 이 올라가기 전이면 서버가 'not-pending' → 몇 초 뒤 다시 (최대 ~60초).
 */
export type NotifyResult = 'ok' | 'not-configured' | 'fail';

export async function notifyEpostOnce(requestId: string, f: typeof fetch = fetch): Promise<{ ok: boolean; error?: string }> {
  const r = await f(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'notifyEpost', requestId }) });
  return r.json();
}

export async function notifyEpost(requestId: string, opts: { tries?: number; waitMs?: number; f?: typeof fetch } = {}): Promise<NotifyResult> {
  const tries = opts.tries ?? 12;
  const wait = opts.waitMs ?? 5000;
  for (let i = 0; i < tries; i++) {
    try {
      const j = await notifyEpostOnce(requestId, opts.f);
      if (j.ok) return 'ok';
      if (j.error === 'not-configured') return 'not-configured';
      if (j.error !== 'not-pending' && i >= 2) return 'fail';
    } catch {
      /* network — retry */
    }
    await new Promise((res) => setTimeout(res, wait));
  }
  return 'fail';
}
