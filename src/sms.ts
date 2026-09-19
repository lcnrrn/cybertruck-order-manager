export type SmsTemplateId = '완료' | '발송' | 'custom';

export type SmsTemplateBodies = {
  완료: string;
  발송: string;
};

const LS_SMS_TEMPLATES = 'cybertruck-sms-templates-v1';

/** Built-in defaults. 발송 may include {{등기번호}} for tracking injection. */
export const DEFAULT_SMS_BODIES: SmsTemplateBodies = {
  완료: '안녕하세요. 주문하신 제품 제작이 완료되었습니다. 곧 발송 안내드리겠습니다.',
  발송:
    '안녕하세요. 주문하신 제품이 발송되었습니다. 우체국 등기번호는 {{등기번호}} 입니다. 도착까지 조금만 기다려 주세요.',
};

/** @deprecated Prefer getSmsTemplates() — kept for label metadata */
export const SMS_TEMPLATES: Record<
  Exclude<SmsTemplateId, 'custom'>,
  { label: string; body: string }
> = {
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
  if (!done && !ship) return null;
  return {
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
    완료: (bodies.완료 || '').trim() || DEFAULT_SMS_BODIES.완료,
    발송: (bodies.발송 || '').trim() || DEFAULT_SMS_BODIES.발송,
  };
  try {
    localStorage.setItem(LS_SMS_TEMPLATES, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function resetSmsTemplates(): void {
  try {
    localStorage.removeItem(LS_SMS_TEMPLATES);
  } catch {
    /* ignore */
  }
}

/** 제작 완료 SMS body (user-editable). */
export function buildCompleteSmsBody(): string {
  return getSmsTemplates().완료;
}

/**
 * 발송안내 SMS — {{등기번호}} placeholder is replaced when trackingNumber is present.
 * Without tracking, the placeholder clause is stripped.
 * If the template has no placeholder but tracking exists, append a short tracking clause
 * (preserves prior buildShippingSmsBody behavior for custom templates).
 */
export function buildShippingSmsBody(trackingNumber?: string): string {
  const body = getSmsTemplates().발송;
  const tn = trackingNumber?.trim();
  if (tn) {
    if (body.includes('{{등기번호}}')) {
      return body.replaceAll('{{등기번호}}', tn);
    }
    const marker = '발송되었습니다.';
    const idx = body.indexOf(marker);
    if (idx >= 0) {
      const at = idx + marker.length;
      return `${body.slice(0, at)} 우체국 등기번호는 ${tn} 입니다.${body.slice(at)}`;
    }
    return `${body} 우체국 등기번호는 ${tn} 입니다.`;
  }
  return stripTrackingPlaceholder(body);
}

/** sms: URI — iOS/Android 호환. body는 선택 */
export function buildSmsLink(phone: string, body?: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (!digits) return '#';
  if (body && body.trim()) {
    return `sms:${digits}?body=${encodeURIComponent(body.trim())}`;
  }
  return `sms:${digits}`;
}

export function formatPhoneDisplay(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}
