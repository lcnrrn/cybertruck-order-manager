import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Order, StatusFilter } from './types';
import type { SourceFilter } from './sources';
import { buildSourceFilterOptions, getSources, setSources } from './sources';
import { getProducts, setProducts, type Product } from './products';
import { useFilteredOrders, useOrders } from './hooks/useOrders';
import { useGoogleSync } from './hooks/useGoogleSync';
import { OrderCard } from './components/OrderCard';
import { OrderTable } from './components/OrderTable';
import { OrderForm, type OrderFormValues } from './components/OrderForm';
import { ImportModal } from './components/ImportModal';
import { StatusFilterBar } from './components/StatusFilter';
import { SourceFilterBar } from './components/SourceFilter';
import { Toast } from './components/Toast';
import { GoogleSyncBar } from './components/GoogleSyncBar';
import { GoogleSettings } from './components/GoogleSettings';
import { SourceManager } from './components/SourceManager';
import { ProductManager } from './components/ProductManager';
import { SmsSettings } from './components/SmsSettings';
import { TrackingRegisterModal } from './components/TrackingRegisterModal';
import { hasGoogleConfig } from './google/config';

type Sheet = 'none' | 'form' | 'import' | 'google' | 'sources' | 'products' | 'tracking' | 'sms';
type ListView = 'table' | 'card';

const VIEW_STORAGE_KEY = 'cybertruck-list-view';

function loadView(): ListView {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    if (v === 'card' || v === 'table') return v;
  } catch {
    /* ignore */
  }
  return 'table';
}

export default function App() {
  const {
    orders,
    replaceOrders,
    addOrder,
    updateOrder,
    deleteOrder,
    setStatus,
    importOrders,
  } = useOrders();
  const [filter, setFilter] = useState<StatusFilter>('전체');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('전체');
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<Sheet>('none');
  const [editing, setEditing] = useState<Order | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [listView, setListView] = useState<ListView>(loadView);

  const [sources, setSourcesState] = useState<string[]>(() => getSources());
  const [products, setProductsState] = useState<Product[]>(() => getProducts());

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, listView);
    } catch {
      /* ignore */
    }
  }, [listView]);

  const showToast = useCallback((msg: string) => setToast(msg), []);

  const handleSourcesChange = useCallback((next: string[]) => {
    setSources(next);
    setSourcesState(next);
  }, []);

  const handleProductsChange = useCallback((next: Product[]) => {
    setProducts(next);
    setProductsState(next);
  }, []);

  const google = useGoogleSync({
    orders,
    replaceOrders,
    onToast: showToast,
  });

  const filtered = useFilteredOrders(orders, filter, sourceFilter, query);

  const counts = useMemo(() => {
    const c = { 전체: orders.length, 대기: 0, 제작중: 0, 완료: 0 } as Record<
      StatusFilter,
      number
    >;
    for (const o of orders) c[o.status] += 1;
    return c;
  }, [orders]);

  const sourceOptions = useMemo(
    () => buildSourceFilterOptions(orders, sources),
    [orders, sources],
  );

  const copyText = useCallback(
    async (text: string, okMessage: string) => {
      if (!text.trim()) {
        showToast('내용 없음');
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        showToast(okMessage);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          showToast(okMessage);
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
        trackingNumber: values.trackingNumber || undefined,
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
        trackingNumber: values.trackingNumber || undefined,
      });
      showToast('추가됨');
    }
    setSheet('none');
    setEditing(null);
  }

  function handleImport(partials: Partial<Order>[]): number {
    return importOrders(partials);
  }

  function handleConnectClick() {
    if (!hasGoogleConfig()) {
      setSheet('google');
      showToast('먼저 Client ID와 Sheet ID를 입력해 주세요.');
      return;
    }
    void google.connect();
  }

  const sharedCardProps = {
    onEdit: openEdit,
    onDelete: deleteOrder,
    onStatus: setStatus,
    copyText,
    onTogglePriority: (id: string) => {
      const target = orders.find((x) => x.id === id);
      if (target) updateOrder(id, { priority: !target.priority });
    },
  };

  return (
    <div className={`app ${listView === 'table' ? 'view-table' : 'view-card'}`}>
      <header className="app-header">
        <div>
          <p className="eyebrow">Cybertruck · 3D Print</p>
          <h1>주문 관리</h1>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setSheet('sources')}>
            경로 관리
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setSheet('products')}>
            제품 관리
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setSheet('sms')}>
            문자 템플릿
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setSheet('import')}>
            가져오기
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setSheet('tracking')}>
            송장 등록
          </button>
          <button type="button" className="btn btn-primary" onClick={openNew}>
            + 새 주문
          </button>
        </div>
      </header>

      <GoogleSyncBar
        connected={google.connected}
        email={google.email}
        status={google.status}
        onConnect={handleConnectClick}
        onSync={() => void google.syncNow()}
        onDisconnect={google.disconnect}
        onOpenSettings={() => setSheet('google')}
      />

      <div className="toolbar">
        <div className="toolbar-row">
          <input
            className="search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 · 연락처 · 주문 경로 검색"
            enterKeyHint="search"
          />
          <div className="view-toggle" role="group" aria-label="보기 전환">
            <button
              type="button"
              className={`view-toggle-btn ${listView === 'table' ? 'active' : ''}`}
              onClick={() => setListView('table')}
              aria-pressed={listView === 'table'}
            >
              표
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${listView === 'card' ? 'active' : ''}`}
              onClick={() => setListView('card')}
              aria-pressed={listView === 'card'}
            >
              카드
            </button>
          </div>
        </div>
        <StatusFilterBar value={filter} counts={counts} onChange={setFilter} />
        <SourceFilterBar
          options={sourceOptions}
          value={sourceFilter}
          onChange={setSourceFilter}
        />
      </div>

      <main className={listView === 'table' ? 'order-list-table' : 'order-list'}>
        {filtered.length === 0 ? (
          <div className="empty">
            <p>주문이 없습니다.</p>
            <button type="button" className="btn btn-primary" onClick={openNew}>
              첫 주문 추가
            </button>
          </div>
        ) : listView === 'table' ? (
          <OrderTable orders={filtered} products={products} {...sharedCardProps} />
        ) : (
          filtered.map((o) => <OrderCard key={o.id} order={o} products={products} {...sharedCardProps} />)
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
                  sources={sources}
                  products={products}
                  onSubmit={handleFormSubmit}
                  onCancel={() => {
                    setSheet('none');
                    setEditing(null);
                  }}
                />
              </div>
            )}
            {sheet === 'import' && (
              <ImportModal onImport={handleImport} onClose={() => setSheet('none')} sources={sources} />
            )}
            {sheet === 'google' && (
              <div className="sheet-body">
                <GoogleSettings
                  onClose={() => setSheet('none')}
                  onSaved={() => {
                    google.refreshConfigured();
                    showToast('설정 저장됨');
                    setSheet('none');
                  }}
                  onConnect={() => {
                    google.refreshConfigured();
                    setSheet('none');
                    void google.connect();
                  }}
                />
              </div>
            )}
            {sheet === 'sources' && (
              <SourceManager
                sources={sources}
                onChange={handleSourcesChange}
                onClose={() => setSheet('none')}
              />
            )}
            {sheet === 'products' && (
              <ProductManager
                products={products}
                onChange={handleProductsChange}
                onClose={() => setSheet('none')}
              />
            )}
            {sheet === 'sms' && (
              <div className="sheet-body">
                <SmsSettings
                  onClose={() => setSheet('none')}
                  onSaved={() => showToast('문자 템플릿 저장됨')}
                />
              </div>
            )}
            {sheet === 'tracking' && (
              <TrackingRegisterModal
                orders={orders}
                onApply={(updates) => {
                  for (const u of updates) {
                    updateOrder(u.orderId, { trackingNumber: u.trackingNumber });
                  }
                  showToast(`송장 ${updates.length}건 등록됨`);
                  setSheet('none');
                }}
                onClose={() => setSheet('none')}
              />
            )}
          </div>
        </div>
      )}

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
