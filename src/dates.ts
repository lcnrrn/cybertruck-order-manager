const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export function toYmd(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 날짜(YYYY-MM-DD)만 바꾸고 시각은 기존 값 유지 */
export function withYmd(ms: number, ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ms;
  const base = new Date(ms || Date.now());
  return new Date(y, m - 1, d, base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds()).getTime();
}

/** '10/19(월)' — 올해가 아니면 '2025/10/19(일)' */
export function formatOrderDate(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const y = d.getFullYear() !== new Date(now).getFullYear() ? `${d.getFullYear()}/` : '';
  return `${y}${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
}

/** 달력 기준 경과일: 0=오늘 */
export function daysAgo(ms: number, now = Date.now()): number {
  const a = new Date(ms);
  const b = new Date(now);
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / 86400000);
}

export function relativeLabel(ms: number, now = Date.now()): string {
  const n = daysAgo(ms, now);
  if (n <= 0) return '오늘';
  if (n === 1) return '어제';
  return `${n}일 전`;
}

/** 엑셀/폼 내보내기의 제출일시 → ms (실패 시 undefined) */
export function parseSubmittedAt(v: unknown): number | undefined {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.getTime();
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // 엑셀 날짜 일련번호 (로컬 시각)
    const days = Math.floor(v);
    const frac = v - days;
    const d = new Date(1899, 11, 30 + days);
    return d.getTime() + Math.round(frac * 86400000);
  }
  const s = String(v ?? '').trim();
  const m = s.match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?\.?(?:\s*(오전|오후)?\s*(\d{1,2})\s*[:시]\s*(\d{1,2})(?:\s*[:분]\s*(\d{1,2}))?)?/);
  if (!m) return undefined;
  let h = Number(m[5] || 0);
  if (m[4] === '오후' && h < 12) h += 12;
  if (m[4] === '오전' && h === 12) h = 0;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, Number(m[6] || 0), Number(m[7] || 0)).getTime();
  return Number.isNaN(t) ? undefined : t;
}
