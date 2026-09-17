import type { Order } from './types';

/**
 * Reminders 스타일 한 줄 파싱 (best-effort)
 * 예: `이름 - 주문 / 주소 01012345678`
 *     `김민수 / 사이드미러 / 서울시 강남구 ... / 010-1234-5678`
 */
export function parseReminderLine(line: string): Partial<Order> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // 전화번호 추출 (010으로 시작하는 한국 번호)
  const phoneMatch = trimmed.match(/(01[0-9][-.\s]?\d{3,4}[-.\s]?\d{4})/);
  const phone = phoneMatch
    ? phoneMatch[1].replace(/[-.\s]/g, '')
    : '';

  let rest = trimmed;
  if (phoneMatch) {
    rest = trimmed.replace(phoneMatch[0], '').trim();
  }

  // 구분자로 분리: " - ", " / ", " | ", 탭 등
  const parts = rest
    .split(/\s*[-–—|/·]\s*|\t+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0 && !phone) return null;

  // 흔한 패턴: 이름 / 주문 / 주소
  let name = '';
  let items = '';
  let address = '';

  if (parts.length >= 3) {
    name = parts[0];
    items = parts[1];
    address = parts.slice(2).join(' ').trim();
  } else if (parts.length === 2) {
    name = parts[0];
    // 두 번째가 주소처럼 보이면 (시/구/동/로/길 포함)
    if (/[시군구읍면동로길호]/.test(parts[1])) {
      address = parts[1];
      items = '';
    } else {
      items = parts[1];
    }
  } else if (parts.length === 1) {
    name = parts[0];
  }

  // 주소에서 남은 잡음 정리
  address = address.replace(/^[/|\-–—·\s]+|[/|\-–—·\s]+$/g, '').trim();
  items = items.replace(/^[/|\-–—·\s]+|[/|\-–—·\s]+$/g, '').trim();

  if (!name && !items && !address && !phone) return null;

  return {
    name: name || '이름없음',
    items: items || '',
    address: address || '',
    phone,
    status: '대기',
    priority: false,
  };
}

export function parseReminderText(text: string): Partial<Order>[] {
  return text
    .split(/\r?\n/)
    .map((line) => parseReminderLine(line))
    .filter((o): o is Partial<Order> => o !== null);
}
