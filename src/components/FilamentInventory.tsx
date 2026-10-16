import { useMemo, useState } from 'react';
import type { Order } from '../types';
import type { Product } from '../products';
import { pendingGrams } from '../production';
import { avgDailyUsage, currentStock, newEntryId, type FilamentState } from '../filament';

interface Props {
  orders: Order[];
  products: Product[];
  state: FilamentState;
  onChange: (s: FilamentState) => void;
  onOpenProducts: () => void;
  onClose: () => void;
}

const fmt = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}g`;

export function FilamentInventory({ orders, products, state, onChange, onOpenProducts, onClose }: Props) {
  const [addG, setAddG] = useState('1000');
  const [note, setNote] = useState('');
  const [setTo, setSetTo] = useState('');
  const stock = currentStock(state, orders);
  const avg = useMemo(() => avgDailyUsage(orders), [orders]);
  const need = useMemo(() => pendingGrams(orders, products), [orders, products]);
  const daysLeft = avg > 0 ? Math.floor(Math.max(0, stock) / avg) : null;
  const low = stock < state.threshold;
  const noGrams = !products.some((p) => (p.grams || 0) > 0);

  const history = useMemo(() => {
    const rows: { at: number; g: number; text: string }[] = state.entries.map((e) => ({
      at: e.at,
      g: e.grams,
      text: e.kind === 'purchase' ? `구매${e.note ? ` · ${e.note}` : ''}` : `재고 보정${e.note ? ` · ${e.note}` : ''}`,
    }));
    for (const o of orders) {
      if (o.filamentG && o.filamentAt) rows.push({ at: o.filamentAt, g: -o.filamentG, text: `완료 · ${o.name}` });
    }
    return rows.sort((a, b) => b.at - a.at).slice(0, 40);
  }, [state.entries, orders]);

  function addPurchase(g: number) {
    if (!g) return;
    onChange({
      ...state,
      entries: [...state.entries, { id: newEntryId(), at: Date.now(), grams: g, note: note.trim(), kind: 'purchase' }],
    });
    setNote('');
  }

  function applySetTo() {
    const target = Number(setTo.replace(/[^\d]/g, ''));
    if (!setTo.trim() || !Number.isFinite(target)) return;
    const diff = target - stock;
    if (diff === 0) return;
    onChange({
      ...state,
      entries: [...state.entries, { id: newEntryId(), at: Date.now(), grams: diff, note: `${fmt(target)}로 맞춤`, kind: 'adjust' }],
    });
    setSetTo('');
  }

  return (
    <div className="sheet-body report">
      <h2 className="sheet-title">🧵 필라멘트 재고</h2>
      {noGrams && (
        <p className="hint report-warn">
          「제품 관리」에서 제품별 필라멘트 소모량(g)을 먼저 입력해 주세요.{' '}
          <button type="button" className="btn-link" onClick={onOpenProducts}>제품 관리 열기</button>
        </p>
      )}
      <div className="report-cards">
        <div className={`report-card ${low ? 'bad' : 'ok'}`}><span>현재 재고</span><strong>{fmt(stock)}</strong></div>
        <div className="report-card"><span>하루 평균 (30일)</span><strong>{fmt(avg)}</strong></div>
        <div className="report-card"><span>남은 기간</span><strong>{daysLeft === null ? '—' : `약 ${daysLeft}일`}</strong></div>
        <div className="report-card"><span>대기·제작중 필요</span><strong>{fmt(need)}</strong></div>
      </div>
      {low && (
        <p className="filament-alert">⚠️ 재고가 기준({fmt(state.threshold)}) 아래예요. 필라멘트를 주문하세요!</p>
      )}
      {!low && stock - need < state.threshold && need > 0 && (
        <p className="filament-alert soft">지금 주문들을 만들면 재고가 {fmt(stock - need)}로 기준 아래가 돼요. 미리 주문해 두세요.</p>
      )}

      <h3 className="report-h">필라멘트 구매 추가</h3>
      <div className="filament-quick">
        {[1000, 2000, 5000].map((g) => (
          <button key={g} type="button" className="btn btn-secondary" onClick={() => addPurchase(g)}>
            +{g.toLocaleString('ko-KR')}g
          </button>
        ))}
      </div>
      <div className="source-manager-add">
        <input className="source-custom-input" inputMode="numeric" value={addG} onChange={(e) => setAddG(e.target.value)} placeholder="g" aria-label="구매량 g" />
        <input className="source-custom-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모 (예: PETG 블랙)" aria-label="메모" />
        <button type="button" className="btn btn-primary" onClick={() => addPurchase(Number(addG.replace(/[^\d]/g, '')) || 0)}>추가</button>
      </div>

      <h3 className="report-h">재고 직접 맞추기</h3>
      <p className="hint">처음 쓸 때 지금 가진 필라멘트 총량을 입력하세요.</p>
      <div className="source-manager-add">
        <input className="source-custom-input" inputMode="numeric" value={setTo} onChange={(e) => setSetTo(e.target.value)} placeholder={`현재 ${fmt(stock)}`} aria-label="실제 재고 g" />
        <button type="button" className="btn btn-secondary" onClick={applySetTo}>맞추기</button>
      </div>

      <h3 className="report-h">경고 기준</h3>
      <div className="source-manager-add">
        <input
          className="source-custom-input"
          inputMode="numeric"
          defaultValue={state.threshold}
          onBlur={(e) => {
            const v = Number(e.target.value.replace(/[^\d]/g, ''));
            if (Number.isFinite(v)) onChange({ ...state, threshold: v });
          }}
          aria-label="경고 기준 g"
        />
        <span className="hint">g 이하면 주문 알림</span>
      </div>

      <h3 className="report-h">기록</h3>
      <ul className="filament-history">
        {history.length === 0 && <li className="hint">아직 기록이 없어요.</li>}
        {history.map((h, i) => (
          <li key={i}>
            <span>{new Date(h.at).toLocaleDateString('ko-KR')} {h.text}</span>
            <b className={h.g < 0 ? 'neg' : 'pos'}>{h.g > 0 ? '+' : ''}{fmt(h.g)}</b>
          </li>
        ))}
      </ul>
      <p className="hint">주문을 「완료」로 바꾸면 제품별 g × 수량만큼 자동 차감돼요. 완료를 취소하면 다시 돌려놔요.</p>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
