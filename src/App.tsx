import { useCallback, useMemo, useState } from 'react';
import type { Order, StatusFilter } from './types';
import { useFilteredOrders, useOrders } from './hooks/useOrders';
import { OrderCard } from './components/OrderCard';
import { OrderForm, type OrderFormValues } from './components/OrderForm';
import { ImportModal } from './components/ImportModal';
import { StatusFilterBar } from './components/StatusFilter';
import { Toast } from './components/Toast';

type Sheet = 'none' | 'form' | 'import';

export default function App() {
  const { orders, addOrder, updateOrder, deleteOrder, setStatus, importOrders } =
    useOrders();
  const [filter, setFilter] = useState<StatusFilter>('전체');
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<Sheet>('none');
  const [editing, setEditing] = useState<Order | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useFilteredOrders(orders, filter, query);

  const counts = useMemo(() => {
    const c = { 전체: orders.length, 대기: 0, 제작중: 0, 완료: 0 } as Record<
      StatusFilter,
      number
    >;
    for (const o of orders) c[o.status] += 1;
    return c;
  }, [orders]);

  const showToast = useCallback((msg: string) => setToast(msg), []);

  const handleCopy = useCallback(
    async (order: Order) => {
      const text = `${order.address}\n${order.phone}`;
      try {
        await navigator.clipboard.writeText(text);
        showToast('복사됨');
      } catch {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          showToast('복사됨');
        } catch {
          showToast('복사 실패');
        }
        document.body.removeChild(ta);
      }
    },
    [showToast],
  );

  function openNew() {
    setEditing(null);
    setSheet('form');
  }

  function openEdit(order: Order) {
    setEditing(order);
    setSheet('form');
  }

  function handleFormSubmit(values: OrderFormValues) {
    if (editing) {
      updateOrder(editing.id, {
        name: values.name,
        items: values.items,
        address: values.address,
        phone: values.phone,
        group: values.group || undefined,
        status: values.status,
        priority: values.priority,
      });
      showToast('저장됨');
    } else {
      addOrder({
        name: values.name,
        items: values.items,
        address: values.address,
        phone: values.phone,
        group: values.group || undefined,
        status: values.status,
        priority: values.priority,
      });
      showToast('추가됨');
    }
    setSheet('none');
    setEditing(null);
  }

  function handleImport(partials: Partial<Order>[]): number {
    return importOrders(partials);
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Cybertruck · 3D Print</p>
          <h1>주문 관리</h1>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setSheet('import')}>
            가져오기
          </button>
          <button type="button" className="btn btn-primary" onClick={openNew}>
            + 새 주문
          </button>
        </div>
      </header>

      <div className="toolbar">
        <input
          className="search-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 · 연락처 검색"
          enterKeyHint="search"
        />
        <StatusFilterBar value={filter} counts={counts} onChange={setFilter} />
      </div>

      <main className="order-list">
        {filtered.length === 0 ? (
          <div className="empty">
            <p>주문이 없습니다.</p>
            <button type="button" className="btn btn-primary" onClick={openNew}>
              첫 주문 추가
            </button>
          </div>
        ) : (
          filtered.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onEdit={openEdit}
              onDelete={deleteOrder}
              onStatus={setStatus}
              onCopy={handleCopy}
              onTogglePriority={(id) => {
                const target = orders.find((x) => x.id === id);
                if (target) updateOrder(id, { priority: !target.priority });
              }}
            />
          ))
        )}
      </main>

      {sheet !== 'none' && (
        <div className="sheet-backdrop" onClick={() => setSheet('none')}>
          <div
            className="sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {sheet === 'form' && (
              <div className="sheet-body">
                <OrderForm
                  initial={editing}
                  onSubmit={handleFormSubmit}
                  onCancel={() => {
                    setSheet('none');
                    setEditing(null);
                  }}
                />
              </div>
            )}
            {sheet === 'import' && (
              <ImportModal onImport={handleImport} onClose={() => setSheet('none')} />
            )}
          </div>
        </div>
      )}

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
