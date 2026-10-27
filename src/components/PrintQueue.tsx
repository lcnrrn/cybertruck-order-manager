import { useMemo, useState } from 'react';
import { CalendarClock, Check, Layers, TriangleAlert, Weight, Timer } from 'lucide-react';
import type { Order } from '../types';
import { getProductColor, type Product } from '../products';
import {
  formatDuration,
  loadProductionSettings,
  orderPartProgress,
  productComponents,
  parseOrderProducts,
  pendingLoadByProduct,
  remainingQty,
  SHIPPING_NAME,
  type ProductLoad,
} from '../production';
import { useProductImages } from '../productImages';

interface Props {
  orders: Order[];
  products: Product[];
  /** 그 주문의 그 품목 완료 개수를 count 로 */
  onDone: (orderId: string, key: string, count: number) => void;
  /** 세트 제품 구성품 개수 지정 */
  onPartDone?: (orderId: string, product: string, part: string, count: number) => void;
  onOpenProducts: () => void;
}

interface Unit { order: Order; name: string; minutes: number }

function personName(n: string): string {
  return (n || '').trim().split(/[\s(/,]+/)[0] || n;
}

/** 우선 → 접수 오래된 순 */
function byQueue(a: Order, b: Order): number {
  return Number(!!b.priority) - Number(!!a.priority) || (a.createdAt || a.updatedAt) - (b.createdAt || b.updatedAt);
}

export function PrintQueue({ orders, products, onDone, onPartDone, onOpenProducts }: Props) {
  const images = useProductImages();
  const [showPlan, setShowPlan] = useState(true);
  const settings = loadProductionSettings();
  const names = useMemo(() => products.map((p) => p.name), [products]);
  const loads = useMemo(() => pendingLoadByProduct(orders, products).filter((l) => l.qty > 0 && l.name !== SHIPPING_NAME), [orders, products]);
  const active = useMemo(() => orders.filter((o) => o.status === '대기' || o.status === '제작중').sort(byQueue), [orders]);

  /** 제품별 다음으로 만들 주문 (가장 오래된·우선) */
  const nextFor = useMemo(() => {
    const m = new Map<string, { order: Order; left: number; done: number; waiting: number }>();
    for (const o of active) {
      for (const p of parseOrderProducts(o.items, names).products) {
        if (p.name === SHIPPING_NAME) continue;
        const left = remainingQty(o, p.name, p.qty);
        if (left <= 0) continue;
        const cur = m.get(p.name);
        if (!cur) m.set(p.name, { order: o, left, done: Math.max(0, Math.floor(o.doneMap?.[p.name] || 0)), waiting: 1 });
        else cur.waiting += 1;
      }
    }
    return m;
  }, [active, names]);

  /** 구성품별 다음 주문 (「제품::구성품」 → 주문·만든 개수·남은 개수) */
  const nextPart = useMemo(() => {
    const m = new Map<string, { order: Order; done: number; left: number; waiting: number }>();
    for (const o of active) {
      for (const p of parseOrderProducts(o.items, names).products) {
        const prod = products.find((c) => c.name === p.name);
        if (!prod || !productComponents(prod).length) continue;
        for (const x of orderPartProgress(o, prod, p.qty)) {
          const left = x.need - x.done;
          if (left <= 0) continue;
          const k = `${p.name}::${x.name}`;
          const cur = m.get(k);
          if (!cur) m.set(k, { order: o, done: x.done, left, waiting: 1 });
          else cur.waiting += 1;
        }
      }
    }
    return m;
  }, [active, names, products]);

  /** 하루 단위 출력 계획 (프린터 대수 × 하루 가동 시간) */
  const plan = useMemo(() => {
    const cap = Math.max(1, settings.printers) * Math.max(0.5, settings.hoursPerDay) * 60;
    const units: Unit[] = [];
    for (const o of active)
      for (const p of parseOrderProducts(o.items, names).products) {
        if (p.name === SHIPPING_NAME) continue;
        const prod = products.find((c) => c.name === p.name);
        if (prod && productComponents(prod).length) {
          for (const x of orderPartProgress(o, prod, p.qty))
            for (let i = x.done; i < x.need; i++) units.push({ order: o, name: `${p.name} · ${x.name}`, minutes: x.minutes });
          continue;
        }
        const left = remainingQty(o, p.name, p.qty);
        const mi = prod?.minutes || 0;
        for (let i = 0; i < left; i++) units.push({ order: o, name: p.name, minutes: mi });
      }
    const days: { minutes: number; items: Map<string, { qty: number; orders: Set<string> }> }[] = [];
    let cur = { minutes: 0, items: new Map<string, { qty: number; orders: Set<string> }>() };
    for (const u of units) {
      if (cur.minutes > 0 && cur.minutes + u.minutes > cap) {
        days.push(cur);
        cur = { minutes: 0, items: new Map() };
      }
      cur.minutes += u.minutes;
      const it = cur.items.get(u.name) || { qty: 0, orders: new Set<string>() };
      it.qty += 1;
      it.orders.add(personName(u.order.name));
      cur.items.set(u.name, it);
    }
    if (cur.items.size) days.push(cur);
    return { days, cap };
  }, [active, names, products, settings.printers, settings.hoursPerDay]);

  const outliers = loads.filter((l) => l.suspicious);
  const totalMin = loads.reduce((s, l) => s + l.minutes, 0);
  const totalG = loads.reduce((s, l) => s + l.grams, 0);
  const maxMin = Math.max(1, ...loads.map((l) => l.minutes));

  if (!loads.length) return null;

  const thumb = (l: ProductLoad) => {
    const img = images[l.name];
    const c = getProductColor(l.name, products);
    return img ? <img className="pq-thumb" src={img} alt="" /> : <span className="pq-thumb" style={{ background: c.bg, color: c.text, borderColor: c.border }}>{l.name.slice(0, 1)}</span>;
  };

  return (
    <section className="panel pq">
      <div className="panel-head">
        <h3><Layers size={17} />출력 큐</h3>
        <small>{loads.reduce((s, l) => s + l.qty, 0)}개 · {formatDuration(totalMin)} · {Math.round(totalG).toLocaleString('ko-KR')}g</small>
      </div>

      {outliers.length > 0 && (
        <button type="button" className="pq-alert" onClick={onOpenProducts}>
          <TriangleAlert size={16} />
          <span>
            <b>입력값 확인 필요</b> · {outliers.map((l) => `${l.name} (1개 ${Math.round(l.gramsPerUnit).toLocaleString('ko-KR')}g / ${l.minutesPerUnit.toLocaleString('ko-KR')}분)`).join(', ')} — 세트 총량이나 kg 단위로 넣은 건 아닌지 제품 관리에서 봐줘
          </span>
        </button>
      )}

      <ul className="pq-list">
        {loads.map((l) => {
          const nx = nextFor.get(l.name);
          return (
            <li key={l.name} className={`pq-row${l.suspicious ? ' bad' : ''}`}>
              {thumb(l)}
              <div className="pq-main">
                <div className="pq-name"><b>{l.name}</b><span className="pq-qty">×{l.qty}</span></div>
                <div className="pq-meta">
                  <span><Timer size={12} />{l.minutes ? formatDuration(l.minutes) : '시간 미입력'}</span>
                  <span><Weight size={12} />{Math.round(l.grams).toLocaleString('ko-KR')}g</span>
                  {nx ? <span className="pq-next">다음: {personName(nx.order.name)}{nx.order.priority ? ' ★' : ''}{nx.waiting > 1 ? ` 외 ${nx.waiting - 1}명` : ''}</span> : null}
                </div>
                <div className="pq-bar"><i style={{ width: `${Math.max(4, (l.minutes / maxMin) * 100)}%` }} /></div>
              </div>
              {l.parts ? (
                <ul className="pq-parts">
                  {l.parts.map((pt) => {
                    const np = nextPart.get(`${l.name}::${pt.name}`);
                    const add = (n: number) => np && onPartDone?.(np.order.id, l.name, pt.name, np.done + n);
                    return (
                      <li key={pt.name} className={pt.left <= 0 ? 'ok' : ''}>
                        <div className="pq-part-main">
                          <b>{pt.name}</b> <span className="pq-qty">남은 {pt.left}개</span>
                          <div className="pq-meta">
                            <span><Timer size={12} />{pt.noTime ? <em className="warn-text">시간 미입력</em> : formatDuration(pt.minutes)}</span>
                            <span><Weight size={12} />{Math.round(pt.grams).toLocaleString('ko-KR')}g</span>
                            {np ? <span className="pq-next">다음: {personName(np.order.name)}{np.order.priority ? ' ★' : ''} {np.done}/{np.done + np.left}</span> : null}
                          </div>
                        </div>
                        {np && onPartDone ? (
                          <span className="pq-part-btns">
                            <button type="button" className="pq-plus" onClick={() => add(1)} aria-label={`${pt.name} 1개 완료`}>+1</button>
                            {np.left >= 4 ? <button type="button" className="pq-plus" onClick={() => add(4)}>+4</button> : null}
                            {np.left >= 8 ? <button type="button" className="pq-plus" onClick={() => add(8)}>+8</button> : null}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {nx && !l.parts ? (
                <button
                  type="button"
                  className="pq-check"
                  aria-label={`${personName(nx.order.name)} ${l.name} 1개 완료`}
                  title={`${personName(nx.order.name)} 주문의 ${l.name} 1개 완료 체크`}
                  onClick={() => onDone(nx.order.id, l.name, nx.done + 1)}
                >
                  <Check size={18} strokeWidth={3} />
                  <small>1개</small>
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="muted-line">✓ 누르면 가장 오래된(우선 ★ 먼저) 주문의 그 제품 1개가 완료 체크돼요. 세트 제품은 구성품 +1 / +4 / +8 로 한 판에 뽑은 만큼 올려요. 잘못 눌렀으면 주문 카드에서 − 로 빼면 돼요.</p>

      <div className="pq-plan-head">
        <h4><CalendarClock size={15} />출력 계획 <small>프린터 {settings.printers}대 × 하루 {settings.hoursPerDay}시간 기준</small></h4>
        <button type="button" className="link-btn" onClick={() => setShowPlan((v) => !v)}>{showPlan ? '접기' : '펼치기'}</button>
      </div>
      {showPlan && (
        <ol className="pq-plan">
          {plan.days.slice(0, 7).map((d, i) => (
            <li key={i}>
              <div className="pq-day"><b>{i + 1}일차</b><small>{formatDuration(d.minutes)}{d.minutes > plan.cap ? ' · 하루 넘음' : ''}</small></div>
              <div className="pq-chips">
                {[...d.items.entries()].map(([name, it]) => {
                  const c = getProductColor(name.split(' · ')[0], products);
                  return (
                    <span key={name} className="pq-chip" style={{ borderColor: c.border }} title={[...it.orders].join(', ')}>
                      {name} <b>×{it.qty}</b>
                    </span>
                  );
                })}
              </div>
            </li>
          ))}
          {plan.days.length > 7 ? <li className="muted-line">… {plan.days.length - 7}일 더</li> : null}
        </ol>
      )}
    </section>
  );
}
