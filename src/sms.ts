export type SmsTemplateId = '접수' | '완료' | '발송' | 'custom';

export type SmsTemplateBodies = {
  접수: string;
  완료: string;
  발송: string;
};

import { markSettingChanged } from './settingsMeta';
import { carrierName, kyungdongTrackUrl, type Carrier } from './carrier';

const LS_SMS_TEMPLATES = 'cybertruck-sms-templates-v1';

/** Built-in defaults. 발송 may include {{등기번호}} for tracking injection. */
export const DEFAULT_SMS_BODIES: SmsTemplateBodies = {
  접수:
    '안녕하세요 {{이름}}님, 주문 접수되었습니다.\n주문내용: {{주문내용}}\n결제금액: {{금액}}\n입금계좌: [은행명 계좌번호 예금주]\n입금 확인 후 제작 시작하겠습니다. 감사합니다.',
  완료: '안녕하세요. 주문하신 제품 제작이 완료되었습니다. 곧 발송 안내드리겠습니다.',
  발송:
    '안녕하세요. 주문하신 제품이 발송되었습니다. 우체국 등기번호는 {{등기번호}} 입니다. 도착까지 조금만 기다려 주세요.',
};

/** @deprecated Prefer getSmsTemplates() — kept for label metadata */
export const SMS_TEMPLATES: Record<
  Exclude<SmsTemplateId, 'custom'>,
  { label: string; body: string }
> = {
  접수: {
    label: '주문 접수',
    body: DEFAULT_SMS_BODIES.접수,
  },
  완료: {
    label: '제작 완료',
    body: DEFAULT_SMS_BODIES.완료,
  },
  발송: {
    label: '발송 안내',
    body: DEFAULT_SMS_BODIES.발송.replace(
      /\s*우체국 등기번호는 \{\{등기번호\}\} 입니다\.?/,
      '',
    ).replace(/  +/g, ' ').trim(),
  },
};

function stripTrackingPlaceholder(body: string): string {
  return body
    .replace(/\s*우체국 등기번호는 \{\{등기번호\}\} 입니다\.?/g, '')
    .replace(/\{\{등기번호\}\}/g, '')
    .replace(/  +/g, ' ')
    .replace(/ \./g, '.')
    .trim();
}

function normalizeBodies(raw: unknown): SmsTemplateBodies | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const done = typeof o['완료'] === 'string' ? o['완료'].trim() : '';
  const ship = typeof o['발송'] === 'string' ? o['발송'].trim() : '';
  const recv = typeof o['접수'] === 'string' ? o['접수'].trim() : '';
  if (!done && !ship && !recv) return null;
  return {
    접수: recv || DEFAULT_SMS_BODIES.접수,
    완료: done || DEFAULT_SMS_BODIES.완료,
    발송: ship || DEFAULT_SMS_BODIES.발송,
  };
}

/** Load editable SMS bodies from localStorage (falls back to defaults). */
export function getSmsTemplates(): SmsTemplateBodies {
  try {
    const raw = localStorage.getItem(LS_SMS_TEMPLATES);
    if (raw) {
      const parsed = normalizeBodies(JSON.parse(raw) as unknown);
      if (parsed) return parsed;
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SMS_BODIES };
}

/** Persist SMS template bodies. */
export function setSmsTemplates(bodies: SmsTemplateBodies): void {
  const next: SmsTemplateBodies = {
    접수: (bodies.접수 || '').trim() || DEFAULT_SMS_BODIES.접수,
    완료: (bodies.완료 || '').trim() || DEFAULT_SMS_BODIES.완료,
    발송: (bodies.발송 || '').trim() || DEFAULT_SMS_BODIES.발송,
  };
  try {
    localStorage.setItem(LS_SMS_TEMPLATES, JSON.stringify(next));
    markSettingChanged('sms');
  } catch {
    /* ignore */
  }
}

export function resetSmsTemplates(): void {
  try {
    localStorage.removeItem(LS_SMS_TEMPLATES);
    markSettingChanged('sms');
  } catch {
    /* ignore */
  }
}


/** 구매자 주문 조회 페이지 (고정 주소 — 앱 주소와 같은 사이트) */
export const LOOKUP_PAGE_URL = 'https://lcnrrn.github.io/cybertruck-order-manager/lookup.html';

/**
 * 구매자 조회 링크. 이름(성함)과 전화번호 뒷 4자리를 주소에 미리 넣어 두면
 * 조회 페이지가 열리자마자 그 사람 주문만 자동으로 보여 줌 (서버는 이름+뒷4자리가 둘 다 맞아야 답함 → 남의 주문은 안 보임).
 * 이름이나 번호가 부족하면 그냥 조회 페이지 주소만.
 * 이름이 「닉네임 성함」 형식이면 서버가 끝 단어를 성함으로 보므로 마지막 단어를 씀.
 */
export function buildLookupLink(buyer?: { name?: string; phone?: string }): string {
  const last4 = (buyer?.phone || '').replace(/\D/g, '').slice(-4);
  const nm = (buyer?.name || '').trim().split(/\s+/).pop() || '';
  const digits = (buyer?.phone || '').replace(/\D/g, '');
  if (!nm || digits.length < 10 || last4.length !== 4) return LOOKUP_PAGE_URL;
  return `${LOOKUP_PAGE_URL}?n=${encodeURIComponent(nm)}&k=${last4}`;
}

/** {{조회링크}} 를 링크로 바꿈. 템플릿에 없으면 맨 끝에 「label: 링크」 줄을 붙임. */
export function withLookupLink(body: string, link: string, label: string): string {
  if (body.includes('{{조회링크}}')) return body.replaceAll('{{조회링크}}', link);
  return `${body.replace(/\s+$/, '')}\n${label}: ${link}`;
}

/** 「🔗 조회 링크」 버튼 문자 — 짧은 안내 + 링크만 */
export function buildLookupSmsBody(buyer: { name?: string; phone?: string }): string {
  return `안녕하세요 ${(buyer.name || '').trim() ? `${buyer.name!.trim()}님, ` : ''}주문하신 제품의 제작 진행 상황은 아래 링크에서 확인하실 수 있어요.\n${buildLookupLink(buyer)}`;
}

/** 주문 접수 SMS — {{이름}} {{주문내용}} {{금액}} {{조회링크}} 치환 (템플릿에 {{조회링크}} 없으면 끝에 조회 링크 줄 자동 추가) */
export function buildReceiptSmsBody(o: { name: string; items: string; phone?: string }, amountWon: string): string {
  const body = getSmsTemplates()
    .접수.replaceAll('{{이름}}', o.name || '')
    .replaceAll('{{주문내용}}', (o.items || '').replace(/\s*\n\s*/g, ' / '))
    .replaceAll('{{금액}}', amountWon);
  return withLookupLink(body, buildLookupLink(o), '제작 진행 상황 확인');
}

/** 제작 완료 SMS body (user-editable). */
export function buildCompleteSmsBody(): string {
  return getSmsTemplates().완료;
}

/**
 * 발송안내 SMS — {{등기번호}} placeholder is replaced when trackingNumber is present.
 * {{택배사}} 는 택배사 이름(우체국/경동화물)으로 바뀜.
 * 경동화물이면 템플릿의 「우체국 등기번호」→「경동화물 송장번호」, 「우체국」→「경동화물」로 바꾸고 경동 배송조회 링크를 붙임.
 * Without tracking, the placeholder clause is stripped.
 * If the template has no placeholder but tracking exists, append a short tracking clause
 * (preserves prior buildShippingSmsBody behavior for custom templates).
 */
export function buildShippingSmsBody(
  trackingNumber?: string,
  carrier: Carrier = 'epost',
  buyer?: { name?: string; phone?: string },
): string {
  const out = buildShippingCore(trackingNumber, carrier);
  return buyer ? withLookupLink(out, buildLookupLink(buyer), '주문 조회') : out.replaceAll('{{조회링크}}', LOOKUP_PAGE_URL);
}

function buildShippingCore(trackingNumber: string | undefined, carrier: Carrier): string {
  const kd = carrier === 'kyungdong';
  const name = carrierName(carrier);
  let body = getSmsTemplates().발송.replaceAll('{{택배사}}', name);
  if (kd) body = body.replaceAll('우체국 등기번호', '경동화물 송장번호').replaceAll('우체국', '경동화물');
  const tn = trackingNumber?.trim();
  if (tn) {
    const clause = kd ? `경동화물 송장번호는 ${tn} 입니다.` : `우체국 등기번호는 ${tn} 입니다.`;
    let out: string;
    if (body.includes('{{등기번호}}')) {
      out = body.replaceAll('{{등기번호}}', tn);
    } else {
      const marker = '발송되었습니다.';
      const idx = body.indexOf(marker);
      if (idx >= 0) {
        const at = idx + marker.length;
        out = `${body.slice(0, at)} ${clause}${body.slice(at)}`;
      } else {
        out = `${body} ${clause}`;
      }
    }
    return kd ? `${out}\n배송조회: ${kyungdongTrackUrl(tn)}` : out;
  }
  return stripTrackingPlaceholder(body);
}

const isIOS = typeof navigator !== 'undefined' && typeof document !== 'undefined' && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;

/** sms: URI — iPhone 은 번호&body= , 그 외는 번호?body= . body는 선택 (문자 보내기 화면·주문 카드 공용) */
export function buildSmsLink(phone: string, body?: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (!digits) return '#';
  if (body && body.trim()) {
    return `sms:${digits}${isIOS ? '&' : '?'}body=${encodeURIComponent(body.trim())}`;
  }
  return `sms:${digits}`;
}

export function formatPhoneDisplay(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}
