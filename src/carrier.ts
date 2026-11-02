import type { Shipment } from './types';

/** 택배사: 우체국(기본, 예전 데이터엔 carrier 가 없음) · 경동화물(MAT 등 큰 짐, 수동 송장) */
export type Carrier = 'epost' | 'kyungdong';

export const CARRIER_OPTIONS: { id: Carrier; label: string }[] = [
  { id: 'epost', label: '우체국' },
  { id: 'kyungdong', label: '경동화물' },
];

export function carrierOf(s?: Pick<Shipment, 'carrier'> | null): Carrier {
  return s?.carrier === 'kyungdong' ? 'kyungdong' : 'epost';
}

export function isKyungdong(s?: Pick<Shipment, 'carrier'> | null): boolean {
  return carrierOf(s) === 'kyungdong';
}

export function carrierName(c: Carrier): string {
  return c === 'kyungdong' ? '경동화물' : '우체국';
}

/** 경동택배 공식 운송장조회 URL (2023-04 홈페이지 개편 공지 기준) */
export function kyungdongTrackUrl(no: string): string {
  return `https://kdexp.com/service/delivery/etc/delivery.do?barcode=${encodeURIComponent(no.replace(/\D/g, ''))}`;
}

export function epostTrackUrl(no: string): string {
  return `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${encodeURIComponent(no.replace(/\D/g, ''))}`;
}

export function trackUrl(c: Carrier, no: string): string {
  return c === 'kyungdong' ? kyungdongTrackUrl(no) : epostTrackUrl(no);
}
