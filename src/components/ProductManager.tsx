import { loadProductionSettings, saveProductionSettings } from '../production';
import { useState } from 'react';
import {
  DEFAULT_PRODUCTS,
  PRODUCT_COLOR_PALETTE,
  type Product,
  type ProductColor,
} from '../products';
import { productParts, swatchOf, typeLabel, type FilamentState } from '../filament';

interface Props {
  products: Product[];
  onChange: (next: Product[]) => void;
  onClose: () => void;
  filament?: FilamentState;
  onOpenFilament?: () => void;
}

function sameColor(a: ProductColor, b: ProductColor): boolean {
  return a.bg === b.bg && a.border === b.border && a.text === b.text;
}

export function ProductManager({ products, onChange, onClose, filament, onOpenFilament }: Props) {
  const [prodSet, setProdSet] = useState(() => loadProductionSettings());
  const typeOpts = (filament?.types || []).filter((t) => !t.hidden);

  function setParts(name: string, parts: { typeId: string; grams: number }[]) {
    onChange(
      products.map((p) => {
        if (p.name !== name) return p;
        const next = { ...p };
        const clean = parts.filter((x) => x.typeId);
        if (clean.length === 0) {
          delete next.filaments;
          delete next.grams;
        } else {
          next.filaments = clean;
          next.grams = clean.reduce((a, x) => a + (x.grams || 0), 0);
        }
        return next;
      }),
    );
  }

  const [draft, setDraft] = useState('');
  const [draftColor, setDraftColor] = useState<ProductColor>(
    PRODUCT_COLOR_PALETTE[0],
  );
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingColorFor, setEditingColorFor] = useState<string | null>(null);

  function addProduct() {
    const name = draft.trim();
    if (!name) return;
    if (products.some((p) => p.name === name)) {
      window.alert('이미 있는 제품입니다.');
      return;
    }
    onChange([...products, { name, color: draftColor }]);
    setDraft('');
    const nextIdx =
      (PRODUCT_COLOR_PALETTE.findIndex((c) => sameColor(c, draftColor)) + 1) %
      PRODUCT_COLOR_PALETTE.length;
    setDraftColor(PRODUCT_COLOR_PALETTE[nextIdx]);
  }

  function removeProduct(name: string) {
    if (products.length <= 1) {
      window.alert('제품을 최소 1개 이상 남겨 주세요.');
      return;
    }
    if (!window.confirm(`「${name}」을(를) 목록에서 삭제할까요?`)) {
      return;
    }
    onChange(products.filter((p) => p.name !== name));
  }

  function startRename(name: string) {
    setRenaming(name);
    setRenameValue(name);
    setEditingColorFor(null);
  }

  function commitRename() {
    if (!renaming) return;
    const next = renameValue.trim();
    if (!next) {
      window.alert('이름을 입력해 주세요.');
      return;
    }
    if (next !== renaming && products.some((p) => p.name === next)) {
      window.alert('이미 있는 제품입니다.');
      return;
    }
    onChange(
      products.map((p) => (p.name === renaming ? { ...p, name: next } : p)),
    );
    setRenaming(null);
    setRenameValue('');
  }

  function setProductColor(name: string, color: ProductColor) {
    onChange(products.map((p) => (p.name === name ? { ...p, color } : p)));
    setEditingColorFor(null);
  }

  function setNumber(name: string, key: 'price' | 'minutes', raw: string) {
    const digits = raw.replace(/[^\d.]/g, '');
    onChange(
      products.map((p) => {
        if (p.name !== name) return p;
        const next = { ...p };
        if (digits === '') delete next[key];
        else next[key] = Number(digits);
        return next;
      }),
    );
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= products.length) return;
    const next = [...products];
    const tmp = next[index];
    next[index] = next[j];
    next[j] = tmp;
    onChange(next);
  }

  function resetDefaults() {
    if (!window.confirm('기본 제품 목록으로 되돌릴까요?')) return;
    onChange(DEFAULT_PRODUCTS.map((p) => ({ ...p, color: { ...p.color } })));
  }

  function ColorSwatches({
    value,
    onPick,
    label,
  }: {
    value: ProductColor;
    onPick: (c: ProductColor) => void;
    label: string;
  }) {
    return (
      <div className="product-color-swatches" role="group" aria-label={label}>
        {PRODUCT_COLOR_PALETTE.map((c, i) => {
          const active = sameColor(c, value);
          return (
            <button
              key={i}
              type="button"
              className={`product-color-swatch ${active ? 'active' : ''}`}
              style={{ background: c.bg, borderColor: c.border }}
              onClick={() => onPick(c)}
              aria-label={`색상 ${i + 1}`}
              aria-pressed={active}
              title={`색상 ${i + 1}`}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="sheet-body source-manager">
      <h2 className="sheet-title">제품 관리</h2>
      <div className="prod-settings">
        <span className="hint">⏱ 제작 설정 (예상 완료일 계산)</span>
        <div className="product-numbers">
          <label>
            <span>프린터 대수</span>
            <input
              inputMode="numeric"
              defaultValue={prodSet.printers}
              onBlur={(e) => {
                const n = Math.max(1, Math.round(Number(e.target.value.replace(/[^\d]/g, '')) || 1));
                const next = { ...prodSet, printers: n };
                setProdSet(next);
                saveProductionSettings(next);
              }}
            />
          </label>
          <label>
            <span>하루 가동 시간</span>
            <input
              inputMode="decimal"
              defaultValue={prodSet.hoursPerDay}
              onBlur={(e) => {
                const n = Math.min(24, Math.max(0.5, Number(e.target.value.replace(/[^\d.]/g, '')) || 12));
                const next = { ...prodSet, hoursPerDay: n };
                setProdSet(next);
                saveProductionSettings(next);
              }}
            />
          </label>
        </div>
      </div>
      <p className="hint">
        주문 내용에 쓸 제품 목록을 추가·이름 변경·색상·삭제·순서 변경할 수 있습니다.
        제품마다 <b>판매가(1개)</b>와 <b>필라멘트 소모량(1개, g)</b>을 입력하면 주문 금액과 필라멘트 차감이 자동 계산됩니다.
        이 기기에만 저장됩니다. 삭제해도 기존 주문의 내용 문자열은 유지됩니다.
      </p>

      <ul className="source-manager-list">
        {products.map((product, i) => {
          const { name, color } = product;
          const isRenaming = renaming === name;
          const isColorEdit = editingColorFor === name;
          return (
            <li key={`${name}-${i}`} className="source-manager-item product-manager-item">
              <span
                className="source-manager-swatch"
                style={{
                  background: color.bg,
                  borderColor: color.border,
                  color: color.text,
                }}
                aria-hidden
              />
              {isRenaming ? (
                <input
                  className="source-manager-rename"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRename();
                    } else if (e.key === 'Escape') {
                      setRenaming(null);
                    }
                  }}
                  autoFocus
                  aria-label="제품 이름 변경"
                />
              ) : (
                <span className="source-manager-name">{name}</span>
              )}
              <div className="source-manager-actions">
                <button
                  type="button"
                  className="btn btn-ghost source-mgr-btn"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="위로"
                  title="위로"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-ghost source-mgr-btn"
                  disabled={i === products.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="아래로"
                  title="아래로"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn-ghost source-mgr-btn"
                  onClick={() =>
                    setEditingColorFor(isColorEdit ? null : name)
                  }
                  aria-pressed={isColorEdit}
                >
                  색상
                </button>
                {isRenaming ? (
                  <button
                    type="button"
                    className="btn btn-secondary source-mgr-btn"
                    onClick={commitRename}
                  >
                    확인
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost source-mgr-btn"
                    onClick={() => startRename(name)}
                  >
                    이름
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-danger-ghost source-mgr-btn"
                  onClick={() => removeProduct(name)}
                >
                  삭제
                </button>
              </div>
              <div className="product-numbers">
                <label>
                  <span>판매가(원)</span>
                  <input
                    inputMode="numeric"
                    defaultValue={product.price ?? ''}
                    placeholder="0"
                    onBlur={(e) => setNumber(name, 'price', e.target.value)}
                    aria-label={`${name} 판매가`}
                  />
                </label>
                <label>
                  <span>출력 시간(분/1개)</span>
                  <input
                    inputMode="numeric"
                    defaultValue={product.minutes ?? ''}
                    placeholder="0"
                    onBlur={(e) => setNumber(name, 'minutes', e.target.value)}
                    aria-label={`${name} 출력 시간`}
                  />
                </label>
              </div>
              <div className="fil-parts">
                <span className="hint">필라멘트 (1개당){typeOpts.length <= 1 && onOpenFilament ? ' — ' : ''}
                  {typeOpts.length <= 1 && onOpenFilament && (
                    <button type="button" className="btn-link" onClick={onOpenFilament}>재질·색상 종류 추가하기</button>
                  )}
                </span>
                {(() => {
                  const parts = productParts(product);
                  return (
                    <>
                      {parts.map((part, pi) => {
                        const t = filament?.types.find((x) => x.id === part.typeId);
                        return (
                          <div className="fil-row" key={`${pi}-${part.typeId}`}>
                            <i className="fil-dot" style={{ background: swatchOf(t) }} />
                            <select
                              className="grow"
                              value={part.typeId}
                              onChange={(e) => setParts(name, parts.map((x, j) => (j === pi ? { ...x, typeId: e.target.value } : x)))}
                              aria-label={`${name} 필라멘트 종류`}
                            >
                              {!typeOpts.some((o) => o.id === part.typeId) && <option value={part.typeId}>{typeLabel(t)}</option>}
                              {typeOpts.map((o) => <option key={o.id} value={o.id}>{typeLabel(o)}</option>)}
                            </select>
                            <input
                              inputMode="decimal"
                              style={{ width: 80 }}
                              defaultValue={part.grams || ''}
                              placeholder="g"
                              onBlur={(e) => setParts(name, parts.map((x, j) => (j === pi ? { ...x, grams: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 } : x)))}
                              aria-label={`${name} 필라멘트 g`}
                            />
                            <span>g</span>
                            <button type="button" className="btn btn-danger-ghost source-mgr-btn" onClick={() => setParts(name, parts.filter((_, j) => j !== pi))}>×</button>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        className="btn btn-ghost source-mgr-btn"
                        onClick={() => setParts(name, [...parts, { typeId: typeOpts[0]?.id || 'default', grams: 0 }])}
                      >
                        + 재질 추가
                      </button>
                    </>
                  );
                })()}
              </div>
              {isColorEdit && (
                <div className="product-color-edit-row">
                  <ColorSwatches
                    value={color}
                    onPick={(c) => setProductColor(name, c)}
                    label={`${name} 색상`}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="product-manager-add-block">
        <div className="source-manager-add">
          <input
            className="source-custom-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addProduct();
              }
            }}
            placeholder="새 제품 이름"
            aria-label="새 제품 이름"
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={addProduct}
            disabled={!draft.trim()}
          >
            추가
          </button>
        </div>
        <ColorSwatches
          value={draftColor}
          onPick={setDraftColor}
          label="새 제품 색상"
        />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={resetDefaults}>
          기본값 복원
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
