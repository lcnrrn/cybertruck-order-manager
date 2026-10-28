import { toYmd, withYmd } from './dates';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Order, PeriodRange, StatusFilter } from './types';
import {
  FILTER_OPTIONS,
  PERIOD_FILTER_KEY,
  STATUS_FILTER_KEY,
} from './types';
import { getProducts, setProducts, type Product } from './products';
import { useFilteredOrders, useOrders } from './hooks/useOrders';
import { useGoogleSync } from './hooks/useGoogleSync';
import { OrderCard } from './components/OrderCard';
import { addShipment, attachTracking, cancelShipment, isFullyDelivered, isFullyShipped, pendingShipmentCount, setShipmentSms, shippedQty, smsPendingShipments } from './shipments';
import { ShipSmsPanel } from './components/ShipSmsPanel';
import { OrderForm, type OrderFormValues } from './components/OrderForm';
import { ImportModal } from './components/ImportModal';
import { StatusFilterBar } from './components/StatusFilter';
import { PeriodFilterBar } from './components/PeriodFilter';
import { Toast } from './components/Toast';
import { GoogleSyncBar } from './components/GoogleSyncBar';
import { GoogleSettings } from './components/GoogleSettings';
import { ProductManager } from './components/ProductManager';
import { SmsSettings } from './components/SmsSettings';
import { ProductionSummary } from './components/ProductionSummary';
import { applyPartCount, orderItemProgress, parseOrderProducts, PART_SEP, productComponents } from './production';
import { buildProductionSummary, formatDuration, isUnpaid, orderHasProduct, orderAmount, pendingMinutes, formatWon } from './production';
import { SalesReport } from './components/SalesReport';
import { FilamentInventory } from './components/FilamentInventory';
import { loadFilament, saveFilament, type FilamentState } from './filament';
import { SETTINGS_APPLIED_EVENT } from './settingsMeta';
import { TrackingRegisterModal } from './components/TrackingRegisterModal';
import { hasGoogleConfig } from './google/config';
import { defaultPeriod } from './period';
import { EpostPanel } from './components/EpostPanel';
import { loadEpostRequest, type EpostRequest } from './epost';
import { BackupPanel } from './components/BackupPanel';
import { LockedBanner, SyncGate } from './components/SyncGate';
import { PullToRefresh } from './components/PullToRefresh';
import { useAppUpdate } from './hooks/useAppUpdate';
import { Dashboard } from './components/Dashboard';
import { DepositMatch } from './components/DepositMatch';
import { PrintQueue } from './components/PrintQueue';
import { Customers } from './components/Customers';
import { ProfitPanel } from './components/ProfitPanel';
import { ShopSettingsPanel } from './components/ShopSettingsPanel';
import { maybeDailySnapshot } from './snapshots';
import { CommandBar, type QuickAction } from './components/CommandBar';
import { EmptyArt, BrandLogo } from './ui/Art';
import {
  ChartColumn,
  ChevronRight,
  ClipboardList,
  Database,
  Download,
  Hammer,
  House,
  Landmark,
  Link,
  Mailbox,
  MessageSquare,
  MessageSquareText,
  Package,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Settings,
  Spool,
  Store,
  Users,
  type LucideIcon,
} from 'lucide-react';

type Sheet = 'none' | 'deposit' | 'shop' | 'form' | 'import' | 'google' | 'products' | 'tracking' | 'sms' | 'filament' | 'backup' | 'epost' | 'shipsms';

type Tab = 'home' | 'orders' | 'make' | 'sales' | 'customers' | 'more';
const TAB_KEY = 'cybertruck-last-tab-v2';
const TABS: { id: Tab; icon: LucideIcon; label: string; title: string }[] = [
  { id: 'home', icon: House, label: '홈', title: '대시보드' },
  { id: 'orders', icon: ClipboardList, label: '주문', title: '주문' },
  { id: 'make', icon: Hammer, label: '제작', title: '제작' },
  { id: 'sales', icon: ChartColumn, label: '매출', title: '매출' },
  { id: 'customers', icon: Users, label: '고객', title: '고객' },
  { id: 'more', icon: Settings, label: '더보기', title: '더보기 · 설정' },
];
const MORE_ITEMS: { id: Sheet; icon: LucideIcon; color: string; label: string; desc: string }[] = [
  { id: 'epost', icon: Mailbox, color: 'linear-gradient(135deg,#f472b6,#be185d)', label: '우체국 접수', desc: '전송 대기 확인 · 접수 요청 · 접수 내역' },
  { id: 'shipsms', icon: MessageSquare, color: 'linear-gradient(135deg,#a78bfa,#6d28d9)', label: '발송 문자 보내기', desc: '송장 나온 건 발송안내 문자 모아보기 · 보냄 체크' },
  { id: 'deposit', icon: Landmark, color: 'linear-gradient(135deg,#4ade80,#15803d)', label: '입금 확인', desc: '은행 거래내역 붙여넣기 → 미입금 주문 자동 짝찾기' },
  { id: 'shop', icon: Store, color: 'linear-gradient(135deg,#f9a8d4,#7c3aed)', label: '가게 · 구매자 안내', desc: '입금 계좌 · 주문/조회 링크 · 원가 기준' },
  { id: 'products', icon: Package, color: 'linear-gradient(135deg,#5ee1ff,#2563eb)', label: '제품 관리', desc: '사진 · 판매가 · 필라멘트 g · 출력 시간' },
  { id: 'filament', icon: Spool, color: 'linear-gradient(135deg,#34d399,#047857)', label: '필라멘트 재고', desc: '구매 기록 · 재고 · 종류별 사용량' },
  { id: 'sms', icon: MessageSquareText, color: 'linear-gradient(135deg,#fbbf24,#d97706)', label: '문자 템플릿', desc: '접수 · 완료 · 발송 안내' },
  { id: 'tracking', icon: ReceiptText, color: 'linear-gradient(135deg,#fb923c,#c2410c)', label: '송장 등록', desc: '우체국 접수증 붙여넣기' },
  { id: 'import', icon: Download, color: 'linear-gradient(135deg,#60a5fa,#1d4ed8)', label: '주문 가져오기', desc: '네이버 폼 · 미리 알림' },
  { id: 'google', icon: Link, color: 'linear-gradient(135deg,#94a3b8,#475569)', label: '구글 시트 동기화', desc: '연결 · Client ID · Sheet ID' },
  { id: 'backup', icon: Database, color: 'linear-gradient(135deg,#64748b,#334155)', label: '데이터 백업', desc: '내보내기 · 복원' },
];

function loadTab(): Tab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v && TABS.some((t) => t.id === v)) return v as Tab;
  } catch {
    /* ignore */
  }
  return 'home';
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
    addOrder: rawAddOrder,
    updateOrder: rawUpdateOrder,
    deleteOrder: rawDeleteOrder,
    setStatus: rawSetStatus,
    importOrders: rawImportOrders,
    setItemDone: rawSetItemDone,
    transformOrder: rawTransformOrder,
  } = useOrders(products);
  // 최신 내용을 받기 전(잠금)에는 모든 수정 차단
  const lockedRef = useRef(false);
  const lockToastRef = useRef<(m: string) => void>(() => undefined);
  const blocked = () => {
    if (!lockedRef.current) return false;
    lockToastRef.current('🔒 최신 내용을 받은 뒤에 수정할 수 있어요');
    return true;
  };
  const addOrder: typeof rawAddOrder = (d) => (blocked() ? (undefined as unknown as ReturnType<typeof rawAddOrder>) : rawAddOrder(d));
  const updateOrder: typeof rawUpdateOrder = (id, patch) => {
    if (!blocked()) rawUpdateOrder(id, patch);
  };
  const deleteOrder: typeof rawDeleteOrder = (id) => {
    if (!blocked()) rawDeleteOrder(id);
  };
  const setStatus: typeof rawSetStatus = (id, st) => {
    if (!blocked()) rawSetStatus(id, st);
  };
  const importOrders: typeof rawImportOrders = (list) => (blocked() ? 0 : rawImportOrders(list));
  /** 세트 제품 구성품 개수 (part=null 이면 세트 수로 전체 맞춤) — R 열 d 에 「제품::구성품」 키로 저장 */
  const setPartDone = (id: string, product: string, part: string | null, count: number) => {
    if (blocked()) return;
    const prod = products.find((p) => p.name === product);
    if (!prod) return;
    rawTransformOrder(id, (o) => {
      const it = parseOrderProducts(o.items, products.map((p) => p.name)).products.find((x) => x.name === product);
      if (!it) return null;
      const doneMap = applyPartCount(o.doneMap, prod, it.qty, part, count, shippedQty(o)[product] || 0);
      const next: Order = { ...o, doneMap, updatedAt: Date.now() };
      if (!Object.keys(doneMap).length) delete next.doneMap;
      if (Object.keys(doneMap).some((k) => k === product || k.startsWith(product + PART_SEP)) && o.status === '대기') next.status = '제작중';
      return next;
    });
  };
  const setItemDone: typeof rawSetItemDone = (id, k, c) => {
    if (blocked()) return;
    if (productComponents(products.find((p) => p.name === k)).length) setPartDone(id, k, null, c);
    else rawSetItemDone(id, k, c);
  };
  const transformOrder: typeof rawTransformOrder = (id, fn) => {
    if (!blocked()) rawTransformOrder(id, fn);
  };
  const [postOnly, setPostOnly] = useState(false);
  const [salesView, setSalesView] = useState<'report' | 'profit'>('report');
  const [filter, setFilter] = useState<StatusFilter>(loadStatusFilter);
  const [period, setPeriod] = useState<PeriodRange>(loadPeriodFilter);
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<Sheet>('none');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTabState] = useState<Tab>(loadTab);
  const scrollByTab = useRef<Partial<Record<Tab, number>>>({});
  const switchTab = useCallback((next: Tab) => {
    setTabState((cur) => {
      if (cur === next) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return cur;
      }
      scrollByTab.current[cur] = window.scrollY;
      return next;
    });
  }, []);
  useLayoutEffect(() => {
    window.scrollTo(0, scrollByTab.current[tab] || 0);
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      /* ignore */
    }
  }, [tab]);
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

  // 예전 표/카드 토글 저장값 정리 (카드 전용으로 고정)
  useEffect(() => {
    try {
      localStorage.removeItem('cybertruck-list-view');
    } catch {
      /* ignore */
    }
  }, []);

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
  const handleProductsChange = useCallback((next: Product[]) => {
    if (blocked()) return;
    setProducts(next);
    // 구성품 합계(g·분)가 반영된 저장본으로
    setProductsState(getProducts());
  }, []);

  const google = useGoogleSync({
    orders,
    replaceOrders,
    onToast: showToast,
  });
  const appUpdate = useAppUpdate({ dirty: google.dirty, busy: google.status === 'syncing' || sheet !== 'none' });
  const refreshAll = useCallback(async () => {
    if (await appUpdate.check()) {
      if (!google.dirty) return void appUpdate.apply();
      showToast('새 버전이 있어요 — 위의 「업데이트」를 눌러 주세요');
      return;
    }
    await google.syncNow();
  }, [appUpdate, google, showToast]);


  lockedRef.current = google.locked;
  lockToastRef.current = showToast;
  // 잠금 중엔 수정용 시트(폼·제품 관리 등)를 열지 않음
  useEffect(() => {
    if (google.locked && !['none', 'google', 'backup'].includes(sheet)) {
      setSheet('none');
      showToast('🔒 최신 내용을 받은 뒤에 수정할 수 있어요');
    }
  }, [google.locked, sheet, showToast]);
  const onLockCapture = (e: React.SyntheticEvent) => {
    if (!google.locked) return;
    const t = e.target as HTMLElement;
    if (!t.closest('[data-lock-zone]')) return;
    if (t.closest('[data-allow-locked], .prod-chip, summary, .period-filter, .prod-summary-filter')) return;
    if (!t.closest('button, input, select, textarea, label, a, [role="button"], [role="checkbox"]')) return;
    e.preventDefault();
    e.stopPropagation();
    showToast('🔒 최신 내용을 받은 뒤에 수정할 수 있어요');
  };

  // 하루 한 번 이 기기에 자동 백업 (최신 내용을 받은 뒤에만)
  useEffect(() => {
    if (google.locked || google.status === 'syncing' || !orders.length) return;
    const t = window.setTimeout(() => void maybeDailySnapshot(orders), 4000);
    return () => window.clearTimeout(t);
  }, [orders, google.locked, google.status]);

  const baseFiltered = useFilteredOrders(orders, filter, query, period, products);
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

  const [epostReq, setEpostReq] = useState<EpostRequest | null>(() => loadEpostRequest());
  const [filament, setFilamentState] = useState<FilamentState>(() => loadFilament());
  const updateFilament = useCallback((next: FilamentState) => {
    if (blocked()) return;
    saveFilament(next);
    setFilamentState(next);
  }, []);

  // Settings pulled from Google Sheets (other device) → reload local state
  useEffect(() => {
    const onApplied = () => {
      setProductsState(getProducts());
      setFilamentState(loadFilament());
      setEpostReq(loadEpostRequest());
    };
    window.addEventListener(SETTINGS_APPLIED_EVENT, onApplied);
    return () => window.removeEventListener(SETTINGS_APPLIED_EVENT, onApplied);
  }, []);


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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function pickFromCommand(o: Order) {
    setCmdOpen(false);
    setSheet('none');
    setQuery(o.name);
    setFilter('전체');
    setPeriod({ preset: 'all' });
    setProductFilter(null);
    switchTab('orders');
  }

  const quickActions: QuickAction[] = [
    ...TABS.map((t) => ({ id: `tab-${t.id}`, label: `${t.title} 화면`, run: () => { setCmdOpen(false); setSheet('none'); switchTab(t.id); } })),
    { id: 'new', label: '새 주문 입력', run: () => { setCmdOpen(false); openNew(); } },
    ...MORE_ITEMS.map((m) => ({ id: `sheet-${m.id}`, label: m.label, hint: m.desc, run: () => { setCmdOpen(false); setSheet(m.id); } })),
    { id: 'tracking', label: '송장 등록', run: () => { setCmdOpen(false); setSheet('tracking'); } },
  ];

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
        prices: values.prices,
        filamentGrams: values.filamentGrams,
        // 접수일을 바꾼 경우에만 createdAt 변경 (시각은 유지)
        ...(values.createdDate && values.createdDate !== toYmd(editing.createdAt || editing.updatedAt)
          ? { createdAt: withYmd(editing.createdAt || editing.updatedAt, values.createdDate) }
          : {}),
      });
      showToast('저장됨');
    } else {
      addOrder({
        ...(values.createdDate && values.createdDate !== toYmd(Date.now()) ? { createdAt: withYmd(Date.now(), values.createdDate) } : {}),
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
        prices: values.prices,
        filamentGrams: values.filamentGrams,
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
    onItemDone: (id: string, key: string, count: number) => setItemDone(id, key, count),
    onPartDone: (id: string, product: string, part: string, count: number) => setPartDone(id, product, part, count),
    onMakeAll: (id: string) => {
      const o = orders.find((x) => x.id === id);
      if (!o) return;
      for (const it of orderItemProgress(o, products.map((p) => p.name))) if (it.done < it.qty) setItemDone(id, it.key, it.qty);
      showToast('전부 제작 완료로 체크했어요 · 이제 접수할 수 있어요');
    },
    onShip: (id: string, items: Record<string, number>, mode: 'counter' | 'visit' = 'counter') => {
      const names = products.map((p) => p.name);
      transformOrder(id, (o) => addShipment(o, items, orderItemProgress(o, names), Date.now(), mode));
      showToast(mode === 'visit' ? '🚚 방문 접수 대기에 올렸어요' : '🏤 창구 접수 대기에 올렸어요');
    },
    onCancelShip: (id: string, shipId: string) => {
      transformOrder(id, (o) => cancelShipment(o, shipId));
      showToast('전송 요청을 취소했어요');
    },
  };
  const postPending = useMemo(() => pendingShipmentCount(orders), [orders]);
  const smsPending = useMemo(() => orders.reduce((n, o) => n + smsPendingShipments(o).length, 0), [orders]);

  // 봇이 시트에 송장·배달완료를 쓰면: 모든 품목 발송(송장) 또는 전부 배달완료 → 자동 완료 (주문마다 한 번만)
  useEffect(() => {
    if (google.locked || google.status === 'syncing') return;
    const KEY = 'cybertruck-auto-done-v1';
    let doneIds: string[] = [];
    try { doneIds = JSON.parse(localStorage.getItem(KEY) || '[]') as string[]; } catch { doneIds = []; }
    const names = products.map((p) => p.name);
    const add: string[] = [];
    for (const o of orders) {
      if (o.status === '완료' || doneIds.includes(o.id) || !o.shipments?.length) continue;
      const prog = orderItemProgress(o, names);
      if (isFullyShipped(o, prog) || isFullyDelivered(o, prog)) add.push(o.id);
    }
    if (!add.length) return;
    try { localStorage.setItem(KEY, JSON.stringify([...doneIds, ...add].slice(-500))); } catch { /* ignore */ }
    for (const id of add) setStatus(id, '완료');
    showToast(`📦 발송 끝난 주문 ${add.length}건 자동 완료`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, products, google.locked, google.status]);

  const makeSummary = useMemo(() => buildProductionSummary(orders, products), [orders, products]);
  const makeMin = useMemo(() => pendingMinutes(orders, products), [orders, products]);
  const unpaidSum = useMemo(
    () => orders.filter((o) => isUnpaid(o, products)).reduce((s, o) => s + orderAmount(o, products), 0),
    [orders, products],
  );
  const workOrders = useMemo(
    () =>
      orders
        .filter((o) => o.status === '대기' || o.status === '제작중')
        .filter((o) => !productFilter || orderHasProduct(o, productFilter, products))
        .filter((o) => !postOnly || (o.shipments || []).some((x) => x.postStatus === 'requested'))
        .sort((a, b) => Number(!!b.priority) - Number(!!a.priority) || (a.createdAt || a.updatedAt) - (b.createdAt || b.updatedAt)),
    [orders, productFilter, products, postOnly],
  );
  const tabInfo = TABS.find((t) => t.id === tab) ?? TABS[0];
  const stats: { label: string; value: string; tone?: string }[] =
    tab === 'orders'
      ? [
          { label: '작업중', value: `${counts.작업중}건` },
          { label: '미입금', value: `${counts.미입금}건`, tone: counts.미입금 ? 'warn' : undefined },
          { label: '전체', value: `${counts.전체}건` },
        ]
      : tab === 'make'
        ? [
            { label: '만들 제품', value: `${makeSummary.total}개` },
            { label: '주문', value: `${makeSummary.orderCount}건` },
            { label: '출력 시간', value: makeMin > 0 ? formatDuration(makeMin) : '—' },
          ]
        : tab === 'sales'
          ? [
              { label: '미입금', value: `${counts.미입금}건`, tone: counts.미입금 ? 'warn' : undefined },
              { label: '미입금 금액', value: formatWon(unpaidSum), tone: unpaidSum ? 'warn' : undefined },
            ]
          : [];

  const renderCards = (list: Order[]) =>
    list.map((o) => <OrderCard key={o.id} order={o} products={products} {...sharedCardProps} />);

  return (
    <div className={`app view-card tabbed tab-${tab}${google.locked ? ' is-locked' : ''}`} onClickCapture={onLockCapture} onChangeCapture={onLockCapture}>
      <PullToRefresh onRefresh={() => void refreshAll()} disabled={sheet !== 'none'} />
      {appUpdate.available ? (
        <button type="button" className="update-banner" onClick={() => void appUpdate.apply()}>
          {appUpdate.stuck ? '새 버전을 못 불러왔어요 · 앱을 완전히 닫았다 다시 열어 주세요' : `새 버전이 있어요 · 업데이트${google.dirty ? ' (고친 내용은 새 버전에서 저장돼요)' : ''}`}
        </button>
      ) : null}
      <SyncGate gate={google.gate} error={google.lastError} onRetry={google.retryGate} onReadOnly={google.viewReadOnly} />
      <nav className="tabbar" aria-label="화면 전환">
        <div className="tabbar-brand">
          <span className="brand-mark"><BrandLogo /><span className="eyebrow">Cybertruck · 3D Print</span></span>
          <b>주문 관리</b>
        </div>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tabbar-item${tab === t.id ? ' is-active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => switchTab(t.id)}
          >
            <span className="tabbar-ico" aria-hidden><t.icon size={20} strokeWidth={tab === t.id ? 2.4 : 1.9} /></span>
            <span className="tabbar-label">{t.label}</span>
            {t.id === 'orders' && counts.작업중 > 0 ? <span className="tabbar-badge">{counts.작업중}</span> : null}
            {t.id === 'more' && postPending + smsPending > 0 ? <span className="tabbar-badge">{postPending + smsPending}</span> : null}
          </button>
        ))}
      </nav>

      <div className="sticky-top">
        <header className="app-header screen-header">
          <div className="screen-title">
            <p className="eyebrow brand-mark"><BrandLogo />Cybertruck · 3D Print</p>
            <h1>{tabInfo.title}</h1>
          </div>
          <button type="button" className={`btn btn-ghost btn-compact refresh-btn${google.status === 'syncing' ? ' spin' : ''}`} onClick={() => void refreshAll()} disabled={google.status === 'syncing'} aria-label="새로고침">
            <RefreshCw size={15} />{google.status === 'syncing' ? '받는 중…' : '새로고침'}
          </button>
          <button type="button" className="btn btn-ghost btn-compact cmd-trigger" onClick={() => setCmdOpen(true)} aria-label="빠른 검색">
            <Search size={15} /><span className="cmd-trigger-label">검색</span>
          </button>
          {tab === 'orders' ? (
            <div className="header-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setSheet('tracking')}><ReceiptText size={15} />송장 등록</button>
              <button type="button" className="btn btn-primary desktop-only" onClick={openNew}><Plus size={16} />새 주문</button>
            </div>
          ) : null}
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
          dirty={google.dirty}
          dirtySince={google.dirtySince}
          lastSyncAt={google.lastSyncAt}
          lastError={google.lastError}
          outdated={google.outdated}
        />
        {tab === 'orders' ? (
          <div className="toolbar">
            <div className="toolbar-row">
              <div className="search-wrap">
                <input
                  className="search-input"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="이름 · 연락처 · 주소 · 송장 · 품목"
                  enterKeyHint="search"
                  aria-label="주문 검색"
                />
                {query ? (
                  <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="검색어 지우기">×</button>
                ) : null}
              </div>
            </div>
            <StatusFilterBar value={filter} counts={counts} onChange={setFilter} />
            <PeriodFilterBar value={period} onChange={setPeriod} />
            <div className="result-meta" aria-live="polite">
              <span className="result-count">
                {filtered.length}건 표시
                {orders.length > 0 ? ` · 전체 ${orders.length}건` : ''}
              </span>
              {productFilter ? (
                <button type="button" className="chip-clear" onClick={() => setProductFilter(null)}>‘{productFilter}’ 필터 해제 ✕</button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {google.locked && google.gate === 'none' ? <LockedBanner onSync={google.retryGate} /> : null}

      {stats.length > 0 ? (
        <div className="stat-cards">
          {stats.map((x) => (
            <div key={x.label} className={`stat-card${x.tone ? ` ${x.tone}` : ''}`}>
              <span className="stat-label">{x.label}</span>
              <b className="stat-value">{x.value}</b>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'home' && (
        <main className="tab-page" data-lock-zone>
          <Dashboard
            orders={orders}
            products={products}
            filament={filament}
            postPending={postPending}
            smsPending={smsPending}
            onGo={(t) => switchTab(t)}
            onOpen={(s) => {
              setSheet(s);
            }}
            onNew={openNew}
            onEdit={openEdit}
            onFilter={(f) => {
              setFilter(f);
              switchTab('orders');
            }}
          />
        </main>
      )}

      {tab === 'orders' && (
        <main className="order-list" data-lock-zone>
          {smsPending > 0 ? (
            <button type="button" className="btn btn-secondary btn-wide" onClick={() => setSheet('shipsms')}><MessageSquare size={16} />송장 나온 {smsPending}건 · 발송 문자 보내기</button>
          ) : null}
          {filtered.length === 0 ? (
            <div className="empty">
              <EmptyArt kind={query ? 'search' : orders.length === 0 ? 'box' : filter === '작업중' ? 'done' : 'box'} />
              <p className="empty-title">{empty.title}</p>
              {empty.hint ? <p className="empty-hint">{empty.hint}</p> : null}
              {orders.length === 0 ? (
                <button type="button" className="btn btn-primary" onClick={openNew}>첫 주문 추가</button>
              ) : filter === '작업중' ? (
                <button type="button" className="btn btn-secondary" onClick={() => setFilter('완료')}>완료 목록 보기</button>
              ) : query ? (
                <button type="button" className="btn btn-secondary" onClick={() => setQuery('')}>검색 초기화</button>
              ) : null}
            </div>
          ) : (
            renderCards(filtered)
          )}
        </main>
      )}

      {tab === 'make' && (
        <main className="tab-page" data-lock-zone>
          {makeSummary.orderCount === 0 ? (
            <div className="empty"><EmptyArt kind="done" /><p className="empty-title">만들 제품이 없어요</p><p className="empty-hint">대기·제작중 주문이 모두 끝났어요.</p></div>
          ) : (
            <>
              <section className="card-section">
                <ProductionSummary
                  orders={orders}
                  products={products}
                  filament={filament}
                  selected={productFilter}
                  onSelect={setProductFilter}
                  embedded
                />
              </section>
              <PrintQueue orders={orders} products={products} onDone={(id, key, count) => setItemDone(id, key, count)} onPartDone={setPartDone} onOpenProducts={() => setSheet('products')} />
              <h2 className="section-title">
                <Hammer size={17} /> 제작 체크 <span className="section-sub">{workOrders.length}건{productFilter ? ` · ‘${productFilter}’ 포함` : ''} · 접수 오래된 순</span>
              </h2>
              {postPending > 0 ? (
                <button type="button" className="btn btn-secondary btn-wide" onClick={() => setSheet('epost')}><Mailbox size={16} />우체국 접수하러 가기 ({postPending}건)</button>
              ) : null}
              {postPending > 0 || postOnly ? (
                <button
                  type="button"
                  className={`post-chip${postOnly ? ' on' : ''}`}
                  aria-pressed={postOnly}
                  onClick={() => setPostOnly((v) => !v)}
                >
                  📮 전송 대기 {postPending}건{postOnly ? ' · 전체 보기' : ''}
                </button>
              ) : null}
              <div className="order-list">{renderCards(workOrders)}</div>
            </>
          )}
        </main>
      )}

      {tab === 'sales' && (
        <main className="tab-page embedded-panel" data-lock-zone>
          <div className="seg-wrap">
            <div className="seg" role="tablist">
              <button type="button" data-allow-locked className={salesView === 'report' ? 'on' : ''} onClick={() => setSalesView('report')}>정산 · 입금</button>
              <button type="button" data-allow-locked className={salesView === 'profit' ? 'on' : ''} onClick={() => setSalesView('profit')}>원가 · 순이익</button>
            </div>
          </div>
          {salesView === 'profit' ? (
            <ProfitPanel orders={orders} products={products} filament={filament} period={period} onOpenShop={() => setSheet('shop')} />
          ) : (
          <SalesReport
            filament={filament}
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
            onClose={() => switchTab('orders')}
          />
          )}
        </main>
      )}

      {tab === 'customers' && (
        <main className="tab-page" data-lock-zone>
          <Customers
            orders={orders}
            products={products}
            copyText={(t, m) => void copyText(t, m)}
            onSearch={(q) => {
              setQuery(q);
              setFilter('전체');
              setPeriod({ preset: 'all' });
              setProductFilter(null);
              switchTab('orders');
            }}
          />
        </main>
      )}

      {tab === 'more' && (
        <main className="tab-page" data-lock-zone>
          <section className="card-section more-list">
            {MORE_ITEMS.map((m) => (
              <button key={m.id} type="button" className="more-row" data-allow-locked={m.id === 'google' || m.id === 'backup' ? '' : undefined} onClick={() => setSheet(m.id)}>
                <span className="more-ico" aria-hidden style={{ ['--ico-bg' as string]: m.color }}><m.icon size={20} /></span>
                <span className="more-text">
                  <b>{m.label}</b>
                  <small>{m.desc}</small>
                </span>
                {m.id === 'epost' && postPending > 0 ? <span className="more-badge">{postPending}</span> : null}
                {m.id === 'shipsms' && smsPending > 0 ? <span className="more-badge">{smsPending}</span> : null}
                <span className="more-caret" aria-hidden><ChevronRight size={18} /></span>
              </button>
            ))}
          </section>
          <p className="more-foot">링크는 그대로 · 새 버전은 앱을 완전히 닫았다 열면 적용돼요</p>
        </main>
      )}

      {tab === 'orders' && (
        <button type="button" className="fab" data-lock-zone onClick={openNew} aria-label="새 주문 추가"><Plus size={28} strokeWidth={2.6} /></button>
      )}

      {cmdOpen ? (
        <CommandBar orders={orders} products={products} actions={quickActions} onPick={pickFromCommand} onClose={() => setCmdOpen(false)} />
      ) : null}

      {sheet !== 'none' && (
        <div className="sheet-backdrop" onClick={() => setSheet('none')}>
          <div
            className="sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {sheet === 'shipsms' && (
              <ShipSmsPanel
                orders={orders}
                copyText={copyText}
                onToggleSent={(id, shipId, sent) => transformOrder(id, (o) => setShipmentSms(o, shipId, sent))}
                onClose={() => setSheet('none')}
              />
            )}
            {sheet === 'epost' && (
              <EpostPanel
                orders={orders}
                request={epostReq}
                onRequest={(r) => {
                  if (blocked()) return;
                  setEpostReq(r);
                  showToast('📮 접수 요청 저장됨 · 채팅으로 「접수해줘」라고 말해줘');
                  void google.syncNow();
                }}
                onCancelShip={(id, shipId) => sharedCardProps.onCancelShip(id, shipId)}
                onOpenSms={() => setSheet('shipsms')}
                onClose={() => setSheet('none')}
              />
            )}
            {sheet === 'deposit' && (
              <DepositMatch
                orders={orders}
                products={products}
                onApply={(list) => {
                  if (blocked()) return;
                  for (const x of list) updateOrder(x.id, { paid: true, paidAt: x.paidAt });
                  showToast(`💰 ${list.length}건 입금완료 처리`);
                  setSheet('none');
                }}
                onClose={() => setSheet('none')}
              />
            )}
            {sheet === 'shop' && (
              <ShopSettingsPanel
                copyText={(t, m) => void copyText(t, m)}
                onSaved={() => {
                  showToast('가게 설정 저장됨');
                  setSheet('none');
                }}
                onClose={() => setSheet('none')}
              />
            )}
            {sheet === 'backup' && (
              <BackupPanel
                orders={orders}
                products={products}
                period={period}
                onRestore={replaceOrders}
                onToast={showToast}
                onClose={() => setSheet('none')}
              />
            )}
            {sheet === 'form' && (
              <div className="sheet-body">
                <OrderForm
                  initial={editing}
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
              <ImportModal existing={orders} onImport={handleImport} onClose={() => setSheet('none')} />
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
            {sheet === 'products' && (
              <ProductManager
                products={products}
                filament={filament}
                onOpenFilament={() => setSheet('filament')}
                onChange={handleProductsChange}
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
                orders={orders}
                onApply={(updates) => {
                  const names = products.map((p) => p.name);
                  for (const u of updates) {
                    const cur = orders.find((o) => o.id === u.orderId);
                    if (cur?.shipments?.some((x) => x.postStatus !== 'cancelled')) {
                      const next = attachTracking(cur, u.trackingNumber);
                      transformOrder(u.orderId, () => next);
                      if (cur.status !== '완료' && isFullyShipped(next, orderItemProgress(next, names))) setStatus(u.orderId, '완료');
                    } else {
                      updateOrder(u.orderId, { trackingNumber: u.trackingNumber });
                    }
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
