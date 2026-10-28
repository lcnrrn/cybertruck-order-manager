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

function ymdOf(ms?: number): string {
  return ms ? fmtDate(ms).slice(0, 10) : '';
}
function monthKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 장부 기간 선택지: 주문이 있는 달 (최신순) */
export function ledgerMonths(orders: Order[]): string[] {
  const set = new Set<string>();
  for (const o of orders) set.add(monthKeyOf(o.createdAt || o.updatedAt));
  return [...set].sort().reverse();
}

/**
 * 장부(세무·정산용) 엑셀: 요약 / 월별 / 매출장부 / 지출장부 / 주문 전체.
 * month = 'YYYY-MM' 이면 그 달만, 'all' 이면 전체. 공급가액·부가세는 합계를 1.1로 나눈 참고값(과세사업자 기준).
 */
export async function exportLedgerXlsx(orders: Order[], products: Product[], month: string): Promise<{ orders: number; expenses: number }> {
  const XLSX = await import('xlsx');
  const inMonth = (ms: number) => month === 'all' || monthKeyOf(ms) === month;
  const list = orders.filter((o) => inMonth(o.createdAt || o.updatedAt)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const lines = expenseLines(loadExpenses(), loadFilament()).filter((l) => inMonth(l.at)).sort((x, y) => x.at - y.at);
  const supply = (n: number) => Math.round(n / 1.1);

  const sales = list.map((o) => {
    const amt = orderAmount(o, products);
    return {
      접수일: ymdOf(o.createdAt || o.updatedAt),
      입금일: ymdOf(o.paidAt),
      이름: o.name,
      연락처: o.phone,
      주문내용: o.items,
      합계금액: amt,
      공급가액: supply(amt),
      부가세: amt - supply(amt),
      입금: o.paid ? '입금완료' : '미입금',
      상태: o.status,
      송장번호: o.trackingNumber || (o.shipments || []).map((x) => x.trackingNumber).filter(Boolean).join(', '),
    };
  });
  const sum = (k: '합계금액' | '공급가액' | '부가세') => sales.reduce((a, r) => a + r[k], 0);
  const paidSum = list.filter((o) => o.paid).reduce((a, o) => a + orderAmount(o, products), 0);
  const expSum = lines.reduce((a, l) => a + l.amount, 0);

  const wb = XLSX.utils.book_new();
  const summary = [
    ['항목', '값', '설명'],
    ['기간', month === 'all' ? '전체' : month, ''],
    ['주문 수', list.length, ''],
    ['매출 합계', sum('합계금액'), '주문 금액 합계'],
    ['입금 합계', paidSum, '입금완료로 표시된 금액'],
    ['미입금', sum('합계금액') - paidSum, ''],
    ['지출 합계', expSum, '필라멘트 구매 + 직접 입력한 지출'],
    ['매출 − 지출', sum('합계금액') - expSum, '단순 차액 (택배비·원가 추정은 앱의 「원가 · 순이익」 화면)'],
    ['공급가액(참고)', sum('공급가액'), '합계 ÷ 1.1 — 면세·간이과세면 무시'],
    ['부가세(참고)', sum('부가세'), ''],
  ];
  const wsSum = XLSX.utils.aoa_to_sheet(summary);
  wsSum['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 54 }];
  XLSX.utils.book_append_sheet(wb, wsSum, '요약');

  const byMonth = new Map<string, { 주문수: number; 매출: number; 입금: number; 지출: number }>();
  const row = (k: string) => byMonth.get(k) || (byMonth.set(k, { 주문수: 0, 매출: 0, 입금: 0, 지출: 0 }), byMonth.get(k)!);
  for (const o of list) {
    const r = row(monthKeyOf(o.createdAt || o.updatedAt));
    const a = orderAmount(o, products);
    r.주문수 += 1;
    r.매출 += a;
    if (o.paid) r.입금 += a;
  }
  for (const l of lines) row(monthKeyOf(l.at)).지출 += l.amount;
  const monthly = [...byMonth.entries()].sort().map(([k, r]) => ({ 월: k, 주문수: r.주문수, 매출: r.매출, 입금: r.입금, 미입금: r.매출 - r.입금, 지출: r.지출, '매출−지출': r.매출 - r.지출 }));
  const wsM = XLSX.utils.json_to_sheet(monthly);
  wsM['!cols'] = [10, 8, 12, 12, 12, 12, 12].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, wsM, '월별');

  const wsS = XLSX.utils.json_to_sheet(sales);
  wsS['!cols'] = [11, 11, 12, 14, 40, 11, 11, 10, 9, 7, 18].map((wch) => ({ wch }));
  XLSX.utils.sheet_add_aoa(wsS, [['합계', '', '', '', '', sum('합계금액'), sum('공급가액'), sum('부가세')]], { origin: -1 });
  XLSX.utils.book_append_sheet(wb, wsS, '매출장부');

  const wsE = XLSX.utils.json_to_sheet(lines.map((l) => ({ 날짜: ymdOf(l.at), 분류: l.category, 내용: l.note, 금액: l.amount })));
  wsE['!cols'] = [11, 12, 44, 12].map((wch) => ({ wch }));
  XLSX.utils.sheet_add_aoa(wsE, [['합계', '', '', expSum]], { origin: -1 });
  XLSX.utils.book_append_sheet(wb, wsE, '지출장부');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  download(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `사이버트럭_장부_${month === 'all' ? '전체' : month}_${stamp()}.xlsx`,
  );
  return { orders: list.length, expenses: lines.length };
}

const KEYS = Object.keys(SETTING_LS_KEYS) as SettingKey[];

export interface BackupFile {
  app: 'cybertruck-order-manager';
  version: 1;
  exportedAt: number;
  orders: Order[];
  settings: Partial<Record<SettingKey, unknown>>;
}

/** 지금 주문 + 설정을 백업 파일 형태로 (제품 사진은 용량이 커서 제외 — 사진은 시트에도 저장돼 있음) */
export function buildBackup(orders: Order[], withImages = true): BackupFile {
  const settings: BackupFile['settings'] = {};
  for (const k of KEYS) {
    if (!withImages && k === 'productImages') continue;
    try {
      const raw = localStorage.getItem(SETTING_LS_KEYS[k]);
      if (raw) settings[k] = JSON.parse(raw);
    } catch {
      /* ignore */
    }
  }
  return { app: 'cybertruck-order-manager', version: 1, exportedAt: Date.now(), orders, settings };
}

export function downloadBackupFile(data: BackupFile): void {
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `사이버트럭주문_백업_${stamp()}.json`);
}

export function exportJsonBackup(orders: Order[]): void {
  downloadBackupFile(buildBackup(orders));
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
