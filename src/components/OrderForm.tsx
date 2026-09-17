import { useEffect, useState } from 'react';
import type { Order, OrderStatus } from '../types';
import { STATUS_OPTIONS } from '../types';

export type OrderFormValues = {
  name: string;
  items: string;
  address: string;
  phone: string;
  group: string;
  status: OrderStatus;
  priority: boolean;
};

interface Props {
  initial?: Order | null;
  onSubmit: (values: OrderFormValues) => void;
  onCancel: () => void;
}

const empty: OrderFormValues = {
  name: '',
  items: '',
  address: '',
  phone: '',
  group: '',
  status: '대기',
  priority: false,
};

export function OrderForm({ initial, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<OrderFormValues>(empty);

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
      });
    } else {
      setValues(empty);
    }
  }, [initial]);

  function set<K extends keyof OrderFormValues>(key: K, val: OrderFormValues[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) {
      window.alert('이름을 입력해 주세요.');
      return;
    }
    onSubmit({
      ...values,
      name: values.name.trim(),
      items: values.items.trim(),
      address: values.address.trim(),
      phone: values.phone.replace(/[-\s]/g, '').trim(),
      group: values.group.trim(),
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

      <label className="field">
        <span>주문 내용</span>
        <textarea
          value={values.items}
          onChange={(e) => set('items', e.target.value)}
          placeholder="사이드미러 커버 실버 1개"
          rows={2}
        />
      </label>

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

      <label className="field">
        <span>그룹 / 유입 (선택)</span>
        <input
          value={values.group}
          onChange={(e) => set('group', e.target.value)}
          placeholder="스마트스토어, 인스타…"
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
