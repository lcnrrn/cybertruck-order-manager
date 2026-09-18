import type { Order } from './types';

export type ParsedTrackingRow = {
  trackingNumber: string;
  recipientHint: string;
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

export function matchTrackingRows(
  rows: ParsedTrackingRow[],
  orders: Order[],
): TrackingMatchPreview[] {
  return rows.map((row) => {
    const hint = row.recipientHint;
    if (!hint) {
      return {
        trackingNumber: row.trackingNumber,
        recipientHint: hint,
        kind: 'unmatched' as const,
        candidates: [],
        selectedOrderId: null,
      };
    }

    const candidates = orders
      .filter((o) => nameMatchesReceipt(o.name, hint))
      .slice()
      .sort(preferUnshipped);

    if (candidates.length === 0) {
      return {
        trackingNumber: row.trackingNumber,
        recipientHint: hint,
        kind: 'unmatched' as const,
        candidates: [],
        selectedOrderId: null,
      };
    }

    if (candidates.length === 1) {
      return {
        trackingNumber: row.trackingNumber,
        recipientHint: hint,
        kind: 'matched' as const,
        candidates,
        selectedOrderId: candidates[0].id,
      };
    }

    return {
      trackingNumber: row.trackingNumber,
      recipientHint: hint,
      kind: 'ambiguous' as const,
      candidates,
      selectedOrderId: null,
    };
  });
}
