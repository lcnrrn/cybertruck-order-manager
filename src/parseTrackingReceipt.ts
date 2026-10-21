import type { Order } from './types';

export type ParsedTrackingRow = {
  trackingNumber: string;
  recipientHint: string;
  /** 접수내역 형식에서 읽은 주소 (없으면 undefined) */
  address?: string;
  phone?: string;
  /** true = 마스킹 없는 전체 이름 (접수내역 형식) */
  fullName?: boolean;
};

const TRACKING_RE = /(\d{13})/g;

/** 영수증에서 수취인이 아닌 흔한 토큰 */
const NON_NAME = new Set([
  '소포',
  '생활용품',
  '등기',
  '보통',
  '우체국',
  '모바일',
  '영수증',
  '요금',
  '우편번호',
  '수취인',
  '등기번호',
  '발송',
  '중량',
]);

function looksLikeKoreanName(token: string): boolean {
  if (token.length < 2 || token.length > 5) return false;
  if (NON_NAME.has(token)) return false;
  // 한글 + optional * (마스킹)
  if (!/^[가-힣]([가-힣*]*[가-힣])?$/.test(token) && !/^[가-힣]\*[가-힣]$/.test(token)) {
    // allow 임*욱 style and full Hangul 2–4
    if (!/^[가-힣*]+$/.test(token)) return false;
    if (![...token].some((c) => c !== '*')) return false;
  }
  // must start and end with Hangul (not *)
  if (!/^[가-힣]/.test(token) || !/[가-힣]$/.test(token)) return false;
  return true;
}

/**
 * 우체국 모바일 영수증 붙여넣기 → (등기번호, 수취인힌트) 목록.
 * 같은 줄의 13자리 숫자 + 근처 한글(마스킹 포함) 이름을 묶습니다.
 */
export function parseTrackingReceipt(text: string): ParsedTrackingRow[] {
  const blocks = parseEpostHistory(text);
  if (blocks.length) return blocks;
  const rows: ParsedTrackingRow[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    TRACKING_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TRACKING_RE.exec(line)) !== null) {
      const trackingNumber = match[1];
      if (seen.has(trackingNumber)) continue;

      const after = line.slice(match.index + 13);
      const tokens = after.match(/[가-힣][가-힣*]*/g) || [];
      let recipientHint =
        [...tokens].reverse().find((t) => looksLikeKoreanName(t)) || '';

      // 같은 줄에 없으면 다음 1~2줄에서 짧은 이름만 시도
      if (!recipientHint) {
        for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
          const nextTokens = lines[j].match(/[가-힣][가-힣*]*/g) || [];
          const found = nextTokens.find((t) => looksLikeKoreanName(t) && t.length <= 4);
          if (found) {
            recipientHint = found;
            break;
          }
        }
      }

      seen.add(trackingNumber);
      rows.push({ trackingNumber, recipientHint });
    }
  }

  return rows;
}

const LABELS = /^(받는\s*분|받는\s*사람|수취인|등기\s*번호|운송장\s*번호|주소|받는\s*분\s*주소|연락처|전화\s*번호|휴대폰|예상\s*금액|요금|접수\s*번호|중량|내용물|상태)\s*[:：]?\s*(.*)$/;

/**
 * 인터넷우체국 모바일 「접수내역」 붙여넣기:
 *   받는분 / 오종진 / 등기번호 / 6892015240450 (https://...) / 주소 / 서울... / ... / 예상금액 / 4,000원 / - 재신청
 * 라벨 다음 줄(또는 같은 줄 ':' 뒤)이 값. 블록은 '받는분' 이 다시 나오거나 '재신청' 줄에서 끝남.
 */
export function parseEpostHistory(text: string): ParsedTrackingRow[] {
  if (!/받는\s*분|수취인/.test(text) || !/등기\s*번호|운송장/.test(text)) return [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ParsedTrackingRow[] = [];
  const seen = new Set<string>();
  let cur: { name?: string; tn?: string; addr?: string; phone?: string } = {};
  const flush = () => {
    if (cur.tn && !seen.has(cur.tn)) {
      seen.add(cur.tn);
      out.push({ trackingNumber: cur.tn, recipientHint: cur.name || '', address: cur.addr, phone: cur.phone, fullName: Boolean(cur.name && !cur.name.includes('*')) });
    }
    cur = {};
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^-?\s*재신청/.test(line)) { flush(); continue; }
    const m = LABELS.exec(line);
    if (!m) continue;
    const label = m[1].replace(/\s/g, '');
    let val = m[2].trim();
    if (!val && i + 1 < lines.length && !LABELS.test(lines[i + 1])) val = lines[++i];
    if (label === '받는분' || label === '받는사람' || label === '수취인') {
      if (cur.tn) flush();
      const nm = (val.match(/[가-힣*]{2,}/) || [''])[0];
      cur.name = nm;
    } else if (label === '등기번호' || label === '운송장번호') {
      const tn = val.replace(/[\s-]/g, '').match(/\d{13}/);
      if (tn) cur.tn = tn[0];
    } else if (label === '주소' || label === '받는분주소') {
      cur.addr = val;
    } else if (label === '연락처' || label === '전화번호' || label === '휴대폰') {
      cur.phone = val.replace(/\D/g, '');
    }
  }
  flush();
  return out;
}

function normAddr(s: string): string {
  return s.replace(/특별시|광역시|특별자치시|특별자치도|[()\s,.-]/g, '').replace(/^서울시?/, '서울').replace(/^경기도/, '경기');
}

/** 주소 유사도 0~1 (공통 토큰 비율) */
export function addressSimilarity(a: string, b: string): number {
  const tok = (s: string) => new Set(s.split(/[\s,()]+/).map(normAddr).filter((t) => t.length >= 2));
  const A = tok(a);
  const B = tok(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const t of A) if (B.has(t)) n += 1;
  return n / Math.min(A.size, B.size);
}

/** 전체 이름 ↔ 주문 이름 ('오종진' ↔ '오종진 아원', '제이제이 유형곤') */
export function nameMatchesFull(orderName: string, name: string): boolean {
  const o = orderName.replace(/\s+/g, ' ').trim();
  const n = name.trim();
  if (!o || !n || n.length < 2) return false;
  return o === n || o.startsWith(n) || o.split(' ').includes(n) || o.includes(n);
}

/** 마스킹 이름 `임*욱` ↔ 주문 이름 매칭 (길이·첫·끝 글자) */
export function nameMatchesReceipt(orderName: string, receiptName: string): boolean {
  const o = orderName.trim();
  const r = receiptName.trim();
  if (!o || !r) return false;
  if (o === r) return true;
  if (!r.includes('*')) return false;
  if (o.length !== r.length) return false;
  for (let i = 0; i < r.length; i++) {
    if (r[i] === '*') continue;
    if (r[i] !== o[i]) return false;
  }
  return true;
}

export type MatchKind = 'matched' | 'ambiguous' | 'unmatched';

export type TrackingMatchPreview = {
  trackingNumber: string;
  recipientHint: string;
  kind: MatchKind;
  candidates: Order[];
  /** 확정된 주문 id (matched 또는 사용자가 고른 ambiguous) */
  selectedOrderId: string | null;
};

function preferUnshipped(a: Order, b: Order): number {
  // “이미 송장 있는 주문”보다 없는 쪽 우선
  const aHas = a.trackingNumber ? 1 : 0;
  const bHas = b.trackingNumber ? 1 : 0;
  if (aHas !== bHas) return aHas - bHas;
  // 완료(발송 대기) > 제작중 > 대기
  const rank = (s: Order['status']) =>
    s === '완료' ? 0 : s === '제작중' ? 1 : 2;
  return rank(a.status) - rank(b.status);
}

export function hasFreeRegistered(o: Order): boolean {
  return (o.shipments || []).some((x) => x.postStatus === 'registered' && !x.trackingNumber);
}

export function matchTrackingRows(
  rows: ParsedTrackingRow[],
  orders: Order[],
): TrackingMatchPreview[] {
  const res = (row: ParsedTrackingRow, kind: MatchKind, candidates: Order[]): TrackingMatchPreview => ({
    trackingNumber: row.trackingNumber,
    recipientHint: row.recipientHint,
    kind,
    candidates,
    selectedOrderId: kind === 'matched' ? candidates[0].id : null,
  });
  return rows.map((row) => {
    const hint = row.recipientHint;
    if (hint && !hint.includes('*') && row.fullName !== false) {
      // 1) 전체 이름: 송장 없는 접수 완료 발송건이 있는 주문 우선
      const byName = orders.filter((o) => nameMatchesFull(o.name, hint));
      const free = byName.filter(hasFreeRegistered);
      const pool = free.length ? free : byName;
      if (pool.length === 1) return res(row, 'matched', pool);
      // 2) 동명이인/미매칭: 주소·전화로 좁히기
      const scoreOf = (o: Order) =>
        (row.address ? addressSimilarity(row.address, o.address) : 0) +
        (row.phone && o.phone && row.phone.slice(-8) === o.phone.replace(/\D/g, '').slice(-8) ? 1 : 0);
      const base = pool.length ? pool : orders.filter((o) => o.status !== '완료' || hasFreeRegistered(o));
      const scored = base.map((o) => ({ o, sc: scoreOf(o) })).filter((x) => x.sc >= 0.6).sort((a, b) => b.sc - a.sc);
      if (scored.length === 1 || (scored.length > 1 && scored[0].sc - scored[1].sc >= 0.3)) {
        return res(row, 'matched', [scored[0].o, ...scored.slice(1).map((x) => x.o)]);
      }
      if (scored.length > 1) return res(row, 'ambiguous', scored.map((x) => x.o));
      if (pool.length > 1) return res(row, 'ambiguous', pool.slice().sort(preferUnshipped));
      return res(row, 'unmatched', []);
    }
    if (!hint) return res(row, 'unmatched', []);
    const candidates = orders
      .filter((o) => nameMatchesReceipt(o.name, hint))
      .slice()
      .sort(preferUnshipped);
    if (candidates.length === 0) return res(row, 'unmatched', []);
    if (candidates.length === 1) return res(row, 'matched', candidates);
    return res(row, 'ambiguous', candidates);
  });
}
