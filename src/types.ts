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

/** 작업중 = 대기 + 제작중 (기본 작업 큐) */
export type StatusFilter = '작업중' | '전체' | OrderStatus;

export const STATUS_OPTIONS: OrderStatus[] = ['대기', '제작중', '완료'];
export const FILTER_OPTIONS: StatusFilter[] = ['작업중', '대기', '제작중', '완료', '전체'];

export type PeriodPreset = 'this_month' | 'last_month' | 'all' | 'custom';

export interface PeriodRange {
  preset: PeriodPreset;
  /** YYYY-MM-DD — custom only */
  from?: string;
  /** YYYY-MM-DD — custom only */
  to?: string;
}

export const STORAGE_KEY = 'cybertruck-orders-v1';
export const STATUS_FILTER_KEY = 'cybertruck-status-filter';
export const PERIOD_FILTER_KEY = 'cybertruck-period-filter';
