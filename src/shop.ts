import { SETTING_LS_KEYS, markSettingChanged } from './settingsMeta';
import { BANK } from './buyer/config';

/** 가게 설정 — 설정 탭 'shop' 행 (항목 단위 병합) */
export interface ShopSettings {
  bankName?: string;
  bankNumber?: string;
  bankHolder?: string;
  /** 필라멘트 1g 원가(원) 직접 지정 — 없으면 필라멘트 구매 기록 평균 */
  costPerGram?: number;
  /** 우체국 1건 택배비 기본값(원) — 발송건에 요금이 없을 때 */
  shipFee?: number;
}

const LS = SETTING_LS_KEYS.shop;
export const SHOP_CHANGED_EVENT = 'cybertruck-shop-changed';

export function loadShop(): ShopSettings {
  try {
    const raw = localStorage.getItem(LS);
    const v = raw ? (JSON.parse(raw) as ShopSettings) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function saveShop(next: ShopSettings): void {
  const clean: ShopSettings = {};
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v))) continue;
    (clean as Record<string, unknown>)[k] = v;
  }
  try {
    localStorage.setItem(LS, JSON.stringify(clean));
    markSettingChanged('shop');
    window.dispatchEvent(new CustomEvent(SHOP_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

/** 입금 계좌 (설정이 없으면 구매자 페이지 기본값) */
export function bankInfo(s: ShopSettings = loadShop()): { bank: string; number: string; holder: string } {
  return {
    bank: s.bankName?.trim() || BANK.bank,
    number: s.bankNumber?.trim() || BANK.number,
    holder: s.bankHolder?.trim() || BANK.holder,
  };
}
