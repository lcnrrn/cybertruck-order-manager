import { useMemo, useState } from 'react';
import type { Order } from '../types';
import type { Product } from '../products';
import { formatWon, orderAmount } from '../production';
import { refundRemaining, refundTotal } from '../refunds';

function toDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fromDateInput(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d, 12).getTime() : Date.now();
}
const wonNum = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0;

export interface RefundInput {
  at: number;
  amount: number;
  memo: string;
}

/** 환불 입력 칸 (금액 · 날짜 · 메모) — 주문 환불 창과 「환불로 옮기기」가 같이 씀 */
function RefundFields({ remaining, initial, onChange }: { remaining: number; initial: { amount: number; at: number; memo: string }; onChange: (v: RefundInput) => void }) {
  const [amount, setAmount] = useState(String(initial.amount || ''));
  const [date, setDate] = useState(toDateInput(initial.at));
  const [memo, setMemo] = useState(initial.memo);
  const emit = (a: string, d: string, m: string) => onChange({ amount: wonNum(a), at: fromDateInput(d), memo: m });
  return (
    <div className="refund-fields">
      <label>환불 금액(원)
        <input className="source-custom-input" inputMode="numeric" value={amount} onChange={(e) => { setAmount(e.target.value); emit(e.target.value, date, memo); }} placeholder="환불한 금액" aria-label="환불 금액" />
      </label>
      <div className="refund-chips">
        <button type="button" className="btn btn-ghost" onClick={() => { setAmount(String(remaining)); emit(String(remaining), date, memo); }}>남은 전액 {formatWon(remaining)}</button>
      </div>
      <label>환불한 날
        <input type="date" className="source-custom-input" value={date} onChange={(e) => { setDate(e.target.value); emit(amount, e.target.value, memo); }} />
      </label>
      <label>메모
        <input className="source-custom-input" value={memo} onChange={(e) => { setMemo(e.target.value); emit(amount, date, e.target.value); }} placeholder="예: 단순 변심, 택배비 제외" aria-label="환불 메모" />
      </label>
    </div>
  );
}

interface RefundPanelProps {
  order: Order;
  products: Product[];
  onAdd: (r: RefundInput) => void;
  onRemove: (refundId: string) => void;
  onClose: () => void;
}

/** 주문 1건 환불 — 부분/전액. 지출이 아니라 매출에서 빼는 값 */
export function RefundPanel({ order, products, onAdd, onRemove, onClose }: RefundPanelProps) {
  const gross = orderAmount(order, products);
  const done = refundTotal(order);
  const remaining = refundRemaining(order, products);
  const [val, setVal] = useState<RefundInput>({ amount: remaining, at: Date.now(), memo: '' });
  const willFull = val.amount > 0 && val.amount >= remaining && remaining > 0;
  return (
    <div className="sheet-body refund-panel">
      <h2 className="sheet-title">↩ 환불 · {order.name}</h2>
      <p className="hint">
        주문 금액 {formatWon(gross)}{done > 0 ? ` · 이미 환불 ${formatWon(done)} · 남은 ${formatWon(remaining)}` : ''}.
        환불은 <b>지출이 아니라 매출에서 빠지고</b> (순이익도 같이 줄어요), 예상 통장 잔고에서도 빠져요.
      </p>
      {(order.refunds || []).length > 0 && (
        <ul className="expense-list refund-list">
          {(order.refunds || []).map((r) => (
            <li key={r.id}>
              <div className="expense-row">
                <span className="expense-date">{new Date(r.at).toLocaleDateString('ko-KR')}</span>
                <span className="expense-badge refund-badge">환불</span>
                <span className="expense-note">{r.memo || '-'}</span>
                <b>−{formatWon(r.amount)}</b>
              </div>
              <button type="button" className="btn btn-danger-ghost expense-to-refund" onClick={() => { if (window.confirm(`${formatWon(r.amount)} 환불 기록을 지울까?${r.prev ? ` (주문 상태가 「${r.prev}」로 돌아가요)` : ''}`)) onRemove(r.id); }}>이 환불 기록 삭제</button>
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 ? (
        <>
          <RefundFields remaining={remaining} initial={{ amount: remaining, at: Date.now(), memo: '' }} onChange={setVal} />
          {val.amount > remaining && <p className="report-warn">남은 금액({formatWon(remaining)})보다 커요. 남은 금액까지만 기록돼요.</p>}
          {willFull && <p className="hint">전액 환불이라 주문 상태가 <b>「환불」</b>로 바뀌고 제작 목록에서 빠져요. (이미 차감된 필라멘트는 그대로 두니, 되돌리려면 제작 체크를 풀어줘)</p>}
        </>
      ) : (
        <p className="hint">이 주문은 전액 환불됐어요.</p>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>닫기</button>
        {remaining > 0 && (
          <button type="button" className="btn btn-primary" disabled={val.amount <= 0} onClick={() => onAdd({ ...val, amount: Math.min(val.amount, remaining) })}>환불 기록</button>
        )}
      </div>
    </div>
  );
}

interface MoveProps {
  expense: { id: string; at: number; amount: number; note: string };
  orders: Order[];
  products: Product[];
  onConfirm: (orderId: string, r: RefundInput) => void;
  onClose: () => void;
}

const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** 지출로 적어둔 환불 → 주문 환불로 옮기기: 그 지출은 지우고, 고른 주문에 환불로 기록 */
export function ExpenseToRefundPanel({ expense, orders, products, onConfirm, onClose }: MoveProps) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const note = squash(expense.note);
  const list = useMemo(() => {
    const sc = (o: Order) => (note && note.includes(squash(o.name).replace(/\d+번$/, '')) && squash(o.name).length >= 2 ? 0 : 1);
    const qq = squash(q);
    return orders
      .filter((o) => o.status !== '환불' || refundRemaining(o, products) > 0)
      .filter((o) => !qq || squash(o.name).includes(qq) || squash(o.items).includes(qq))
      .sort((a, b) => sc(a) - sc(b) || (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 12);
  }, [orders, products, q, note]);
  const target = orders.find((o) => o.id === sel) || null;
  const remaining = target ? refundRemaining(target, products) : 0;
  const [val, setVal] = useState<RefundInput>({ amount: expense.amount, at: expense.at, memo: expense.note });
  return (
    <div className="sheet-body refund-panel">
      <h2 className="sheet-title">↩ 지출을 환불로 옮기기</h2>
      <p className="hint">
        지출 <b>{new Date(expense.at).toLocaleDateString('ko-KR')} · {expense.note || '-'} · {formatWon(expense.amount)}</b> 을(를) 지출에서 지우고,
        고른 주문의 <b>환불</b>로 기록해요 (매출·순이익에서 빠지고, 예상 잔고는 그대로 {formatWon(expense.amount)} 줄어든 상태 유지).
      </p>
      <input className="source-custom-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="주문 찾기 (이름·제품)" aria-label="주문 찾기" />
      <ul className="refund-pick">
        {list.map((o) => (
          <li key={o.id}>
            <button type="button" className={`refund-pick-row ${sel === o.id ? 'on' : ''}`} onClick={() => { setSel(o.id); setVal((v) => ({ ...v, amount: Math.min(expense.amount, refundRemaining(o, products)) || expense.amount })); }}>
              <b>{o.name}</b>
              <span>{new Date(o.createdAt || o.updatedAt).toLocaleDateString('ko-KR')} · {o.status} · {formatWon(orderAmount(o, products))}{refundTotal(o) ? ` (환불 −${formatWon(refundTotal(o))})` : ''}</span>
              <small>{o.items}</small>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="hint">찾는 주문이 없어요.</li>}
      </ul>
      {target && (
        <>
          <RefundFields key={target.id} remaining={remaining} initial={{ amount: val.amount, at: val.at, memo: val.memo }} onChange={setVal} />
          {val.amount > remaining && <p className="report-warn">「{target.name}」 남은 금액({formatWon(remaining)})보다 커요. 남은 금액까지만 기록돼요.</p>}
        </>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>취소</button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!target || val.amount <= 0}
          onClick={() => {
            if (!target) return;
            const amount = Math.min(val.amount, remaining);
            if (window.confirm(`지출 ${formatWon(expense.amount)}을 지우고 「${target.name}」 주문에 환불 ${formatWon(amount)}으로 옮길까?`)) onConfirm(target.id, { ...val, amount });
          }}
        >
          환불로 옮기기
        </button>
      </div>
    </div>
  );
}
