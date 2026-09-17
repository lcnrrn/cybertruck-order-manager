import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Order, OrderStatus, StatusFilter } from '../types';
import { loadOrders, saveOrders } from '../storage';

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
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
      prev.map((o) =>
        o.id === id ? { ...o, ...patch, id: o.id, updatedAt: Date.now() } : o,
      ),
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
  query: string,
) {
  return useMemo(() => {
    const q = query.trim().toLowerCase().replace(/[-\s]/g, '');
    return orders
      .filter((o) => (statusFilter === '전체' ? true : o.status === statusFilter))
      .filter((o) => {
        if (!q) return true;
        const name = o.name.toLowerCase();
        const phone = o.phone.replace(/[-\s]/g, '').toLowerCase();
        return name.includes(q) || phone.includes(q);
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
  }, [orders, statusFilter, query]);
}
