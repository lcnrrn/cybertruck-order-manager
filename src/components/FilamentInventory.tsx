import { useMemo, useState } from 'react';
import type { Order } from '../types';
import type { Product } from '../products';
import {
  COLOR_SWATCH,
  DEFAULT_TYPE_ID,
  avgDailyByType,
  deductedUse,
  newEntryId,
  newTypeId,
  pendingByType,
  pendingBreakdownByType,
  productParts,
  stockByType,
  swatchOf,
  thresholdOf,
  typeHasHistory,
  typeLabel,
  type FilamentEntry,
  type FilamentState,
  type FilamentType,
} from '../filament';

interface Props {
  orders: Order[];
  products: Product[];
  state: FilamentState;
  onChange: (s: FilamentState) => void;
  onOpenProducts: () => void;
  onClose: () => void;
}

const fmt = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}g`;
const digits = (s: string) => Number(s.replace(/[^\d]/g, ''));

function TagList({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [v, setV] = useState('');
  const add = () => {
    const t = v.trim();
    if (!t || items.includes(t)) return;
    onChange([...items, t]);
    setV('');
  };
  return (
    <>
      <div className="fil-tags">
        {items.map((x) => (
          <span key={x} className="fil-tag">
            {x}
            <button type="button" aria-label={`${x} 삭제`} onClick={() => onChange(items.filter((y) => y !== x))}>×</button>
          </span>
        ))}
      </div>
      <div className="fil-row">
        <input className="grow" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className="btn btn-secondary" onClick={add} disabled={!v.trim()}>추가</button>
      </div>
    </>
  );
}

export function FilamentInventory({ orders, products, state, onChange, onOpenProducts, onClose }: Props) {
  const visible = state.types.filter((t) => !t.hidden);
  const [selId, setSelId] = useState<string>(visible[0]?.id || DEFAULT_TYPE_ID);
  const sel = state.types.find((t) => t.id === selId) || visible[0] || state.types[0];
  const [addG, setAddG] = useState('1000');
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');
  const [setTo, setSetTo] = useState('');
  const [editing, setEditing] = useState<FilamentType | null>(null);
  const [showLists, setShowLists] = useState(false);

  const stock = useMemo(() => stockByType(state, orders), [state, orders]);
  const avg = useMemo(() => avgDailyByType(orders), [orders]);
  const need = useMemo(() => pendingByType(orders, products, state), [orders, products, state]);
  const breakdown = useMemo(() => pendingBreakdownByType(orders, products, state), [orders, products, state]);
  const [openNeed, setOpenNeed] = useState<string | null>(null);
  const noGrams = !products.some((p) => productParts(p).length > 0);

  const history = useMemo(() => {
    const rows: { at: number; g: number; text: string; entry?: FilamentEntry }[] = state.entries
      .filter((e) => !e.deleted && (e.typeId || DEFAULT_TYPE_ID) === sel?.id)
      .map((e) => ({
        entry: e,
        at: e.at,
        g: e.grams,
        text: e.kind === 'purchase' ? `구매${e.note ? ` · ${e.note}` : ''}` : `재고 보정${e.note ? ` · ${e.note}` : ''}`,
      }));
    for (const o of orders) {
      const g = sel ? deductedUse(o)[sel.id] : undefined;
      if (g && o.filamentAt) rows.push({ at: o.filamentAt, g: -g, text: `완료 · ${o.name}` });
    }
    return rows.sort((a, b) => b.at - a.at).slice(0, 40);
  }, [state.entries, orders, sel]);

  if (!sel) return null;
  const selStock = stock[sel.id] || 0;

  function addEntry(grams: number, kind: 'purchase' | 'adjust', n: string, won?: number) {
    if (!grams) return;
    const now = Date.now();
    const e: FilamentEntry = { id: newEntryId(), at: now, grams, note: n, kind, typeId: sel.id, updatedAt: now };
    if (won && won > 0) e.cost = won;
    onChange({ ...state, entries: [...state.entries, e] });
  }

  function patchEntry(id: string, patch: Partial<FilamentEntry>) {
    onChange({
      ...state,
      entries: state.entries.map((e) => {
        if (e.id !== id) return e;
        const n: FilamentEntry = { ...e, ...patch, updatedAt: Date.now() };
        if ('cost' in patch && !patch.cost) delete n.cost;
        return n;
      }),
    });
  }

  function editCost(e: FilamentEntry) {
    const v = window.prompt('구매 금액(원) — 비우면 금액 없음', e.cost ? String(e.cost) : '');
    if (v === null) return;
    patchEntry(e.id, { cost: digits(v) || undefined });
  }

  function removeEntry(e: FilamentEntry) {
    if (!window.confirm(`${new Date(e.at).toLocaleDateString('ko-KR')} 기록(${fmt(e.grams)})을 삭제할까요? 재고와 지출에서도 빠져요.`)) return;
    patchEntry(e.id, { deleted: true });
  }

  function applySetTo() {
    if (!setTo.trim()) return;
    const diff = digits(setTo) - selStock;
    if (diff !== 0) addEntry(diff, 'adjust', '직접 맞춤');
    setSetTo('');
  }

  function saveType(t: FilamentType) {
    const material = t.material.trim();
    const color = t.color.trim();
    if (!material && !color) return window.alert('재질이나 색상을 입력해 주세요.');
    const next = { ...t, material, color };
    const exists = state.types.some((x) => x.id === t.id);
    onChange({
      ...state,
      types: exists ? state.types.map((x) => (x.id === t.id ? next : x)) : [...state.types, next],
      materials: material && !state.materials.includes(material) ? [...state.materials, material] : state.materials,
      colors: color && !state.colors.includes(color) ? [...state.colors, color] : state.colors,
    });
    setSelId(t.id);
    setEditing(null);
  }

  function deleteType(t: FilamentType) {
    if (t.id === DEFAULT_TYPE_ID) return window.alert('기본 종류는 삭제할 수 없어요. 이름만 바꿀 수 있어요.');
    if (!window.confirm(`「${typeLabel(t)}」를 삭제할까요?`)) return;
    const keep = typeHasHistory(state, orders, t.id);
    onChange({
      ...state,
      types: keep ? state.types.map((x) => (x.id === t.id ? { ...x, hidden: true } : x)) : state.types.filter((x) => x.id !== t.id),
    });
    setSelId(DEFAULT_TYPE_ID);
    setEditing(null);
  }

  return (
    <div className="sheet-body report">
      <h2 className="sheet-title">🧵 필라멘트 재고</h2>
      {noGrams && (
        <p className="hint report-warn">
          「제품 관리」에서 제품별 필라멘트 종류와 사용량(g)을 먼저 입력해 주세요.{' '}
          <button type="button" className="btn-link" onClick={onOpenProducts}>제품 관리 열기</button>
        </p>
      )}

      <div className="fil-cards">
        {visible.map((t) => {
          const st = stock[t.id] || 0;
          const a = avg[t.id] || 0;
          const nd = need[t.id] || 0;
          const th = thresholdOf(state, t.id);
          const days = a > 0 ? Math.floor(Math.max(0, st) / a) : null;
          const low = st < th;
          const soon = !low && nd > 0 && st - nd < th;
          return (
            <button type="button" key={t.id} className={`fil-card ${t.id === sel.id ? 'sel' : ''} ${low || st < nd ? 'bad' : ''}`} onClick={() => setSelId(t.id)}>
              <div className="fil-card-head">
                <i className="fil-dot" style={{ background: swatchOf(t) }} />
                <span>{typeLabel(t)}</span>
                <strong>{fmt(st)}</strong>
              </div>
              <div className="fil-card-meta">
                하루 평균 {fmt(a)} · 남은 기간 {days === null ? '—' : `약 ${days}일`} · 만들 주문 필요 {fmt(nd)} · 기준 {fmt(th)}
              </div>
              {nd > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  className="btn-link"
                  onClick={(e) => { e.stopPropagation(); setOpenNeed(openNeed === t.id ? null : t.id); }}
                >
                  {openNeed === t.id ? '▲ 필요량 내역 닫기' : '▼ 필요량 내역 보기'}
                </span>
              )}
              {openNeed === t.id && (
                <ul className="filament-history" onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const byProd = new Map<string, { qty: number; g: number; total: number; orders: string[] }>();
                    for (const l of breakdown[t.id] || []) {
                      const k = `${l.product}|${l.gramsPerUnit}`;
                      const r = byProd.get(k) ?? { qty: 0, g: l.gramsPerUnit, total: 0, orders: [] };
                      r.qty += l.qty; r.total += l.total; r.orders.push(l.qty > 1 ? `${l.orderName}×${l.qty}` : l.orderName);
                      byProd.set(k, r);
                    }
                    return Array.from(byProd.entries()).sort((a, b) => b[1].total - a[1].total).map(([k, r]) => (
                      <li key={k}>
                        <span>
                          {k.split('|')[0]} · {fmt(r.g)} × {r.qty}개{r.g > 2000 ? ' ⚠️ 1개당 g이 너무 커요. 제품 관리에서 확인하세요' : ''}
                          <br /><small className="hint">{r.orders.join(', ')}</small>
                        </span>
                        <b>{fmt(r.total)}</b>
                      </li>
                    ));
                  })()}
                </ul>
              )}
              {st < nd && <div className="fil-card-warn">⚠️ 지금 주문 만들기에 {fmt(nd - st)} 부족해요</div>}
              {low && st >= nd && <div className="fil-card-warn">⚠️ 기준 아래예요. 주문하세요!</div>}
              {soon && <div className="fil-card-warn">제작 후 {fmt(st - nd)}로 기준 아래가 돼요. 미리 주문하세요.</div>}
            </button>
          );
        })}
      </div>
      <button type="button" className="btn btn-primary" onClick={() => setEditing({ id: newTypeId(), material: state.materials[0] || '', color: state.colors[0] || '' })}>
        + 필라멘트 종류 추가
      </button>

      {editing && (
        <div className="fil-edit">
          <h3 className="report-h">{state.types.some((x) => x.id === editing.id) ? '종류 수정' : '새 종류'}</h3>
          <div className="fil-row">
            <input className="grow" list="fil-materials" value={editing.material} onChange={(e) => setEditing({ ...editing, material: e.target.value })} placeholder="재질 (예: PETG)" aria-label="재질" />
            <input className="grow" list="fil-colors" value={editing.color} onChange={(e) => setEditing({ ...editing, color: e.target.value })} placeholder="색상 (예: 블랙)" aria-label="색상" />
            <input type="color" value={editing.swatch || COLOR_SWATCH[editing.color] || '#64748b'} onChange={(e) => setEditing({ ...editing, swatch: e.target.value })} aria-label="표시 색" />
          </div>
          <datalist id="fil-materials">{state.materials.map((m) => <option key={m} value={m} />)}</datalist>
          <datalist id="fil-colors">{state.colors.map((c) => <option key={c} value={c} />)}</datalist>
          <div className="fil-row">
            <span>경고 기준</span>
            <input inputMode="numeric" className="grow" defaultValue={editing.threshold ?? thresholdOf(state, editing.id)}
              onChange={(e) => setEditing({ ...editing, threshold: digits(e.target.value) })} aria-label="경고 기준 g" />
            <span className="hint">g</span>
          </div>
          <div className="fil-row">
            <button type="button" className="btn btn-primary" onClick={() => saveType(editing)}>저장</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>취소</button>
            {state.types.some((x) => x.id === editing.id) && editing.id !== DEFAULT_TYPE_ID && (
              <button type="button" className="btn btn-danger-ghost" onClick={() => deleteType(editing)}>삭제</button>
            )}
          </div>
        </div>
      )}

      <h3 className="report-h">
        <i className="fil-dot" style={{ background: swatchOf(sel) }} /> {typeLabel(sel)} · 재고 {fmt(selStock)}{' '}
        <button type="button" className="btn-link" onClick={() => setEditing({ ...sel })}>이름·색·기준 수정</button>
      </h3>
      <div className="filament-quick">
        {[1000, 2000, 5000].map((g) => (
          <button key={g} type="button" className="btn btn-secondary" onClick={() => addEntry(g, 'purchase', '')}>
            +{g.toLocaleString('ko-KR')}g 구매
          </button>
        ))}
      </div>
      <div className="source-manager-add">
        <input className="source-custom-input" inputMode="numeric" value={addG} onChange={(e) => setAddG(e.target.value)} placeholder="g" aria-label="구매량 g" />
        <input className="source-custom-input" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="금액(원)" aria-label="구매 금액 원" />
        <input className="source-custom-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모 (예: 쿠팡)" aria-label="메모" />
        <button type="button" className="btn btn-primary" onClick={() => { addEntry(digits(addG), 'purchase', note.trim(), digits(cost)); setNote(''); setCost(''); }}>구매 추가</button>
      </div>
      <p className="hint">금액을 넣으면 「매출 정리」에 필라멘트 지출로 잡혀요. 아래 기록에서 나중에 금액을 넣거나 고칠 수도 있어요.</p>
      <p className="hint">재고 직접 맞추기 — 지금 가진 이 필라멘트 양을 입력하세요.</p>
      <div className="source-manager-add">
        <input className="source-custom-input" inputMode="numeric" value={setTo} onChange={(e) => setSetTo(e.target.value)} placeholder={`현재 ${fmt(selStock)}`} aria-label="실제 재고 g" />
        <button type="button" className="btn btn-secondary" onClick={applySetTo}>맞추기</button>
      </div>

      <h3 className="report-h">기록 · {typeLabel(sel)}</h3>
      <ul className="filament-history">
        {history.length === 0 && <li className="hint">아직 기록이 없어요.</li>}
        {history.map((h, i) => (
          <li key={h.entry?.id ?? i}>
            <span>{new Date(h.at).toLocaleDateString('ko-KR')} {h.text}</span>
            {h.entry?.kind === 'purchase' ? (
              <button type="button" className="btn-link fil-cost" onClick={() => editCost(h.entry!)}>
                {h.entry.cost ? `${h.entry.cost.toLocaleString('ko-KR')}원` : '+금액'}
              </button>
            ) : null}
            <b className={h.g < 0 ? 'neg' : 'pos'}>{h.g > 0 ? '+' : ''}{fmt(h.g)}</b>
            {h.entry ? (
              <button type="button" className="btn-icon fil-del" aria-label="기록 삭제" onClick={() => removeEntry(h.entry!)}>✕</button>
            ) : null}
          </li>
        ))}
      </ul>

      <h3 className="report-h">
        <button type="button" className="btn-link" onClick={() => setShowLists(!showLists)}>
          {showLists ? '▲' : '▼'} 재질·색상 목록 편집
        </button>
      </h3>
      {showLists && (
        <>
          <p className="hint">재질</p>
          <TagList items={state.materials} onChange={(materials) => onChange({ ...state, materials })} placeholder="새 재질 (예: PLA+)" />
          <p className="hint">색상</p>
          <TagList items={state.colors} onChange={(colors) => onChange({ ...state, colors })} placeholder="새 색상 (예: 카본블랙)" />
        </>
      )}
      <p className="hint">주문을 「완료」로 바꾸면 종류별로 g × 수량만큼 자동 차감돼요. 완료를 취소하면 다시 돌려놔요. 주문 메모에 색(예: 블랙)을 적으면 같은 재질의 그 색으로 자동 선택돼요.</p>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
