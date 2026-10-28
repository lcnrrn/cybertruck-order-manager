import { SETTING_LS_KEYS, markSettingChanged } from './settingsMeta';

/** 설정 탭 'epostRequest' 행 — 앱이 pending 으로 만들고, 봇이 running → done/error 로 바꿈 (scripts/epost-request.md) */
export type EpostStatus = 'pending' | 'running' | 'done' | 'error';
export type EpostMode = 'counter' | 'visit';
export interface EpostRequest {
  id: string;
  /** counter = 창구 접수(사전접수), visit = 방문 접수(집 픽업). 없으면 counter */
  mode?: EpostMode;
  /** visit 일 때 희망 픽업일 YYYY-MM-DD */
  pickupDate?: string;
  requestedAt: number;
  shipmentIds: string[];
  status: EpostStatus;
  updatedAt?: number;
  startedAt?: number;
  finishedAt?: number;
  receiptNo?: string;
  count?: number;
  amount?: number;
  message?: string;
}

const LS = SETTING_LS_KEYS.epostRequest;

export function loadEpostRequest(): EpostRequest | null {
  try {
    const raw = localStorage.getItem(LS);
    if (!raw) return null;
    const v = JSON.parse(raw) as EpostRequest;
    if (!v || typeof v !== 'object' || !v.id || !v.status) return null;
    return { ...v, shipmentIds: Array.isArray(v.shipmentIds) ? v.shipmentIds : [] };
  } catch {
    return null;
  }
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** 내일부터 첫 평일 */
export function nextWeekday(from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return ymd(d);
}
export function isWeekend(s: string): boolean {
  const [y, m, d] = s.split('-').map(Number);
  const w = new Date(y, m - 1, d).getDay();
  return w === 0 || w === 6;
}
export function modeLabel(r: { mode?: EpostMode; pickupDate?: string }): string {
  return r.mode === 'visit' ? `방문 접수${r.pickupDate ? ` (${r.pickupDate.slice(5).replace('-', '/')} 픽업)` : ''}` : '창구 접수';
}

export function createEpostRequest(shipmentIds: string[], now = Date.now(), mode: EpostMode = 'counter', pickupDate?: string): EpostRequest {
  const r: EpostRequest = {
    id: `ep-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    mode,
    ...(mode === 'visit' && pickupDate ? { pickupDate } : {}),
    requestedAt: now,
    shipmentIds,
    status: 'pending',
    updatedAt: now,
  };
  try {
    localStorage.setItem(LS, JSON.stringify(r));
  } catch {
    /* ignore */
  }
  markSettingChanged('epostRequest'); // 설정 행 updatedAt = now → 다음 동기화 때 시트로 올라감
  return r;
}

export function isBusy(r: EpostRequest | null): boolean {
  return !!r && (r.status === 'pending' || r.status === 'running');
}
