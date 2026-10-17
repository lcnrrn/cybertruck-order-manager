import { expenseLines, loadExpenses } from './expenses';
import { loadFilament } from './filament';
import type { Order } from './types';
import type { Product } from './products';
import { orderAmount } from './production';
import { SETTING_LS_KEYS, SETTINGS_APPLIED_EVENT, markSettingChanged, type SettingKey } from './settingsMeta';

function fmtDate(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function stamp(): string {
  return fmtDate(Date.now()).replace(/[-: ]/g, '').slice(0, 12);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 주문 → 엑셀(.xlsx) */
export async function exportOrdersXlsx(orders: Order[], products: Product[], label = '전체'): Promise<void> {
  const XLSX = await import('xlsx');
  const sorted = [...orders].sort((a, b) => a.createdAt - b.createdAt);
  const rows = sorted.map((o) => ({
    등록일: fmtDate(o.createdAt),
    이름: o.name,
    연락처: o.phone,
    주소: o.address,
    주문내용: o.items,
    경로: o.group || '',
    상태: o.status,
    우선: o.priority ? '★' : '',
    금액: orderAmount(o, products),
    금액직접입력: o.amount !== undefined ? 'Y' : '',
    입금: o.paid ? '입금완료' : '미입금',
    입금일: fmtDate(o.paidAt),
    송장번호: o.trackingNumber || '',
    필라멘트g: o.filamentG ?? '',
    수정일: fmtDate(o.updatedAt),
    id: o.id,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [16, 10, 14, 36, 40, 10, 8, 5, 10, 8, 9, 16, 16, 9, 16, 12].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '주문');
  const lines = expenseLines(loadExpenses(), loadFilament()).sort((x, y) => x.at - y.at);
  if (lines.length) {
    const ws2 = XLSX.utils.json_to_sheet(
      lines.map((l) => ({ 날짜: fmtDate(l.at), 분류: l.category, 내용: l.note, 금액: l.amount })),
    );
    ws2['!cols'] = [16, 10, 40, 12].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws2, '지출');
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  download(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `사이버트럭주문_${label}_${stamp()}.xlsx`,
  );
}

const KEYS = Object.keys(SETTING_LS_KEYS) as SettingKey[];

export interface BackupFile {
  app: 'cybertruck-order-manager';
  version: 1;
  exportedAt: number;
  orders: Order[];
  settings: Partial<Record<SettingKey, unknown>>;
}

export function exportJsonBackup(orders: Order[]): void {
  const settings: BackupFile['settings'] = {};
  for (const k of KEYS) {
    try {
      const raw = localStorage.getItem(SETTING_LS_KEYS[k]);
      if (raw) settings[k] = JSON.parse(raw);
    } catch {
      /* ignore */
    }
  }
  const data: BackupFile = { app: 'cybertruck-order-manager', version: 1, exportedAt: Date.now(), orders, settings };
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `사이버트럭주문_백업_${stamp()}.json`);
}

export function parseBackup(text: string): BackupFile {
  const d = JSON.parse(text) as Partial<BackupFile>;
  if (!d || d.app !== 'cybertruck-order-manager' || !Array.isArray(d.orders)) {
    throw new Error('이 앱의 백업 파일이 아닙니다.');
  }
  const orders = d.orders.filter((o): o is Order => !!o && typeof o.id === 'string' && typeof o.name === 'string');
  return { app: 'cybertruck-order-manager', version: 1, exportedAt: Number(d.exportedAt) || 0, orders, settings: d.settings || {} };
}

/** 설정 복원 + 주문은 updatedAt을 지금으로 올려 동기화 시 복원본이 이기도록 */
export function applyBackupSettings(b: BackupFile): Order[] {
  for (const k of KEYS) {
    const v = b.settings[k];
    if (v === undefined) continue;
    try {
      localStorage.setItem(SETTING_LS_KEYS[k], JSON.stringify(v));
      markSettingChanged(k);
    } catch {
      /* ignore */
    }
  }
  try {
    window.dispatchEvent(new CustomEvent(SETTINGS_APPLIED_EVENT));
  } catch {
    /* ignore */
  }
  const now = Date.now();
  return b.orders.map((o) => ({ ...o, updatedAt: now }));
}
