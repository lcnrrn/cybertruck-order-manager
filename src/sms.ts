export type SmsTemplateId = '완료' | '발송' | 'custom';

export const SMS_TEMPLATES: Record<
  Exclude<SmsTemplateId, 'custom'>,
  { label: string; body: string }
> = {
  완료: {
    label: '제작 완료',
    body: '안녕하세요. 주문하신 제품 제작이 완료되었습니다. 곧 발송 안내드리겠습니다.',
  },
  발송: {
    label: '발송 안내',
    body: '안녕하세요. 주문하신 제품이 발송되었습니다. 도착까지 조금만 기다려 주세요.',
  },
};

/** sms: URI - iOS/Android compatible. body optional */
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
