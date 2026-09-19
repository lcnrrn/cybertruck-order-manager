import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Order, OrderStatus, PeriodRange, StatusFilter } from '../types';
import type { SourceFilter } from '../sources';
import { loadOrders, saveOrders } from '../storage';
import { orderTimestamp, resolvePeriodBounds } from '../period';

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function matchesStatus(status: OrderStatus, filter: StatusFilter): boolean {
  if (filter === '전체') return true;
  if (filter === '작업중') return status === '대기' || status === '제작중';
  return status === filter;
}

function normalizeSearch(s: string): string {
  return s.toLowerCase().replace(/[-\s]/g, '');
}

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>(() => loadOrders());

  useEffect(() => {
    saveOrders(orders);
  }, [orders]);

  const replaceOrders = useCallback((next: Order[]) => {
    setOrders(next);
  }, []);

  const addOrder = useCallback((data: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = Date.now();
    const order: Order = {
      ...data,
      id: uid(),
      createdAt: now,
      updatedAt: now,
    };
    setOrders((prev) => [order, ...prev]);
    return order;
  }, []);

  const updateOrder = useCallback((id: string, patch: Partial<Order>) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const next: Order = { ...o, ...patch, id: o.id, updatedAt: Date.now() };
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
) {
  return useMemo(() => {
    const q = normalizeSearch(query.trim());
    const bounds = resolvePeriodBounds(period);

    return orders
      .filter((o) => matchesStatus(o.status, statusFilter))
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
        ]
          .map(normalizeSearch)
          .join(' ');
        return hay.includes(q);
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
  }, [orders, statusFilter, sourceFilter, query, period]);
}
