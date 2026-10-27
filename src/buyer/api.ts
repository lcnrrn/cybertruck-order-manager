import { APPS_SCRIPT_URL } from './config';

export const apiReady = (): boolean => /^https:\/\/script\.google\.com\//.test(APPS_SCRIPT_URL);

export interface SubmitBody {
  name: string; nick: string; phone: string; address: string; payer: string; memo: string;
  items: Record<string, number>; agree: boolean; website: string;
}
export async function submitOrder(b: SubmitBody): Promise<{ ok: boolean; error?: string; orderNo?: string; total?: number }> {
  // text/plain → 브라우저 사전요청(CORS preflight) 없이 Apps Script 로 보냄
  const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(b) });
  return r.json();
}

export interface LookupShipment { no: number; items: Record<string, number>; trackingNumber: string | null; registered: boolean; at?: number | null; delivered?: boolean; deliveredAt?: number | null }
export interface LookupOrder {
  no: string; createdAt: number | null; items: string[]; status: string; paid: boolean;
  amount: number | null; itemsRaw?: string; done?: Record<string, number>; trackingNumber: string | null; shipments: LookupShipment[];
}
export async function lookup(name: string, last4: string): Promise<{ ok: boolean; error?: string; orders?: LookupOrder[]; prices?: Record<string, number>; names?: string[] }> {
  const u = `${APPS_SCRIPT_URL}?action=lookup&name=${encodeURIComponent(name)}&last4=${encodeURIComponent(last4)}`;
  const r = await fetch(u);
  return r.json();
}

export interface ShopInfo { images: Record<string, string>; bank: { bank: string; number: string; holder: string } | null }
/** 제품 사진 · 입금 계좌 (Apps Script 새 버전 배포 전이면 null → 기본값 사용) */
export async function shopInfo(): Promise<ShopInfo | null> {
  try {
    const r = await fetch(`${APPS_SCRIPT_URL}?action=shop`);
    const j = (await r.json()) as { ok?: boolean; images?: unknown; bank?: unknown };
    if (!j || !j.ok) return null;
    const images: Record<string, string> = {};
    if (j.images && typeof j.images === 'object') {
      for (const [k, v] of Object.entries(j.images as Record<string, unknown>)) {
        if (typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(v)) images[k] = v;
      }
    }
    const b = j.bank as { bank?: string; number?: string; holder?: string } | null;
    return { images, bank: b && b.number ? { bank: String(b.bank || ''), number: String(b.number), holder: String(b.holder || '') } : null };
  } catch {
    return null;
  }
}
