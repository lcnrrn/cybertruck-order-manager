import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Order, OrderStatus, PeriodRange, StatusFilter } from '../types';
import type { SourceFilter } from '../sources';
import { loadOrders, saveOrders } from '../storage';
import { orderTimestamp, resolvePeriodBounds } from '../period';
import type { Product } from '../products';
import { isUnpaid } from '../production';
import { loadFilament, orderUseByType } from '../filament';

/** 완료 전환 시 필라멘트 차감 기록, 완료 해제 시 되돌림 (중복 차감 방지) */
function applyFilament(prev: Order, next: Order, catalog: Product[]): Order {
  if (next.status === '완료' && prev.status !== '완료' && next.filamentG === undefined && !next.filamentUse) {
    return withDeduction(next, catalog, Date.now());
  }
  if (next.status !== '완료' && prev.status === '완료' && (next.filamentG !== undefined || next.filamentUse)) {
    const r = { ...next };
    delete r.filamentG;
    delete r.filamentAt;
    delete r.filamentUse;
    return r;
  }
  return next;
}

function withDeduction(o: Order, catalog: Product[], now: number): Order {
  const use = orderUseByType(o, catalog, loadFilament());
  const g = Object.values(use).reduce((a, b) => a + b, 0);
  if (g > 0) return { ...o, filamentG: g, filamentAt: now, filamentUse: use };
  return o;
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function matchesStatus(status: OrderStatus, filter: StatusFilter): boolean {
  if (filter === '전체' || filter === '미입금') return true;
  if (filter === '작업중') return status === '대기' || status === '제작중';
  return status === filter;
}

function normalizeSearch(s: string): string {
  return s.toLowerCase().replace(/[-\s]/g, '');
}

export function useOrders(products: Product[] = []) {
  const [orders, setOrders] = useState<Order[]>(() => loadOrders());
  const productsRef = useRef(products);
  productsRef.current = products;

  useEffect(() => {
    saveOrders(orders);
  }, [orders]);

  const replaceOrders = useCallback((next: Order[]) => {
    setOrders(next);
  }, []);

  const addOrder = useCallback((data: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = Date.now();
    let order: Order = {
      ...data,
      id: uid(),
      createdAt: now,
      updatedAt: now,
    };
    if (order.status === '완료') {
      order = withDeduction(order, productsRef.current, now);
    }
    setOrders((prev) => [order, ...prev]);
    return order;
  }, []);

  const updateOrder = useCallback((id: string, patch: Partial<Order>) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        let next: Order = { ...o, ...patch, id: o.id, updatedAt: Date.now() };
        next = applyFilament(o, next, productsRef.current);
        if ('filamentPick' in patch && !patch.filamentPick) delete next.filamentPick;
        for (const k of ['amount', 'paidAt'] as const) {
          if (k in patch && patch[k] === undefined) delete next[k];
        }
        if ('paid' in patch && !patch.paid) {
          delete next.paid;
          delete next.paidAt;
        }
        // empty trackingNumber clears the field
        if ('trackingNumber' in patch) {
          const tn = patch.trackingNumber?.trim();
          if (tn) next.trackingNumber = tn;
          else delete next.trackingNumber;
        }
        return next;
      }),
    );
  }, []);

  const deleteOrder = useCallback((id: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const setStatus = useCallback(
    (id: string, status: OrderStatus) => {
      updateOrder(id, { status });
    },
    [updateOrder],
  );

  const importOrders = useCallback((partials: Partial<Order>[]) => {
    const now = Date.now();
    const created: Order[] = partials.map((p, i) => ({
      id: uid(),
      name: p.name || '이름없음',
      items: p.items || '',
      address: p.address || '',
      phone: p.phone || '',
      group: p.group,
      status: p.status || '대기',
      priority: p.priority ?? false,
      trackingNumber: p.trackingNumber,
      amount: p.amount,
      createdAt: now + i,
      updatedAt: now + i,
    }));
    setOrders((prev) => [...created, ...prev]);
    return created.length;
  }, []);

  return {
    orders,
    replaceOrders,
    addOrder,
    updateOrder,
    deleteOrder,
    setStatus,
    importOrders,
  };
}

export function useFilteredOrders(
  orders: Order[],
  statusFilter: StatusFilter,
  sourceFilter: SourceFilter,
  query: string,
  period: PeriodRange,
  products: Product[] = [],
) {
  return useMemo(() => {
    const q = normalizeSearch(query.trim());
    const bounds = resolvePeriodBounds(period);

    return orders
      .filter((o) => matchesStatus(o.status, statusFilter))
      .filter((o) => statusFilter !== '미입금' || isUnpaid(o, products))
      .filter((o) => {
        if (sourceFilter === '전체') return true;
        return (o.group || '').trim() === sourceFilter;
      })
      .filter((o) => {
        if (!bounds) return true;
        const ts = orderTimestamp(o.createdAt, o.updatedAt);
        return ts >= bounds[0] && ts <= bounds[1];
      })
      .filter((o) => {
        if (!q) return true;
        const hay = [
          o.name,
          o.phone,
          o.address,
          o.items,
          o.group || '',
          o.trackingNumber || '',
          o.paid ? '입금완료' : isUnpaid(o, products) ? '미입금' : '',
          o.amount !== undefined ? String(o.amount) : '',
        ]
          .map(normalizeSearch)
          .join(' ');
        return hay.includes(q);
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority ? -1 : 1;
        return (b.createdAt || b.updatedAt) - (a.createdAt || a.updatedAt);
      });
  }, [orders, statusFilter, sourceFilter, query, period, products]);
}
