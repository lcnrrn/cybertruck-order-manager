import { useEffect, useMemo, useState } from 'react';
import type { FilamentState } from '../filament';
import { SETTINGS_APPLIED_EVENT } from '../settingsMeta';
import {
  FILAMENT_CATEGORY,
  expenseLines,
  expenseTotals,
  inBounds,
  loadExpenses,
  newExpenseId,
  saveExpenses,
  type Expense,
  type ExpenseLine,
  type ExpenseState,
} from '../expenses';
import type { Order, PeriodRange } from '../types';
import type { Product } from '../products';
import { orderTimestamp, resolvePeriodBounds } from '../period';
import { formatWon, isServiceItem, orderAmount, parseOrderProducts, unitPrice } from '../production';
import { PeriodFilterBar } from './PeriodFilter';

interface Props {
  orders: Order[];
  filament?: FilamentState;
  products: Product[];
  period: PeriodRange;
  onPeriod: (p: PeriodRange) => void;
  onTogglePaid: (id: string) => void;
  onMarkPaid: (ids: string[]) => void;
  onEdit: (o: Order) => void;
  onClose: () => void;
}

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function toDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fromDateInput(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d, 12).getTime() : Date.now();
}

interface Draft {
  id?: string;
  date: string;
  category: string;
  note: string;
  amount: string;
}

export function SalesReport({ filament, orders, products, period, onPeriod, onTogglePaid, onMarkPaid, onEdit, onClose }: Props) {
  const data = useMemo(() => {
    const bounds = resolvePeriodBounds(period);
    const list = orders.filter((o) => {
      if (!bounds) return true;
      const ts = orderTimestamp(o.createdAt, o.updatedAt);
      return ts >= bounds[0] && ts <= bounds[1];
    });
    let total = 0;
    let paid = 0;
    const months = new Map<string, { count: number; total: number; paid: number }>();
    const prod = new Map<string, { qty: number; amount: number }>();
    const unpaid: { order: Order; amount: number }[] = [];
    const names = products.map((p) => p.name);
    let serviceQty = 0;
    let serviceValue = 0;
    for (const o of list) {
      const amt = orderAmount(o, products);
      total += amt;
      if (o.paid) paid += amt;
      else if (amt > 0) unpaid.push({ order: o, amount: amt });
      const mk = monthKey(orderTimestamp(o.createdAt, o.updatedAt));
      const m = months.get(mk) ?? { count: 0, total: 0, paid: 0 };
      m.count += 1;
      m.total += amt;
      if (o.paid) m.paid += amt;
      months.set(mk, m);
      for (const p of parseOrderProducts(o.items, names).products) {
        const price = unitPrice(o, p.name, products);
        if (isServiceItem(o, p.name)) {
          serviceQty += p.qty;
          serviceValue += (products.find((x) => x.name === p.name)?.price || 0) * p.qty;
        }
        const r = prod.get(p.name) ?? { qty: 0, amount: 0 };
        r.qty += p.qty;
        r.amount += price * p.qty;
        prod.set(p.name, r);
      }
    }
    const monthRows = [...months.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    const prodRows = [...prod.entries()].sort((a, b) => b[1].amount - a[1].amount || b[1].qty - a[1].qty);
    unpaid.sort((a, b) => a.order.createdAt - b.order.createdAt);
    return { serviceQty, serviceValue, count: list.length, total, paid, unpaidSum: total - paid, unpaid, monthRows, prodRows, list };
  }, [orders, products, period]);

  const [exp, setExp] = useState<ExpenseState>(() => loadExpenses());
  useEffect(() => {
    const re = () => setExp(loadExpenses());
    window.addEventListener(SETTINGS_APPLIED_EVENT, re);
    return () => window.removeEventListener(SETTINGS_APPLIED_EVENT, re);
  }, []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const commit = (next: ExpenseState) => {
    setExp(next);
    saveExpenses(next);
  };
  const ex = useMemo(() => {
    const bounds = resolvePeriodBounds(period);
    const lines = expenseLines(exp, filament ?? null).filter((l) => inBounds(l.at, bounds));
    return { lines, ...expenseTotals(lines) };
  }, [exp, filament, period]);
  const profit = data.total - ex.total;

  const openNew = () =>
    setDraft({ date: toDateInput(Date.now()), category: exp.categories[0] || '부속품', note: '', amount: '' });
  const openLine = (l: ExpenseLine) => {
    if (l.filamentEntryId) {
      window.alert('필라멘트 구매 지출은 「필라멘트」 화면의 기록에서 금액을 고치거나 삭제할 수 있어요.');
      return;
    }
    const it = exp.items.find((x) => x.id === l.id);
    if (it) setDraft({ id: it.id, date: toDateInput(it.at), category: it.category, note: it.note, amount: String(it.amount) });
  };
  const saveDraft = () => {
    if (!draft) return;
    const amount = Number(draft.amount.replace(/[^\d]/g, ''));
    if (!amount) {
      window.alert('금액을 입력해 주세요.');
      return;
    }
    const now = Date.now();
    const item: Expense = {
      id: draft.id || newExpenseId(),
      at: fromDateInput(draft.date),
      category: draft.category || '기타',
      note: draft.note.trim(),
      amount,
      updatedAt: now,
    };
    const items = draft.id ? exp.items.map((x) => (x.id === draft.id ? item : x)) : [...exp.items, item];
    commit({ ...exp, items });
    setDraft(null);
  };
  const deleteDraft = () => {
    if (!draft?.id || !window.confirm('이 지출을 삭제할까요?')) return;
    const id = draft.id;
    commit({ ...exp, items: exp.items.map((x) => (x.id === id ? { ...x, deleted: true, updatedAt: Date.now() } : x)) });
    setDraft(null);
  };
  const addCategory = () => {
    const v = window.prompt('새 지출 분류 이름 (예: 포장재)')?.trim();
    if (!v || v === FILAMENT_CATEGORY || exp.categories.includes(v)) return;
    commit({ ...exp, categories: [...exp.categories, v] });
    if (draft) setDraft({ ...draft, category: v });
  };

  const maxMonth = Math.max(1, ...data.monthRows.map(([, m]) => m.total));
  const maxProd = Math.max(1, ...data.prodRows.map(([, r]) => r.amount || r.qty));
  const noPrices = !products.some((p) => (p.price || 0) > 0);
  const oldDone = data.unpaid.filter((u) => u.order.status === '완료');

  return (
    <div className="sheet-body report">
      <h2 className="sheet-title">📊 매출 정리</h2>
      <PeriodFilterBar value={period} onChange={onPeriod} />
      {noPrices && (
        <p className="hint report-warn">「제품 관리」에서 제품별 판매가를 먼저 입력해 주세요. 그래야 금액이 자동 계산돼요.</p>
      )}
      <div className="report-cards">
        <div className="report-card"><span>주문</span><strong>{data.count}건</strong></div>
        <div className="report-card"><span>총 매출</span><strong>{formatWon(data.total)}</strong></div>
        <div className="report-card ok"><span>입금</span><strong>{formatWon(data.paid)}</strong></div>
        <div className="report-card bad"><span>미입금</span><strong>{formatWon(data.unpaidSum)}</strong></div>
        <div className="report-card bad"><span>지출</span><strong>{formatWon(ex.total)}</strong></div>
        <div className={`report-card ${profit >= 0 ? 'ok' : 'bad'}`}><span>순이익 (매출 − 지출)</span><strong>{formatWon(profit)}</strong></div>
      </div>

      <h3 className="report-h expense-h">
        <span>지출 {ex.lines.length}건</span>
        <button type="button" className="btn btn-primary expense-add" onClick={openNew}>+ 지출 추가</button>
      </h3>
      {ex.byCategory.length > 0 && (
        <div className="expense-cats">
          {ex.byCategory.map(([c, v]) => (
            <span key={c} className="expense-cat">{c} <b>{formatWon(v)}</b></span>
          ))}
        </div>
      )}
      {draft && (
        <div className="expense-form">
          <label>날짜<input type="date" className="source-custom-input" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
          <div className="expense-cat-pick">
            {exp.categories.map((c) => (
              <button key={c} type="button" className={`btn ${draft.category === c ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDraft({ ...draft, category: c })}>{c}</button>
            ))}
            <button type="button" className="btn btn-ghost" onClick={addCategory}>+ 분류</button>
          </div>
          <input className="source-custom-input" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="내용 (예: 볼트, 자석)" aria-label="내용" />
          <input className="source-custom-input" inputMode="numeric" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="금액(원)" aria-label="금액" />
          <div className="form-actions">
            {draft.id && <button type="button" className="btn btn-danger-ghost" onClick={deleteDraft}>삭제</button>}
            <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)}>취소</button>
            <button type="button" className="btn btn-primary" onClick={saveDraft}>{draft.id ? '수정 저장' : '추가'}</button>
          </div>
        </div>
      )}
      {ex.lines.length === 0 ? (
        <p className="hint">이 기간 지출이 없어요. 필라멘트 구매 금액은 「필라멘트」 화면에서 넣으면 자동으로 잡혀요.</p>
      ) : (
        <ul className="expense-list">
          {ex.lines.map((l) => (
            <li key={l.id}>
              <button type="button" className="expense-row" onClick={() => openLine(l)}>
                <span className="expense-date">{new Date(l.at).toLocaleDateString('ko-KR')}</span>
                <span className="expense-badge">{l.category}</span>
                <span className="expense-note">{l.note || '-'}</span>
                <b>{formatWon(l.amount)}</b>
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="report-h">미입금 주문 {data.unpaid.length}건</h3>
      {data.unpaid.length === 0 ? (
        <p className="hint">미입금 주문이 없어요 👍</p>
      ) : (
        <>
          <ul className="report-unpaid">
            {data.unpaid.map(({ order, amount }) => (
              <li key={order.id}>
                <button type="button" className="report-unpaid-name" onClick={() => onEdit(order)}>
                  {order.name}
                  <em>{new Date(order.createdAt).toLocaleDateString('ko-KR')} · {order.status}</em>
                </button>
                <span className="report-amt">{formatWon(amount)}</span>
                <button type="button" className="btn btn-secondary report-pay" onClick={() => onTogglePaid(order.id)}>
                  입금확인
                </button>
              </li>
            ))}
          </ul>
          {oldDone.length > 1 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (window.confirm(`완료된 주문 ${oldDone.length}건을 모두 입금완료로 바꿀까요? (기존 주문 정리용)`)) {
                  onMarkPaid(oldDone.map((u) => u.order.id));
                }
              }}
            >
              완료 주문 {oldDone.length}건 모두 입금완료 처리
            </button>
          )}
        </>
      )}

      <h3 className="report-h">월별</h3>
      <ul className="report-bars">
        {data.monthRows.map(([k, m]) => (
          <li key={k}>
            <div className="report-bar-label">
              <span>{k.replace('-', '년 ')}월 · {m.count}건</span>
              <span>{formatWon(m.total)}{m.total - m.paid > 0 ? ` (미입금 ${formatWon(m.total - m.paid)})` : ''}</span>
            </div>
            <div className="report-bar"><i style={{ width: `${(m.total / maxMonth) * 100}%` }} /><b style={{ width: `${(m.paid / maxMonth) * 100}%` }} /></div>
          </li>
        ))}
      </ul>

      <h3 className="report-h">제품별 판매</h3>
      <ul className="report-bars">
        {data.prodRows.map(([name, r]) => (
          <li key={name}>
            <div className="report-bar-label">
              <span>{name} · {r.qty}개</span>
              <span>{formatWon(r.amount)}</span>
            </div>
            <div className="report-bar"><b style={{ width: `${((r.amount || r.qty) / maxProd) * 100}%` }} /></div>
          </li>
        ))}
      </ul>
      <p className="hint">제품별 금액은 주문별 단가(서비스는 0원) × 수량 기준이에요 (전체 금액을 직접 입력한 할인분은 총 매출에만 반영).</p>
      {data.serviceQty > 0 && (
        <p className="hint">🎁 서비스 제공 {data.serviceQty}개 · 판매가 기준 {formatWon(data.serviceValue)} 상당</p>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
