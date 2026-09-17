import type { Order } from './types';
import { STORAGE_KEY } from './types';
import { SAMPLE_ORDERS } from './sampleData';

export function loadOrders(): Order[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SAMPLE_ORDERS));
      return [...SAMPLE_ORDERS];
    }
    const parsed = JSON.parse(raw) as Order[];
    if (!Array.isArray(parsed)) return [...SAMPLE_ORDERS];
    return parsed;
  } catch {
    return [...SAMPLE_ORDERS];
  }
}

export function saveOrders(orders: Order[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}
