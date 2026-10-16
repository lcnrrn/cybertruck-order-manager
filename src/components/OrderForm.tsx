import { useEffect, useState } from 'react';
import type { Order, OrderStatus } from '../types';
import { STATUS_OPTIONS } from '../types';
import {
  joinItems,
  parseItemsAgainstCatalog,
  type Product,
} from '../products';
import { SourcePicker } from './SourcePicker';
import { autoOrderAmount, formatWon, orderGrams } from '../production';
import { orderSlots, swatchOf, typeLabel, type FilamentState } from '../filament';

function toDateInput(ms?: number): string {
  const d = new Date(ms || Date.now());
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type OrderFormValues = {
  name: string;
  items: string;
  address: string;
  phone: string;
  group: string;
  status: OrderStatus;
  priority: boolean;
  trackingNumber: string;
  /** 직접 입력 금액 — undefined = 자동 */
  amount?: number;
  paid: boolean;
  paidAt?: number;
  /** 제품별 필라멘트 종류 직접 선택 */
  filamentPick?: Record<string, string>;
};

interface Props {
  initial?: Order | null;
  onSubmit: (values: OrderFormValues) => void;
  onCancel: () => void;
  sources: string[];
  products: Product[];
  filament?: FilamentState;
}

const empty: OrderFormValues = {
  name: '',
  items: '',
  address: '',
  phone: '',
  group: '',
  status: '대기',
  priority: false,
  trackingNumber: '',
  paid: false,
};

export function OrderForm({
  initial,
  onSubmit,
  onCancel,
  sources,
  products,
  filament,
}: Props) {
  const [pick, setPick] = useState<Record<string, string>>({});
  const [values, setValues] = useState<OrderFormValues>(empty);
  const [selected, setSelected] = useState<string[]>([]);
  const [itemsNote, setItemsNote] = useState('');
  const [amountText, setAmountText] = useState('');

  useEffect(() => {
    if (initial) {
      setValues({
        name: initial.name,
        items: initial.items,
        address: initial.address,
        phone: initial.phone,
        group: initial.group || '',
        status: initial.status,
        priority: initial.priority,
        trackingNumber: initial.trackingNumber || '',
        amount: initial.amount,
        paid: Boolean(initial.paid),
        paidAt: initial.paidAt,
      });
      setAmountText(initial.amount !== undefined ? String(initial.amount) : '');
      setPick(initial.filamentPick || {});
      const parsed = parseItemsAgainstCatalog(initial.items, products);
      setSelected(parsed.selected);
      setItemsNote(parsed.note);
    } else {
      setValues(empty);
      setSelected([]);
      setItemsNote('');
      setAmountText('');
      setPick({});
    }
  }, [initial, products]);

  function set<K extends keyof OrderFormValues>(key: K, val: OrderFormValues[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function toggleProduct(name: string) {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );
  }

  function orderedSelected(): string[] {
    const names = products.map((p) => p.name);
    const ordered = names.filter((n) => selected.includes(n));
    const extras = selected.filter((n) => !names.includes(n));
    return [...ordered, ...extras];
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) {
      window.alert('이름을 입력해 주세요.');
      return;
    }
    const items = joinItems(orderedSelected(), itemsNote);
    const amtRaw = amountText.replace(/[^\d]/g, '');
    const keepPick = Object.keys(pick).length ? pick : undefined;
    onSubmit({
      ...values,
      filamentPick: keepPick,
      amount: amtRaw ? Number(amtRaw) : undefined,
      paidAt: values.paid ? values.paidAt || Date.now() : undefined,
      name: values.name.trim(),
      items,
      address: values.address.trim(),
      phone: values.phone.replace(/[-\s]/g, '').trim(),
      group: values.group.trim(),
      trackingNumber: values.trackingNumber.replace(/\s/g, '').trim(),
    });
  }

  return (
    <form className="order-form" onSubmit={handleSubmit}>
      <h2 className="sheet-title">{initial ? '주문 수정' : '새 주문'}</h2>

      <label className="field">
        <span>이름 *</span>
        <input
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="고객 이름"
          autoComplete="name"
          enterKeyHint="next"
        />
      </label>

      <fieldset className="field product-field">
        <legend>주문 내용</legend>
        <div className="product-chip-row" role="group" aria-label="제품 선택">
          {products.map((product) => {
            const active = selected.includes(product.name);
            const c = product.color;
            return (
              <button
                key={product.name}
                type="button"
                className={`product-chip ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() => toggleProduct(product.name)}
                style={
                  active
                    ? {
                        background: c.bg,
                        borderColor: c.border,
                        color: c.text,
                      }
                    : {
                        borderColor: c.border,
                        color: c.text,
                      }
                }
              >
                {product.name}
              </button>
            );
          })}
        </div>
        {products.length === 0 && (
          <p className="hint">
            제품 목록이 비어 있습니다. 「제품 관리」에서 추가하세요.
          </p>
        )}
        <label className="field product-note-field">
          <span>추가 메모 (선택)</span>
          <textarea
            value={itemsNote}
            onChange={(e) => setItemsNote(e.target.value)}
            placeholder="목록에 없는 내용 · 수량 · 색상 등"
            rows={2}
          />
        </label>
        {(selected.length > 0 || itemsNote.trim()) && (
          <p className="product-preview hint">
            미리보기:{' '}
            {orderedSelected().join(' / ')}
            {itemsNote.trim() ? (
              <>
                {selected.length > 0 ? ' / ' : ''}
                <span className="product-preview-note">{itemsNote.trim()}</span>
              </>
            ) : null}
          </p>
        )}
        {filament && (() => {
          const slots = orderSlots({ items: joinItems(orderedSelected(), itemsNote), filamentPick: pick }, products, filament);
          if (slots.length === 0) return null;
          const opts = filament.types.filter((t) => !t.hidden);
          return (
            <div className="fil-pick">
              <span className="hint">🧵 필라멘트 (메모의 색상 요청 자동 반영 · 바꿀 수 있어요)</span>
              {slots.map((sl) => {
                const k = `${sl.product}#${sl.idx}`;
                const t = filament.types.find((x) => x.id === sl.typeId);
                return (
                  <label key={k}>
                    <i className="fil-dot" style={{ background: swatchOf(t) }} />
                    <span>{sl.product} · {sl.grams * sl.qty}g</span>
                    <select
                      value={sl.typeId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPick((p) => {
                          const n = { ...p };
                          if (v === sl.defaultTypeId && !itemsNote) delete n[k];
                          else n[k] = v;
                          return n;
                        });
                      }}
                    >
                      {opts.map((o) => (
                        <option key={o.id} value={o.id}>{typeLabel(o)}</option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          );
        })()}
      </fieldset>

      <label className="field">
        <span>받을 주소</span>
        <textarea
          value={values.address}
          onChange={(e) => set('address', e.target.value)}
          placeholder="시/구/동 상세주소"
          rows={2}
          autoComplete="street-address"
        />
      </label>

      <label className="field">
        <span>연락처</span>
        <input
          type="tel"
          inputMode="tel"
          value={values.phone}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="01012345678"
          autoComplete="tel"
        />
      </label>

      <fieldset className="field source-field">
        <legend>주문 경로</legend>
        <SourcePicker
          value={values.group}
          onChange={(v) => set('group', v)}
          sources={sources}
        />
      </fieldset>

      <label className="field">
        <span>등기번호 (송장)</span>
        <input
          value={values.trackingNumber}
          onChange={(e) => set('trackingNumber', e.target.value)}
          placeholder="우체국 13자리 등기번호"
          inputMode="numeric"
          autoComplete="off"
        />
        {values.trackingNumber ? (
          <button
            type="button"
            className="btn-link tracking-clear"
            onClick={() => set('trackingNumber', '')}
          >
            송장 지우기
          </button>
        ) : null}
      </label>

      <fieldset className="field money-field">
        <legend>금액 · 입금</legend>
        {(() => {
          const preview = { items: joinItems(orderedSelected(), itemsNote) } as Order;
          const auto = autoOrderAmount(preview, products);
          const g = orderGrams(preview, products);
          return (
            <p className="hint">
              자동 계산: <strong>{formatWon(auto)}</strong>
              {g > 0 ? ` · 필라멘트 약 ${g.toLocaleString('ko-KR')}g` : ''}
              {auto === 0 ? ' (제품 관리에서 판매가를 입력하면 자동 계산돼요)' : ''}
            </p>
          );
        })()}
        <label className="field">
          <span>실제 금액 (비우면 자동 · 할인/배송비 반영 시 입력)</span>
          <input
            inputMode="numeric"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value.replace(/[^\d,]/g, ''))}
            placeholder="자동"
          />
        </label>
        <div className="status-row">
          <button
            type="button"
            className={`status-btn pay-btn unpaid ${!values.paid ? 'active' : ''}`}
            onClick={() => set('paid', false)}
          >
            미입금
          </button>
          <button
            type="button"
            className={`status-btn pay-btn paid ${values.paid ? 'active' : ''}`}
            onClick={() => setValues((v) => ({ ...v, paid: true, paidAt: v.paidAt || Date.now() }))}
          >
            입금완료
          </button>
        </div>
        {values.paid && (
          <label className="field">
            <span>입금일</span>
            <input
              type="date"
              value={toDateInput(values.paidAt)}
              onChange={(e) => {
                const t = e.target.value ? new Date(`${e.target.value}T12:00:00`).getTime() : Date.now();
                set('paidAt', t);
              }}
            />
          </label>
        )}
      </fieldset>

      <fieldset className="field">
        <legend>상태</legend>
        <div className="status-row">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`status-btn status-${s} ${values.status === s ? 'active' : ''}`}
              onClick={() => set('status', s)}
            >
              {s}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="check-row">
        <input
          type="checkbox"
          checked={values.priority}
          onChange={(e) => set('priority', e.target.checked)}
        />
        <span>우선순위</span>
      </label>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="btn btn-primary">
          {initial ? '저장' : '추가'}
        </button>
      </div>
    </form>
  );
}
