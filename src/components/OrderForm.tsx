import { useEffect, useState } from 'react';
import type { Order, OrderStatus } from '../types';
import { STATUS_OPTIONS } from '../types';
import {
  joinItems,
  parseItemsAgainstCatalog,
  type Product,
} from '../products';
import { SourcePicker } from './SourcePicker';

export type OrderFormValues = {
  name: string;
  items: string;
  address: string;
  phone: string;
  group: string;
  status: OrderStatus;
  priority: boolean;
  trackingNumber: string;
};

interface Props {
  initial?: Order | null;
  onSubmit: (values: OrderFormValues) => void;
  onCancel: () => void;
  sources: string[];
  products: Product[];
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
};

export function OrderForm({
  initial,
  onSubmit,
  onCancel,
  sources,
  products,
}: Props) {
  const [values, setValues] = useState<OrderFormValues>(empty);
  const [selected, setSelected] = useState<string[]>([]);
  const [itemsNote, setItemsNote] = useState('');

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
      });
      const parsed = parseItemsAgainstCatalog(initial.items, products);
      setSelected(parsed.selected);
      setItemsNote(parsed.note);
    } else {
      setValues(empty);
      setSelected([]);
      setItemsNote('');
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
    onSubmit({
      ...values,
      name: values.name.trim(),
      items,
      address: values.address.trim(),
      phone: values.phone.replace(/[-\s]/g, '').trim(),
      group: values.group.trim(),
      trackingNumber: values.trackingNumber.replace(/\D/g, '').trim(),
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
            미리보기: {joinItems(orderedSelected(), itemsNote)}
          </p>
        )}
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
        <span>송장번호</span>
        <input
          inputMode="numeric"
          value={values.trackingNumber}
          onChange={(e) => set('trackingNumber', e.target.value)}
          placeholder="우체국 13자리"
        />
      </label>

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
