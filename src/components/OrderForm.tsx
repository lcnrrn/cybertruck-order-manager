import { toYmd } from '../dates';
import { useEffect, useState } from 'react';
import type { Order, OrderStatus } from '../types';
import { STATUS_OPTIONS } from '../types';
import {
  joinItems,
  parseItemsAgainstCatalog,
  type Product,
} from '../products';
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
  /** 품목별 단가 직접 지정 */
  prices?: Record<string, number>;
  /** 이 주문만의 필라멘트 줄 총량 */
  filamentGrams?: Record<string, number>;
  /** 접수일 YYYY-MM-DD */
  createdDate: string;
};

interface Props {
  initial?: Order | null;
  onSubmit: (values: OrderFormValues) => void;
  onCancel: () => void;
  sources?: string[];
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
  createdDate: '',
};

export function OrderForm({
  initial,
  onSubmit,
  onCancel,
  products,
  filament,
}: Props) {
  const [pick, setPick] = useState<Record<string, string>>({});
  const [values, setValues] = useState<OrderFormValues>(empty);
  const [selected, setSelected] = useState<string[]>([]);
  const [itemsNote, setItemsNote] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  /** 품목별 단가 직접 지정 (0 = 서비스) */
  const [prices, setPrices] = useState<Record<string, number>>({});
  /** 이 주문만의 필라멘트 줄 총량(g) */
  const [fgrams, setFgrams] = useState<Record<string, number>>({});
  const [gramText, setGramText] = useState<Record<string, string>>({});
  const [filOpen, setFilOpen] = useState(false);
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
        createdDate: toYmd(initial.createdAt || initial.updatedAt || Date.now()),
      });
      setAmountText(initial.amount !== undefined ? String(initial.amount) : '');
      setPick(initial.filamentPick || {});
      const parsed = parseItemsAgainstCatalog(initial.items, products);
      setSelected(parsed.selected);
      setQty(parsed.qty);
      setPrices(initial.prices || {});
      setFgrams(initial.filamentGrams || {});
      setGramText({});
      setItemsNote(parsed.note);
    } else {
      setValues({ ...empty, createdDate: toYmd(Date.now()) });
      setSelected([]);
      setQty({});
      setPrices({});
      setFgrams({});
      setGramText({});
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

  /** 품목 가격을 바꾸면 예전에 직접 넣은 전체 금액은 비워서 품목 합계가 반영되게 */
  function clearManual(): void {
    if (amountText) setAmountText('');
  }

  function catalogPrice(name: string): number {
    return products.find((p) => p.name === name)?.price || 0;
  }

  function priceOf(name: string): number {
    const v = prices[name];
    return typeof v === 'number' ? v : catalogPrice(name);
  }

  function changeQty(name: string, d: number) {
    setQty((q) => ({ ...q, [name]: Math.max(1, Math.min(99, (q[name] || 1) + d)) }));
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
    const items = joinItems(orderedSelected(), itemsNote, qty);
    const amtRaw = amountText.replace(/[^\d]/g, '');
    const keepPick = Object.keys(pick).length ? pick : undefined;
    onSubmit({
      ...values,
      filamentPick: keepPick,
      filamentGrams: (() => {
        const sel = new Set(orderedSelected());
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(fgrams)) {
          const i = k.lastIndexOf('#');
          if (i > 0 && sel.has(k.slice(0, i))) out[k] = v;
        }
        return Object.keys(out).length ? out : undefined;
      })(),
      prices: (() => {
        // 선택된 품목만, 판매가와 다른 값만 저장
        const out: Record<string, number> = {};
        for (const n of orderedSelected()) {
          const v = prices[n];
          if (typeof v === 'number' && v !== catalogPrice(n)) out[n] = v;
        }
        return Object.keys(out).length ? out : undefined;
      })(),
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

      <label className="field">
        <span>접수일</span>
        <input
          type="date"
          value={values.createdDate}
          onChange={(e) => set('createdDate', e.target.value)}
          aria-label="접수일"
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
        {selected.length > 0 && (
          <ul className="qty-list" aria-label="제품별 수량">
            {orderedSelected().map((name) => (
              <li key={name} className={priceOf(name) === 0 && catalogPrice(name) > 0 ? 'is-service' : ''}>
                <div className="qty-line">
                  <span className="qty-name" title={name}>{name}</span>
                  <span className="qty-stepper">
                    <button type="button" className="btn-icon" aria-label="수량 빼기" onClick={() => changeQty(name, -1)} disabled={(qty[name] || 1) <= 1}>−</button>
                    <b>{qty[name] || 1}</b>
                    <button type="button" className="btn-icon" aria-label="수량 더하기" onClick={() => changeQty(name, 1)}>+</button>
                  </span>
                  <input
                    inputMode="numeric"
                    aria-label={`${name} 단가`}
                    value={priceOf(name).toLocaleString('ko-KR')}
                    onChange={(e) => {
                      const v = Number(e.target.value.replace(/[^\d]/g, '')) || 0;
                      clearManual();
                      setPrices((p) => ({ ...p, [name]: v }));
                    }}
                  />
                  <b className="qty-sub">{formatWon(priceOf(name) * (qty[name] || 1))}</b>
                  <button
                    type="button"
                    className={`btn btn-compact service-btn ${priceOf(name) === 0 ? 'on' : ''}`}
                    onClick={() => {
                      clearManual();
                      setPrices((p) => {
                        const n = { ...p };
                        if (priceOf(name) === 0) delete n[name]; // 서비스 해제 → 판매가로
                        else n[name] = 0;
                        return n;
                      });
                    }}
                  >
                    {priceOf(name) === 0 ? '서비스✓' : '서비스'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {selected.length > 0 && (
          <p className="qty-total">
            품목 합계 <b>{formatWon(autoOrderAmount({ items: joinItems(orderedSelected(), itemsNote, qty), prices }, products))}</b>
          </p>
        )}
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
            placeholder="목록에 없는 내용 · 색상 등 (수량은 위에서)"
            rows={2}
          />
        </label>
        {(selected.length > 0 || itemsNote.trim()) && (
          <p className="product-preview hint">
            미리보기:{' '}
            {joinItems(orderedSelected(), '', qty).replace(/ x(\d+)/g, ' ×$1')}
            {itemsNote.trim() ? (
              <>
                {selected.length > 0 ? ' / ' : ''}
                <span className="product-preview-note">{itemsNote.trim()}</span>
              </>
            ) : null}
          </p>
        )}
        {filament && (() => {
          const slots = orderSlots(
            { items: joinItems(orderedSelected(), itemsNote, qty), filamentPick: pick, filamentGrams: fgrams },
            products,
            filament,
            false,
            true,
          );
          if (slots.length === 0) return null;
          const opts = filament.types.filter((t) => !t.hidden);
          const totalG = Math.round(slots.reduce((a, sl) => a + sl.grams * sl.qty, 0) * 10) / 10;
          const typeNames = Array.from(new Set(slots.filter((sl) => sl.grams > 0).map((sl) => typeLabel(filament.types.find((x) => x.id === sl.typeId)))));
          const edited = slots.some((sl) => sl.overrideTotal !== undefined);
          const summary = (
            <button type="button" className="fil-summary" onClick={() => setFilOpen(!filOpen)} aria-expanded={filOpen}>
              🧵 필라멘트 약 {totalG.toLocaleString('ko-KR')}g
              {typeNames.length ? ` · ${typeNames[0]}${typeNames.length > 1 ? ` 외 ${typeNames.length - 1}` : ''}` : ''}
              {edited ? <em className="fil-edited">수정됨</em> : null}
              <span className="fil-caret">{filOpen ? '▾' : '▸'}</span>
            </button>
          );
          if (!filOpen) return <div className="fil-pick compact">{summary}</div>;
          const byProduct = new Map<string, number>();
          for (const sl of slots) byProduct.set(sl.product, Math.max(byProduct.get(sl.product) ?? -1, sl.idx));
          return (
            <div className="fil-pick compact">
              {summary}
              <span className="fil-hint">g = 이 주문의 그 줄 총량(수량 포함) · 이 주문에만 적용</span>
              {slots.map((sl, i) => {
                const k = `${sl.product}#${sl.idx}`;
                const t = filament.types.find((x) => x.id === sl.typeId);
                const total = Math.round(sl.grams * sl.qty * 100) / 100;
                const isLastOfProduct = byProduct.get(sl.product) === sl.idx && slots.findIndex((x, j) => j > i && x.product === sl.product) < 0;
                return (
                  <div key={k} className={`fil-row ${sl.overrideTotal !== undefined ? 'overridden' : ''}`}>
                    <div className="fil-row-top">
                      <i className="fil-dot" style={{ background: swatchOf(t) }} />
                      <span className="fil-row-name">{sl.product}{sl.extra && sl.idx > 0 ? ` (추가 ${sl.idx})` : ''}</span>
                      <input
                        className="fil-g-input"
                        inputMode="decimal"
                        aria-label={`${sl.product} 필라멘트 g`}
                        value={gramText[k] ?? String(total)}
                        onChange={(e) => {
                          const txt = e.target.value.replace(/[^\d.]/g, '');
                          setGramText((m) => ({ ...m, [k]: txt }));
                          const v = Number(txt);
                          if (txt !== '' && Number.isFinite(v)) setFgrams((m) => ({ ...m, [k]: v }));
                        }}
                        onBlur={() => setGramText((m) => {
                          const n = { ...m };
                          delete n[k];
                          return n;
                        })}
                      />
                      <span className="fil-g-unit">g{sl.fullQty > 1 ? `·×${sl.fullQty}` : ''}</span>
                    <select className="fil-type"
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
                      {sl.overrideTotal !== undefined && !sl.extra ? (
                        <button type="button" className="btn-icon fil-reset" aria-label="기본값으로" title={`기본 ${sl.catalogGrams * sl.fullQty}g`}
                          onClick={() => setFgrams((m) => { const n = { ...m }; delete n[k]; return n; })}>↺</button>
                      ) : null}
                      {sl.extra && sl.idx > 0 ? (
                        <button type="button" className="btn-icon fil-reset" aria-label="이 줄 삭제"
                          onClick={() => {
                            setFgrams((m) => { const n = { ...m }; delete n[k]; return n; });
                            setPick((m) => { const n = { ...m }; delete n[k]; return n; });
                          }}>✕</button>
                      ) : null}
                    </div>
                    {isLastOfProduct ? (
                      <button type="button" className="btn-link fil-add" onClick={() => setFgrams((m) => ({ ...m, [`${sl.product}#${sl.idx + 1}`]: 0 }))}>
                        + 필라멘트 추가
                      </button>
                    ) : null}
                  </div>
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
          const preview = { items: joinItems(orderedSelected(), itemsNote, qty), prices, filamentGrams: fgrams } as Order;
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
          <span>실제 금액 (비우면 품목 합계 · 전체 할인 등만 직접 입력)</span>
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
