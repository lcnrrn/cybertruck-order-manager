import { SETTINGS_APPLIED_EVENT, SETTINGS_CHANGED_EVENT, SETTING_LS_KEYS, markSettingChanged } from './settingsMeta';
import { useEffect, useState } from 'react';

/**
 * 블랙리스트 — 설정 탭 'blacklist' 행 ({id: 항목} 객체, 항목 단위 병합).
 * 전화번호(숫자만) 또는 주소(공백·기호 무시)가 같으면 일치.
 * ※ 같은 규칙이 scripts/apps-script/Code.gs(구매자 주문서 서버 검사)에도 있어요 — 고치면 둘 다.
 */
export interface BlacklistEntry {
  id: string;
  name?: string;
  phone: string;
  address: string;
  reason?: string;
  at: number;
}
export type BlacklistMap = Record<string, BlacklistEntry>;

export interface BlacklistHit {
  entry: BlacklistEntry;
  by: 'phone' | 'address';
}

/** 숫자만. +82 / 82 로 시작하면 0 으로 */
export function normalizePhone(raw: string): string {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('82') && d.length >= 11) d = `0${d.slice(2)}`;
  return d;
}

const clean = (s: string): string => s.toLowerCase().replace(/[^0-9a-z가-힣]/g, '');

/** 공백·기호를 지운 주소 (전체 비교용) */
export function normalizeAddress(raw: string): string {
  return clean(String(raw || '').normalize('NFC').replace(/\([^)]*\)/g, ' '));
}

const ROAD = /[0-9a-z가-힣]+(?:대로|로|길)\s*\d+(?:-\d+)?(?:\s*번?길\s*\d+(?:-\d+)?)?/;

/** 도로명 주소를 '도로+건물번호'(core)와 '동·호수'(detail)로 나눔. 도로명이 없으면 null */
export function splitAddress(raw: string): { area: string; core: string; detail: string } | null {
  const s = String(raw || '').normalize('NFC').toLowerCase().replace(/\([^)]*\)/g, ' ');
  const m = ROAD.exec(s);
  if (!m) return null;
  const before = s.slice(0, m.index);
  const areaM = before.match(/[0-9a-z가-힣]+(?:구|군|시)(?=[^0-9a-z가-힣]|$)/g);
  const area = areaM ? clean(areaM[areaM.length - 1]) : '';
  const rest = s.slice(m.index + m[0].length);
  const detailDigits = rest.replace(/\D/g, '');
  return { area, core: clean(m[0]), detail: detailDigits || clean(rest) };
}

/** 두 주소가 같은 곳인지: 도로+건물번호가 같고, (블랙리스트에 동·호수가 있으면) 동·호수도 같음 */
export function sameAddress(blAddr: string, orderAddr: string): boolean {
  const a = splitAddress(blAddr);
  const b = splitAddress(orderAddr);
  if (a && b) {
    if (a.core !== b.core) return false;
    if (a.area && b.area && a.area !== b.area) return false;
    return !a.detail || a.detail === b.detail;
  }
  const x = normalizeAddress(blAddr);
  const y = normalizeAddress(orderAddr);
  return x.length >= 6 && x === y;
}

export function matchBlacklist(phone: string, address: string, list: BlacklistEntry[]): BlacklistHit | null {
  const p = normalizePhone(phone);
  for (const e of list) {
    const ep = normalizePhone(e.phone);
    if (p.length >= 9 && ep.length >= 9 && p === ep) return { entry: e, by: 'phone' };
  }
  if (String(address || '').trim().length >= 5) {
    for (const e of list) {
      if (String(e.address || '').trim().length >= 5 && sameAddress(e.address, address)) return { entry: e, by: 'address' };
    }
  }
  return null;
}

export function normalizeBlacklist(raw: unknown): BlacklistMap {
  const out: BlacklistMap = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const e = v as Record<string, unknown>;
    const phone = typeof e.phone === 'string' ? e.phone.trim() : '';
    const address = typeof e.address === 'string' ? e.address.trim() : '';
    if (!phone && !address) continue;
    const id = typeof e.id === 'string' && e.id ? e.id : k;
    const entry: BlacklistEntry = { id, phone, address, at: typeof e.at === 'number' ? e.at : 0 };
    if (typeof e.name === 'string' && e.name.trim()) entry.name = e.name.trim();
    if (typeof e.reason === 'string' && e.reason.trim()) entry.reason = e.reason.trim();
    out[id] = entry;
  }
  return out;
}

export function loadBlacklist(): BlacklistMap {
  try {
    return normalizeBlacklist(JSON.parse(localStorage.getItem(SETTING_LS_KEYS.blacklist) || '{}'));
  } catch {
    return {};
  }
}

export function saveBlacklist(map: BlacklistMap): void {
  try {
    localStorage.setItem(SETTING_LS_KEYS.blacklist, JSON.stringify(map));
    markSettingChanged('blacklist');
  } catch {
    /* ignore */
  }
}

export function newBlacklistId(): string {
  return `bl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 목록(최신순) — 다른 기기 동기화가 반영되면 다시 읽음 */
export function useBlacklist(): BlacklistEntry[] {
  const [m, setM] = useState<BlacklistMap>(() => loadBlacklist());
  useEffect(() => {
    const re = () => setM(loadBlacklist());
    window.addEventListener(SETTINGS_APPLIED_EVENT, re);
    window.addEventListener(SETTINGS_CHANGED_EVENT, re);
    return () => {
      window.removeEventListener(SETTINGS_APPLIED_EVENT, re);
      window.removeEventListener(SETTINGS_CHANGED_EVENT, re);
    };
  }, []);
  return Object.values(m).sort((a, b) => b.at - a.at);
}
