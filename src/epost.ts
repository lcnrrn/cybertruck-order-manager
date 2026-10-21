import { SETTING_LS_KEYS, markSettingChanged } from './settingsMeta';

/** 설정 탭 'epostRequest' 행 — 앱이 pending 으로 만들고, 봇이 running → done/error 로 바꿈 (scripts/epost-request.md) */
export type EpostStatus = 'pending' | 'running' | 'done' | 'error';
export interface EpostRequest {
  id: string;
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

export function createEpostRequest(shipmentIds: string[], now = Date.now()): EpostRequest {
  const r: EpostRequest = {
    id: `ep-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
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
