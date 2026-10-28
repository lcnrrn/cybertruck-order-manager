import { useEffect, useState } from 'react';
import { SETTING_LS_KEYS, SETTINGS_APPLIED_EVENT, markSettingChanged } from './settingsMeta';
import type { EpostRequest } from './epost';

/**
 * 접수 알림 웹훅 — 「접수 요청」을 누르면 시트에 pending 을 저장한 뒤 Grok Bot 루틴의 웹훅을 호출해서
 * Bot 이 바로 깨어나 처리하게 함. 설정 탭 'epostWebhook' 행 {url, key} 로 두 기기가 같은 값을 씀.
 * 인증: 루틴 화면의 key 를 `Authorization: Bearer <key>` 로 보냄 (Cursor 루틴 도움말 기준).
 */
export interface EpostWebhook {
  url?: string;
  key?: string;
}

const LS = SETTING_LS_KEYS.epostWebhook;
export const WEBHOOK_CHANGED_EVENT = 'cybertruck-webhook-changed';
const QUEUE_LS = 'cybertruck-epost-webhook-queue-v1';
const QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function loadWebhook(): EpostWebhook {
  try {
    const raw = localStorage.getItem(LS);
    const v = raw ? (JSON.parse(raw) as EpostWebhook) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** 붙여넣기 정리: 앞뒤 공백, "Authorization:" / "Bearer " 접두어 제거 */
export function cleanKey(k: string): string {
  return k.trim().replace(/^authorization\s*:\s*/i, '').replace(/^bearer\s+/i, '').trim();
}
export function cleanUrl(u: string): string {
  return u.trim();
}

export function saveWebhook(next: EpostWebhook): void {
  const clean: EpostWebhook = {};
  const url = cleanUrl(next.url || '');
  const key = cleanKey(next.key || '');
  if (url) clean.url = url;
  if (key) clean.key = key;
  try {
    localStorage.setItem(LS, JSON.stringify(clean));
    markSettingChanged('epostWebhook');
    window.dispatchEvent(new CustomEvent(WEBHOOK_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

export function hasWebhook(w: EpostWebhook = loadWebhook()): boolean {
  return !!w.url && /^https:\/\//i.test(w.url);
}

export function useWebhookSettings(): EpostWebhook {
  const [s, setS] = useState<EpostWebhook>(() => loadWebhook());
  useEffect(() => {
    const on = () => setS(loadWebhook());
    window.addEventListener(WEBHOOK_CHANGED_EVENT, on);
    window.addEventListener(SETTINGS_APPLIED_EVENT, on);
    return () => {
      window.removeEventListener(WEBHOOK_CHANGED_EVENT, on);
      window.removeEventListener(SETTINGS_APPLIED_EVENT, on);
    };
  }, []);
  return s;
}

/** ok = 서버가 2xx 로 답함 · opaque = 보내긴 했는데 브라우저 제한(CORS)으로 응답은 못 봄 · fail = 못 보냄/거절 */
export type WebhookResult = 'ok' | 'opaque' | 'fail';

export interface WebhookPayload {
  event: string;
  requestId?: string;
  count?: number;
  mode?: string;
}

async function post(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), 12000);
  try {
    return await fetch(url, { ...init, method: 'POST', signal: ctrl.signal });
  } finally {
    window.clearTimeout(t);
  }
}

/**
 * 1) 보통 fetch (Authorization: Bearer <key>, JSON)
 * 2) 네트워크/CORS 때문에 못 보내면 no-cors 로 한 번 더 (헤더를 못 붙이므로 key 를 쿼리로도 보냄, 응답은 못 읽음)
 * HTTP 401/403 같은 응답이 보이면 재시도하지 않고 fail.
 */
export async function sendWebhook(w: EpostWebhook, payload: WebhookPayload): Promise<WebhookResult> {
  if (!hasWebhook(w)) return 'fail';
  const url = w.url as string;
  const key = cleanKey(w.key || '');
  const body = JSON.stringify(payload);
  try {
    const res = await post(url, {
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body,
    });
    return res.ok ? 'ok' : 'fail';
  } catch {
    /* CORS 막힘 또는 네트워크 오류 → 아래 재시도 */
  }
  try {
    let u = url;
    if (key) {
      const x = new URL(url);
      x.searchParams.set('key', key);
      u = x.toString();
    }
    await post(u, { mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body });
    return 'opaque';
  } catch {
    return 'fail';
  }
}

/* ───── 시트 저장이 끝난 뒤에 보내기 ─────
 * 요청을 큐에 넣어 두고, 그 뒤에 시작해서 성공한 동기화(= pending 행이 시트에 올라간 회차)가 끝나면 보냄.
 * 시트가 바빠서 잠깐 재시도 중이어도 저장이 끝난 다음에 알림이 나감. */
interface Queued extends WebhookPayload {
  queuedAt: number;
}

export function queueEpostWebhook(r: EpostRequest, now = Date.now()): void {
  const q: Queued = { event: 'epostRequest', requestId: r.id, count: r.shipmentIds.length, mode: r.mode || 'counter', queuedAt: now };
  try {
    localStorage.setItem(QUEUE_LS, JSON.stringify(q));
  } catch {
    /* ignore */
  }
}

let flushing = false;

/** 큐에 있는 알림을 (조건이 맞으면) 보냄. 보냈거나 시도했으면 결과, 해당 없으면 null */
export async function flushEpostWebhook(syncStartedAt: number): Promise<WebhookResult | null> {
  if (flushing) return null;
  let q: Queued | null = null;
  try {
    const raw = localStorage.getItem(QUEUE_LS);
    q = raw ? (JSON.parse(raw) as Queued) : null;
  } catch {
    q = null;
  }
  if (!q || !q.queuedAt) return null;
  if (Date.now() - q.queuedAt > QUEUE_MAX_AGE_MS) {
    try {
      localStorage.removeItem(QUEUE_LS);
    } catch {
      /* ignore */
    }
    return null;
  }
  if (syncStartedAt < q.queuedAt) return null; // 요청 전에 시작한 동기화 → 아직 시트에 안 올라갔을 수 있음
  flushing = true;
  try {
    localStorage.removeItem(QUEUE_LS); // 한 번만 보냄 (실패해도 반복 안 함)
    const { queuedAt: _q, ...payload } = q;
    void _q;
    return await sendWebhook(loadWebhook(), payload);
  } finally {
    flushing = false;
  }
}

export const WEBHOOK_OK_MSG = '📮 Bot에게 알렸어';
export const WEBHOOK_OPAQUE_MSG = '📮 Bot에게 보냈어 (응답은 확인 못 했어)';
export const WEBHOOK_FAIL_MSG = "알림 실패 – 채팅으로 '접수해줘'라고 말해줘";
export const WEBHOOK_HINT_MSG = '접수 요청 저장됨 · 알림 웹훅을 설정하면 Bot이 바로 처리해요 (더보기 › 가게 · 구매자 안내)';

export function webhookToast(r: WebhookResult): string {
  return r === 'ok' ? WEBHOOK_OK_MSG : r === 'opaque' ? WEBHOOK_OPAQUE_MSG : WEBHOOK_FAIL_MSG;
}
