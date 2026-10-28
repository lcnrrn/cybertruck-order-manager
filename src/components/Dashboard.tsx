import { useMemo } from 'react';
import {
  Banknote,
  ChartColumn,
  ChevronRight,
  ClipboardList,
  Clock,
  Hammer,
  Mailbox,
  MessageSquare,
  Plus,
  Spool,
  Trophy,
  Truck,
  Wallet,
} from 'lucide-react';
import type { Order } from '../types';
import type { Product } from '../products';
import type { FilamentState } from '../filament';
import { stockByType, swatchOf, thresholdOf, typeLabel } from '../filament';
import { orderTimestamp } from '../period';
import { formatDuration, formatWon, isUnpaid, orderAmount, orderItemProgress, parseOrderProducts, pendingMinutes, unitPrice } from '../production';
import { isFullyShipped } from '../shipments';
import { Bars, Ring, Sparkline } from '../ui/Charts';
import { TruckArt } from '../ui/Art';
import { useProductImages } from '../productImages';
import { useShopSettings } from '../shop';
import { estimateBalance, useExpenseState } from '../balance';
import { BalanceBreakdown } from './BalanceBreakdown';
import { costPerGram, monthlyProfit, shipFeeOf } from '../profit';

const DAY = 86400000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function shortWon(n: number): string {
  if (Math.abs(n) >= 100000000) return `${(n / 100000000).toFixed(1).replace(/\.0$/, '')}억`;
  if (Math.abs(n) >= 10000) return `${Math.round(n / 1000) / 10}만`;
  return n.toLocaleString('ko-KR');
}

const AVATAR_COLORS = ['#3b82f6', '#a855f7', '#22c55e', '#f97316', '#ec4899', '#06b6d4', '#eab308', '#f43f5e', '#14b8a6', '#818cf8'];
export function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function statusPill(o: Order): { cls: string; label: string } {
  if (o.status === '완료') return { cls: 'done', label: '완료' };
  if (o.status === '제작중') return { cls: 'make', label: '제작중' };
  return { cls: 'wait', label: '대기' };
}

interface Props {
  orders: Order[];
  products: Product[];
  filament: FilamentState;
  postPending: number;
  smsPending: number;
  onGo: (tab: 'orders' | 'make' | 'sales' | 'customers') => void;
  onOpen: (sheet: 'epost' | 'shipsms' | 'tracking' | 'deposit' | 'filament') => void;
  onNew: () => void;
  onEdit: (o: Order) => void;
  onFilter: (f: '미입금' | '제작중' | '작업중') => void;
}

export function Dashboard({ orders, products, filament, postPending, smsPending, onGo, onOpen, onNew, onEdit, onFilter }: Props) {
  const images = useProductImages();
  const shop = useShopSettings();
  const cpg = costPerGram(shop, filament).value;
  const fee = shipFeeOf(shop);
  const exp = useExpenseState();
  const est = useMemo(() => estimateBalance(exp, orders, products, filament), [exp, orders, products, filament]);
  const mp = useMemo(() => monthlyProfit(orders, products, cpg, fee, 1)[0], [orders, products, cpg, fee]);
  const d = useMemo(() => {
    const now = Date.now();
    const today = startOfDay(now);
    const names = products.map((p) => p.name);
    const days14 = Array.from({ length: 14 }, (_, i) => today - (13 - i) * DAY);
    const perDay = days14.map(() => 0);
    const thisMonth = new Date(now);
    const mStart = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1).getTime();
    const lastMStart = new Date(thisMonth.getFullYear(), thisMonth.getMonth() - 1, 1).getTime();
    const dayOfMonth = thisMonth.getDate();
    const monthDays = Array.from({ length: dayOfMonth }, () => 0);
    let todayCount = 0;
    let monthRev = 0;
    let lastMonthSamePeriod = 0;
    let making = 0;
    let waiting = 0;
    let unpaidCount = 0;
    let unpaidSum = 0;
    let readyToShip = 0;
    let itemsDone = 0;
    let itemsTotal = 0;
    const months: { key: string; label: string; total: number; paid: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(thisMonth.getFullYear(), thisMonth.getMonth() - i, 1);
      months.push({ key: `${dt.getFullYear()}-${dt.getMonth()}`, label: `${dt.getMonth() + 1}월`, total: 0, paid: 0 });
    }
    const rank = new Map<string, { qty: number; amount: number }>();
    for (const o of orders) {
      const ts = orderTimestamp(o.createdAt, o.updatedAt);
      const amt = orderAmount(o, products);
      const idx = Math.floor((startOfDay(ts) - days14[0]) / DAY);
      if (idx >= 0 && idx < 14) perDay[idx] += 1;
      if (ts >= today) todayCount += 1;
      if (ts >= mStart) {
        monthRev += amt;
        const di = new Date(ts).getDate() - 1;
        if (di >= 0 && di < monthDays.length) monthDays[di] += amt;
        for (const p of parseOrderProducts(o.items, names).products) {
          const r = rank.get(p.name) ?? { qty: 0, amount: 0 };
          r.qty += p.qty;
          r.amount += unitPrice(o, p.name, products) * p.qty;
          rank.set(p.name, r);
        }
      } else if (ts >= lastMStart && new Date(ts).getDate() <= dayOfMonth) {
        lastMonthSamePeriod += amt;
      }
      const dt = new Date(ts);
      const mk = months.find((m) => m.key === `${dt.getFullYear()}-${dt.getMonth()}`);
      if (mk) {
        mk.total += amt;
        if (o.paid) mk.paid += amt;
      }
      if (isUnpaid(o, products)) {
        unpaidCount += 1;
        unpaidSum += amt;
      }
      if (o.status === '제작중') making += 1;
      if (o.status === '대기') waiting += 1;
      if (o.status === '대기' || o.status === '제작중') {
        const prog = orderItemProgress(o, names);
        for (const p of prog) {
          itemsDone += p.done;
          itemsTotal += p.qty;
        }
        if (prog.length && prog.every((p) => p.done >= p.qty) && !isFullyShipped(o, prog)) readyToShip += 1;
      }
    }
    let acc = 0;
    const cumulative = monthDays.map((v) => (acc += v));
    const recent = [...orders].sort((a, b) => orderTimestamp(b.createdAt, b.updatedAt) - orderTimestamp(a.createdAt, a.updatedAt)).slice(0, 6);
    const rankRows = [...rank.entries()].filter(([n]) => n !== '우체국 택배').sort((a, b) => b[1].amount - a[1].amount || b[1].qty - a[1].qty).slice(0, 5);
    const change = lastMonthSamePeriod > 0 ? Math.round(((monthRev - lastMonthSamePeriod) / lastMonthSamePeriod) * 100) : null;
    const stock = stockByType(filament, orders);
    const lowStock = filament.types
      .map((t) => ({ t, g: stock[t.id] || 0, th: thresholdOf(filament, t.id) }))
      .filter((x) => x.g > 0 || x.th > 0)
      .sort((a, b) => a.g / Math.max(1, a.th) - b.g / Math.max(1, b.th))
      .slice(0, 4);
    return {
      todayCount, perDay, monthRev, cumulative, change, making, waiting, unpaidCount, unpaidSum, readyToShip,
      itemsDone, itemsTotal, months, recent, rankRows, lowStock, makeMin: pendingMinutes(orders, products),
    };
  }, [orders, products, filament]);

  const shipWait = d.readyToShip + postPending + smsPending;
  const hour = new Date().getHours();
  const greet = hour < 6 ? '늦은 밤이에요' : hour < 12 ? '좋은 아침이에요' : hour < 18 ? '오늘도 화이팅' : '오늘 하루 수고했어요';
  const maxRank = Math.max(1, ...d.rankRows.map(([, r]) => r.amount));
  const colorOf = (n: string) => products.find((p) => p.name === n)?.color;

  return (
    <div className="dash">
      <section className="dash-hero">
        <TruckArt />
        <span className="eyebrow">CYBERTRUCK · 3D PRINT STUDIO</span>
        <h2>{greet} 👋</h2>
        <p>
          작업 중 {d.making + d.waiting}건 · 미입금 {d.unpaidCount}건
          {d.makeMin > 0 ? ` · 남은 출력 ${formatDuration(d.makeMin)}` : ''}
        </p>
        <span className="big">
          {formatWon(d.monthRev)}
          <small>이번달 매출</small>
        </span>
        {mp && mp.revenue > 0 ? (
          <span className="hero-profit">
            예상 순이익 <b>{formatWon(Math.round(mp.net))}</b> · 마진 {Math.round((mp.net / mp.revenue) * 100)}%
            <small>재료비·택배비 뺀 추정</small>
          </span>
        ) : null}
      </section>

      <div className="kpis">
        <button type="button" className="kpi" style={{ ['--k' as string]: '#3b82f6' }} onClick={() => onGo('orders')}>
          <div className="kpi-top"><span className="kpi-label">오늘 주문</span><span className="kpi-ico"><ClipboardList size={17} /></span></div>
          <b className="kpi-value">{d.todayCount}<small>건</small></b>
          <Sparkline data={d.perDay} color="#5ea2ff" />
          <span className="kpi-sub">최근 14일 {d.perDay.reduce((a, b) => a + b, 0)}건</span>
        </button>
        <button type="button" className="kpi" style={{ ['--k' as string]: '#f59e0b' }} onClick={() => onGo('make')}>
          <div className="kpi-top"><span className="kpi-label">제작중</span><span className="kpi-ico"><Hammer size={17} /></span></div>
          <b className="kpi-value">{d.making}<small>건</small></b>
          <div className="kpi-ring">
            <Ring value={d.itemsDone} max={d.itemsTotal} size={34} color="#ffc24b" />
            <span className="kpi-sub">{d.itemsDone}/{d.itemsTotal}개 완성 · 대기 {d.waiting}건</span>
          </div>
        </button>
        <button type="button" className="kpi" style={{ ['--k' as string]: '#a855f7' }} onClick={() => onOpen(postPending ? 'epost' : smsPending ? 'shipsms' : 'tracking')}>
          <div className="kpi-top"><span className="kpi-label">발송 대기</span><span className="kpi-ico"><Truck size={17} /></span></div>
          <b className="kpi-value">{shipWait}<small>건</small></b>
          <span className="kpi-sub">다 만든 주문 {d.readyToShip} · 우체국 {postPending} · 문자 {smsPending}</span>
        </button>
        <button type="button" className="kpi" style={{ ['--k' as string]: '#10b981' }} onClick={() => onGo('sales')}>
          <div className="kpi-top"><span className="kpi-label">이번달 매출</span><span className="kpi-ico"><Wallet size={17} /></span></div>
          <b className="kpi-value">{shortWon(d.monthRev)}<small>원</small></b>
          <Sparkline data={d.cumulative} color="#3ee08f" />
          <span className="kpi-sub">
            {d.change === null ? '지난달 같은 기간 기록 없음' : `지난달 같은 기간보다 ${d.change >= 0 ? '▲' : '▼'} ${Math.abs(d.change)}%`}
          </span>
        </button>
      </div>

      <div className="quick">
        <button type="button" style={{ ['--k' as string]: 'linear-gradient(135deg,#5ee1ff,#3b82f6)' }} onClick={onNew}>
          <span className="qi"><Plus size={20} /></span>새 주문
        </button>
        <button type="button" style={{ ['--k' as string]: 'linear-gradient(135deg,#34d399,#059669)' }} onClick={() => onOpen('deposit')}>
          <span className="qi"><Banknote size={20} /></span>입금 확인
          {d.unpaidCount ? <b className="qb">{d.unpaidCount}</b> : null}
        </button>
        <button type="button" style={{ ['--k' as string]: 'linear-gradient(135deg,#f472b6,#be185d)' }} onClick={() => onOpen('epost')}>
          <span className="qi"><Mailbox size={20} /></span>우체국
          {postPending ? <b className="qb">{postPending}</b> : null}
        </button>
        <button type="button" style={{ ['--k' as string]: 'linear-gradient(135deg,#a78bfa,#6d28d9)' }} onClick={() => onOpen('shipsms')}>
          <span className="qi"><MessageSquare size={20} /></span>발송 문자
          {smsPending ? <b className="qb">{smsPending}</b> : null}
        </button>
      </div>

      {d.unpaidCount > 0 ? (
        <button type="button" className="alert-row" onClick={() => onFilter('미입금')}>
          <Clock size={16} />
          <span>미입금 <b>{d.unpaidCount}건</b> · {formatWon(d.unpaidSum)}</span>
          <ChevronRight size={16} />
        </button>
      ) : null}

      {est ? (
        <button type="button" className="panel bal-panel" onClick={() => onGo('sales')} aria-label="통장 잔고 자세히 보기">
          <div className="panel-head"><h3><Wallet size={16} />통장 잔고 (예상)</h3><small>매출 › 통장 잔고에서 실제 잔고로 맞춰요</small></div>
          <BalanceBreakdown est={est} />
        </button>
      ) : null}

      <div className="dash-grid">
        <section className="panel">
          <div className="panel-head">
            <h3><ChartColumn size={16} />월별 매출</h3>
            <div className="legend"><span><i style={{ background: '#5ee1ff' }} />주문액</span><span><i style={{ background: '#3ee08f' }} />입금</span></div>
          </div>
          <Bars
            labels={d.months.map((m) => m.label)}
            series={[
              { label: '주문액', values: d.months.map((m) => m.total), color: '#5ee1ff' },
              { label: '입금', values: d.months.map((m) => m.paid), color: '#3ee08f' },
            ]}
            format={formatWon}
          />
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3><Trophy size={16} />이번달 인기 제품</h3>
            <small>매출 순</small>
          </div>
          {d.rankRows.length === 0 ? (
            <p className="muted-line">이번달 주문이 아직 없어요</p>
          ) : (
            <ol className="rank">
              {d.rankRows.map(([name, r], i) => {
                const c = colorOf(name);
                return (
                  <li key={name}>
                    {images[name] ? (
                      <img className="thumb" src={images[name]} alt="" />
                    ) : (
                      <span className="thumb" style={{ background: c?.bg || '#1e293b', color: c?.text || '#cbd5e1', border: `1px solid ${c?.border || '#64748b'}` }}>{i + 1}</span>
                    )}
                    <span className="rbody">
                      <span className="rname">{name}</span>
                      <span className="rbar"><i style={{ width: `${Math.max(4, (r.amount / maxRank) * 100)}%` }} /></span>
                    </span>
                    <span className="rnum">{r.qty}개 · {shortWon(r.amount)}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3><ClipboardList size={16} />최근 주문</h3>
            <button type="button" className="link-btn" onClick={() => onGo('orders')}>전체 보기 <ChevronRight size={14} /></button>
          </div>
          {d.recent.length === 0 ? (
            <p className="muted-line">아직 주문이 없어요</p>
          ) : (
            <ul className="recent">
              {d.recent.map((o) => {
                const st = statusPill(o);
                return (
                  <li key={o.id} onClick={() => onEdit(o)} role="button">
                    <span className="avatar" style={{ background: avatarColor(o.name || '?') }}>{(o.name || '?').slice(0, 1)}</span>
                    <span className="rmain">
                      <b>{o.name || '(이름 없음)'}</b>
                      <small>{o.items || '—'}</small>
                    </span>
                    <span className="rside">
                      <span className={`pill ${st.cls}`}>{st.label}</span>
                      <small>{isUnpaid(o, products) ? <span className="unpaid-txt">미입금</span> : null} {formatWon(orderAmount(o, products))}</small>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3><Spool size={16} />필라멘트 재고</h3>
            <button type="button" className="link-btn" onClick={() => onOpen('filament')}>관리 <ChevronRight size={14} /></button>
          </div>
          {d.lowStock.length === 0 ? (
            <p className="muted-line">필라멘트 기록이 없어요</p>
          ) : (
            <ul className="stock-list">
              {d.lowStock.map(({ t, g, th }) => {
                const pct = Math.max(0, Math.min(100, (g / Math.max(1, th * 3)) * 100));
                const low = g < th;
                return (
                  <li key={t.id}>
                    <span className="swatch" style={{ background: swatchOf(t) }} />
                    <span className="rbody">
                      <span className="rname">{typeLabel(t)}</span>
                      <span className={`rbar${low ? ' low' : ''}`}><i style={{ width: `${Math.max(3, pct)}%` }} /></span>
                    </span>
                    <span className={`rnum${low ? ' low' : ''}`}>{(g / 1000).toFixed(1)}kg</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
