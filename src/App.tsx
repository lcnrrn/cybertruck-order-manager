import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { Order, PeriodRange, StatusFilter } from './types';
import {
  FILTER_OPTIONS,
  PERIOD_FILTER_KEY,
  STATUS_FILTER_KEY,
} from './types';
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
import { PeriodFilterBar } from './components/PeriodFilter';
import { Toast } from './components/Toast';
import { GoogleSyncBar } from './components/GoogleSyncBar';
import { GoogleSettings } from './components/GoogleSettings';
import { SourceManager } from './components/SourceManager';
import { ProductManager } from './components/ProductManager';
import { SmsSettings } from './components/SmsSettings';
import { ProductionSummary } from './components/ProductionSummary';
import { isUnpaid, orderHasProduct } from './production';
import { SalesReport } from './components/SalesReport';
import { FilamentInventory } from './components/FilamentInventory';
import { loadFilament, saveFilament, type FilamentState } from './filament';
import { SETTINGS_APPLIED_EVENT } from './settingsMeta';
import { TrackingRegisterModal } from './components/TrackingRegisterModal';
import { hasGoogleConfig } from './google/config';
import { defaultPeriod } from './period';

type Sheet = 'none' | 'form' | 'import' | 'google' | 'sources' | 'products' | 'tracking' | 'sms' | 'sales' | 'filament';
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

function loadStatusFilter(): StatusFilter {
  try {
    const v = localStorage.getItem(STATUS_FILTER_KEY);
    if (v && (FILTER_OPTIONS as string[]).includes(v)) return v as StatusFilter;
  } catch {
    /* ignore */
  }
  return '작업중';
}

function loadPeriodFilter(): PeriodRange {
  try {
    const raw = localStorage.getItem(PERIOD_FILTER_KEY);
    if (!raw) return defaultPeriod();
    const parsed = JSON.parse(raw) as PeriodRange;
    if (
      parsed &&
      (parsed.preset === 'this_month' ||
        parsed.preset === 'last_month' ||
        parsed.preset === 'all' ||
        parsed.preset === 'custom')
    ) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return defaultPeriod();
}

function emptyMessage(
  filter: StatusFilter,
  query: string,
  hasOrders: boolean,
): { title: string; hint?: string } {
  if (!hasOrders) {
    return { title: '주문이 없습니다.', hint: '첫 주문을 추가해 보세요.' };
  }
  if (query.trim()) {
    return { title: '검색 결과가 없습니다.', hint: '검색어나 필터를 바꿔 보세요.' };
  }
  if (filter === '작업중') {
    return { title: '작업 중인 주문 없음', hint: '대기·제작중 주문이 모두 처리되었습니다.' };
  }
  if (filter === '대기') return { title: '대기 주문 없음' };
  if (filter === '제작중') return { title: '제작중 주문 없음' };
  if (filter === '완료') return { title: '완료된 주문 없음', hint: '완료 탭에서 아카이브를 확인할 수 있습니다.' };
  return { title: '표시할 주문이 없습니다.' };
}

export default function App() {
  const [products, setProductsState] = useState<Product[]>(() => getProducts());
  const {
    orders,
    replaceOrders,
    addOrder,
    updateOrder,
    deleteOrder,
    setStatus,
    importOrders,
  } = useOrders(products);
  const [filter, setFilter] = useState<StatusFilter>(loadStatusFilter);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('전체');
  const [period, setPeriod] = useState<PeriodRange>(loadPeriodFilter);
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<Sheet>('none');
  const [editing, setEditing] = useState<Order | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [listView, setListView] = useState<ListView>(loadView);

  const [sources, setSourcesState] = useState<string[]>(() => getSources());
  // 시트(모달)가 열려 있는 동안 배경 스크롤 위치를 고정하고, 닫으면 원래 위치로 복원
  useLayoutEffect(() => {
    if (sheet === 'none') return;
    const y = window.scrollY;
    const body = document.body;
    const prev = { position: body.style.position, top: body.style.top, width: body.style.width };
    body.style.position = 'fixed';
    body.style.top = `-${y}px`;
    body.style.width = '100%';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      window.scrollTo(0, y);
    };
  }, [sheet]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, listView);
    } catch {
      /* ignore */
    }
  }, [listView]);

  useEffect(() => {
    try {
      localStorage.setItem(STATUS_FILTER_KEY, filter);
    } catch {
      /* ignore */
    }
  }, [filter]);

  useEffect(() => {
    try {
      localStorage.setItem(PERIOD_FILTER_KEY, JSON.stringify(period));
    } catch {
      /* ignore */
    }
  }, [period]);

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

  const baseFiltered = useFilteredOrders(orders, filter, sourceFilter, query, period, products);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const filtered = useMemo(
    () => (productFilter ? baseFiltered.filter((o) => orderHasProduct(o, productFilter, products)) : baseFiltered),
    [baseFiltered, productFilter, products],
  );

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      작업중: 0,
      전체: orders.length,
      대기: 0,
      제작중: 0,
      완료: 0,
      미입금: 0,
    };
    for (const o of orders) {
      c[o.status] += 1;
      if (o.status === '대기' || o.status === '제작중') c.작업중 += 1;
      if (isUnpaid(o, products)) c.미입금 += 1;
    }
    return c;
  }, [orders, products]);

  const [filament, setFilamentState] = useState<FilamentState>(() => loadFilament());
  const updateFilament = useCallback((next: FilamentState) => {
    saveFilament(next);
    setFilamentState(next);
  }, []);

  // Settings pulled from Google Sheets (other device) → reload local state
  useEffect(() => {
    const onApplied = () => {
      setProductsState(getProducts());
      setSourcesState(getSources());
      setFilamentState(loadFilament());
    };
    window.addEventListener(SETTINGS_APPLIED_EVENT, onApplied);
    return () => window.removeEventListener(SETTINGS_APPLIED_EVENT, onApplied);
  }, []);

  const sourceOptions = useMemo(
    () => buildSourceFilterOptions(orders, sources),
    [orders, sources],
  );

  const empty = emptyMessage(filter, query, orders.length > 0);

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
        amount: values.amount,
        paid: values.paid || undefined,
        paidAt: values.paid ? values.paidAt : undefined,
        filamentPick: values.filamentPick,
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
        amount: values.amount,
        paid: values.paid || undefined,
        paidAt: values.paid ? values.paidAt : undefined,
        filamentPick: values.filamentPick,
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
    onTogglePaid: (id: string) => {
      const target = orders.find((x) => x.id === id);
      if (!target) return;
      if (target.paid) updateOrder(id, { paid: undefined, paidAt: undefined });
      else updateOrder(id, { paid: true, paidAt: Date.now() });
      showToast(target.paid ? '미입금으로 변경' : '입금완료 처리');
    },
    onTogglePriority: (id: string) => {
      const target = orders.find((x) => x.id === id);
      if (target) updateOrder(id, { priority: !target.priority });
    },
  };

  return (
    <div className={`app ${listView === 'table' ? 'view-table' : 'view-card'}`}>
      <div className="sticky-top">
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
          <button type="button" className="btn btn-ghost" onClick={() => setSheet('sales')}>
            매출 정리
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setSheet('filament')}>
            필라멘트
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
        needsLogin={google.needsLogin}
        email={google.email}
        status={google.status}
        onConnect={handleConnectClick}
        onSync={() => void google.syncNow()}
        onDisconnect={google.disconnect}
        onOpenSettings={() => setSheet('google')}
      />

      <div className="toolbar">
        <div className="toolbar-row">
          <div className="search-wrap">
            <input
              className="search-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 · 연락처 · 주소 · 송장 · 품목 · 경로"
              enterKeyHint="search"
              aria-label="주문 검색"
            />
            {query ? (
              <button
                type="button"
                className="search-clear"
                onClick={() => setQuery('')}
                aria-label="검색어 지우기"
              >
                ×
              </button>
            ) : null}
          </div>
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
        <PeriodFilterBar value={period} onChange={setPeriod} />
        <SourceFilterBar
          options={sourceOptions}
          value={sourceFilter}
          onChange={setSourceFilter}
        />
        <div className="result-meta" aria-live="polite">
          <span className="result-count">
            {filtered.length}건 표시
            {orders.length > 0 ? ` · 전체 ${orders.length}건` : ''}
          </span>
        </div>
      </div>

      </div>

      <ProductionSummary
        orders={orders}
        products={products}
        filament={filament}
        selected={productFilter}
        onSelect={setProductFilter}
      />

      <main className={listView === 'table' ? 'order-list-table' : 'order-list'}>
        {filtered.length === 0 ? (
          <div className="empty">
            <p className="empty-title">{empty.title}</p>
            {empty.hint ? <p className="empty-hint">{empty.hint}</p> : null}
            {orders.length === 0 ? (
              <button type="button" className="btn btn-primary" onClick={openNew}>
                첫 주문 추가
              </button>
            ) : filter === '작업중' ? (
              <button type="button" className="btn btn-secondary" onClick={() => setFilter('완료')}>
                완료 목록 보기
              </button>
            ) : query ? (
              <button type="button" className="btn btn-secondary" onClick={() => setQuery('')}>
                검색 초기화
              </button>
            ) : null}
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
                  filament={filament}
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
                filament={filament}
                onOpenFilament={() => setSheet('filament')}
                onChange={handleProductsChange}
                onClose={() => setSheet('none')}
              />
            )}
            {sheet === 'sales' && (
              <SalesReport
                orders={orders}
                products={products}
                period={period}
                onPeriod={setPeriod}
                onTogglePaid={sharedCardProps.onTogglePaid}
                onMarkPaid={(ids) => {
                  const now = Date.now();
                  for (const id of ids) updateOrder(id, { paid: true, paidAt: now });
                  showToast(`${ids.length}건 입금완료 처리`);
                }}
                onEdit={(o) => openEdit(o)}
                onClose={() => setSheet('none')}
              />
            )}
            {sheet === 'filament' && (
              <FilamentInventory
                orders={orders}
                products={products}
                state={filament}
                onChange={updateFilament}
                onOpenProducts={() => setSheet('products')}
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
                orders={orders.filter((o) => o.status !== '완료')}
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
