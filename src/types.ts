export type OrderStatus = '대기' | '제작중' | '완료';

export interface Order {
  id: string;
  name: string;
  items: string;
  address: string;
  phone: string;
  group?: string;
  status: OrderStatus;
  priority: boolean;
  createdAt: number;
  updatedAt: number;
}

export type StatusFilter = '전체' | OrderStatus;

export const STATUS_OPTIONS: OrderStatus[] = ['대기', '제작중', '완료'];
export const FILTER_OPTIONS: StatusFilter[] = ['전체', '대기', '제작중', '완료'];

export const STORAGE_KEY = 'cybertruck-orders-v1';
