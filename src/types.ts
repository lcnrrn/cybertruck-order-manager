export type OrderStatus = '대기' | '제작중' | '완료';

export interface Order {
  id: string;
  name: string;
  items: string;
  address: string;
  phone: string;
  /** 주문 경로 (UI label). Sheet column stays `group` for sync. */
  group?: string;
  status: OrderStatus;
  priority: boolean;
  /** 우체국 등기(송장)번호 — 기존 저장분에는 없을 수 있음 */
  trackingNumber?: string;
  createdAt: number;
  updatedAt: number;
}

export type StatusFilter = '전체' | OrderStatus;

export const STATUS_OPTIONS: OrderStatus[] = ['대기', '제작중', '완료'];
export const FILTER_OPTIONS: StatusFilter[] = ['전체', '대기', '제작중', '완료'];

export const STORAGE_KEY = 'cybertruck-orders-v1';
