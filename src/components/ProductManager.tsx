import { SUSPICIOUS_GRAMS, SUSPICIOUS_MINUTES, formatDuration, loadProductionSettings, saveProductionSettings } from '../production';
import { ImagePlus, Layers, Plus, TriangleAlert, X } from 'lucide-react';
import { MAX_IMAGES_JSON, fileToThumb, imagesSize, renameProductImage, setProductImage, useProductImages } from '../productImages';
import { useState } from 'react';
import {
  DEFAULT_PRODUCTS,
  PRODUCT_COLOR_PALETTE,
  partsTotals,
  withPartTotals,
  type Product,
  type ProductPart,
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

export function ProductManager({ products, onChange: rawOnChange, onClose, filament, onOpenFilament }: Props) {
  // 구성품이 있으면 g·분·재질 비율을 구성품 합계로 맞춰서 저장
  const onChange = (list: Product[]) => rawOnChange(list.map(withPartTotals));
  const [prodSet, setProdSet] = useState(() => loadProductionSettings());
  const typeOpts = (filament?.types || []).filter((t) => !t.hidden);
  const images = useProductImages();
  const usedPct = Math.round((imagesSize(images) / MAX_IMAGES_JSON) * 100);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);

  async function pickPhoto(name: string, file: File | undefined) {
    if (!file) return;
    try {
      const thumb = await fileToThumb(file);
      if (!setProductImage(name, thumb)) {
        setPhotoMsg('사진 저장 공간이 꽉 찼어요 — 안 쓰는 제품 사진을 지워 주세요');
        return;
      }
      setPhotoMsg(`「${name}」 사진 저장됨 · 동기화하면 다른 기기와 주문 페이지에도 보여요`);
    } catch (e) {
      setPhotoMsg(e instanceof Error ? e.message : '사진을 저장하지 못했어요');
    }
  }

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

  function setComponents(name: string, parts: ProductPart[] | null) {
    onChange(
      products.map((p) => {
        if (p.name !== name) return p;
        const next = { ...p };
        if (parts && parts.length) next.parts = parts;
        else delete next.parts;
        return next;
      }),
    );
  }

  function numIn(raw: string): number {
    const n = Number(raw.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n >= 0 ? n : 0;
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
    renameProductImage(renaming, next);
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
      <p className="hint photo-hint">
        <ImagePlus size={14} /> 왼쪽 동그라미를 눌러 <b>제품 사진</b>을 넣을 수 있어요 (작은 썸네일로 줄여서 저장 · 사진 공간 {usedPct}% 사용)
      </p>
      {photoMsg ? <p className="photo-msg" role="status">{photoMsg}</p> : null}
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
              <span className="pm-photo-wrap">
                <label className="pm-photo" style={{ borderColor: color.border, background: color.bg }} title="사진 넣기">
                  {images[name] ? <img src={images[name]} alt={name} /> : <ImagePlus size={18} color={color.text} />}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      void pickPhoto(name, e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                {images[name] ? (
                  <button
                    type="button"
                    className="pm-photo-del"
                    aria-label={`${name} 사진 지우기`}
                    onClick={() => {
                      if (window.confirm(`「${name}」 사진을 지울까요?`)) setProductImage(name, null);
                    }}
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </span>
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
                {product.parts?.length ? (
                  <label>
                    <span>출력 시간(1세트)</span>
                    <input readOnly value={formatDuration(product.minutes || 0) + (partsTotals(product.parts).missingTime.length ? '+' : '')} aria-label={`${name} 1세트 출력 시간 (구성품 합계)`} />
                  </label>
                ) : (
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
                )}
              </div>
              {(() => {
                const parts = product.parts || [];
                if (!parts.length) {
                  if (name === '우체국 택배') return null;
                  return (
                    <button
                      type="button"
                      className="btn btn-ghost source-mgr-btn pm-split-btn"
                      onClick={() =>
                        setComponents(name, [{ name: `${name} 조각`, qty: 1, grams: product.grams || 0, minutes: product.minutes || 0 }])
                      }
                    >
                      <Layers size={14} /> 구성품으로 나누기 (세트 제품)
                    </button>
                  );
                }
                const t = partsTotals(parts);
                const upd = (pi: number, patch: Partial<ProductPart>) => setComponents(name, parts.map((x, j) => (j === pi ? { ...x, ...patch } : x)));
                return (
                  <div className="pm-parts">
                    <div className="pm-parts-head">
                      <span><Layers size={14} /> 구성품 <small>(1세트에 들어가는 것)</small></span>
                      <b className="pm-parts-total">
                        1세트 {Math.round(t.grams).toLocaleString('ko-KR')}g · {formatDuration(t.minutes)}{t.missingTime.length ? '+' : ''}
                      </b>
                    </div>
                    {parts.map((pt, pi) => (
                      <div className={`pm-part ${pt.minutes > 0 ? '' : 'no-time'}`} key={`${pi}-${pt.name}-${pt.qty}-${pt.grams}-${pt.minutes}`}>
                        <div className="pm-part-top">
                          <input
                            className="pm-part-name"
                            defaultValue={pt.name}
                            aria-label={`${name} 구성품 ${pi + 1} 이름`}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (!v || v === pt.name) {
                                e.target.value = pt.name;
                                return;
                              }
                              if (parts.some((x, j) => j !== pi && x.name === v)) {
                                window.alert('같은 이름의 구성품이 이미 있어요.');
                                e.target.value = pt.name;
                                return;
                              }
                              upd(pi, { name: v });
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-danger-ghost source-mgr-btn"
                            aria-label={`${pt.name} 구성품 빼기`}
                            onClick={() => {
                              if (window.confirm(`「${pt.name}」 구성품을 뺄까요?`)) setComponents(name, parts.filter((_, j) => j !== pi));
                            }}
                          >
                            ×
                          </button>
                        </div>
                        <div className="pm-part-nums">
                          <label>
                            <span>1세트에</span>
                            <span className="pm-unit-in"><input inputMode="numeric" defaultValue={pt.qty} onBlur={(e) => upd(pi, { qty: Math.max(1, Math.round(numIn(e.target.value)) || 1) })} aria-label={`${pt.name} 1세트 개수`} /><em>개</em></span>
                          </label>
                          <label>
                            <span>1개당</span>
                            <span className="pm-unit-in"><input inputMode="decimal" defaultValue={pt.grams || ''} placeholder="0" onBlur={(e) => upd(pi, { grams: numIn(e.target.value) })} aria-label={`${pt.name} 1개 g`} /><em>g</em></span>
                          </label>
                          <label>
                            <span>1개당</span>
                            <span className="pm-unit-in"><input inputMode="decimal" defaultValue={pt.minutes || ''} placeholder="시간 미입력" onBlur={(e) => upd(pi, { minutes: numIn(e.target.value) })} aria-label={`${pt.name} 1개 출력 시간(분)`} /><em>분</em></span>
                          </label>
                        </div>
                        <div className="pm-part-sum">
                          = {Math.round(pt.qty * pt.grams).toLocaleString('ko-KR')}g · {pt.minutes > 0 ? formatDuration(pt.qty * pt.minutes) : <em className="warn-text">시간 미입력</em>}
                        </div>
                      </div>
                    ))}
                    <div className="pm-parts-actions">
                      <button
                        type="button"
                        className="btn btn-ghost source-mgr-btn"
                        onClick={() => {
                          let n = parts.length + 1;
                          while (parts.some((x) => x.name === `구성품 ${n}`)) n += 1;
                          setComponents(name, [...parts, { name: `구성품 ${n}`, qty: 1, grams: 0, minutes: 0 }]);
                        }}
                      >
                        <Plus size={14} /> 구성품 추가
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost source-mgr-btn"
                        onClick={() => {
                          if (window.confirm('구성품을 모두 없애고 1개 단위 제품으로 되돌릴까요? (지금 g·분 합계는 그대로 남아요)')) setComponents(name, null);
                        }}
                      >
                        구성품 없애기
                      </button>
                    </div>
                    {t.missingTime.length ? <p className="hint warn-text">시간 미입력: {t.missingTime.join(', ')} — 슬라이서에서 1개 출력 시간(분)을 확인해서 넣어줘</p> : null}
                    <p className="hint">숫자는 칸을 벗어나면 저장돼요. 주문 카드·출력 큐에서 구성품마다 따로 체크하고, 모두 다 차면 세트 완성. 구성품 이름을 바꾸면 이미 체크한 개수는 0부터 다시 세요.</p>
                  </div>
                );
              })()}
              {!product.parts?.length && ((product.grams || 0) > SUSPICIOUS_GRAMS || (product.minutes || 0) > SUSPICIOUS_MINUTES) ? (
                <p className="pm-outlier">
                  <TriangleAlert size={14} />
                  1개당 {(product.grams || 0).toLocaleString('ko-KR')}g · {formatDuration(product.minutes || 0)} — 다른 제품보다 훨씬 커요. 세트 전체 값이면 그대로 두고, 1개 값이 아니면 고쳐 주세요.
                </p>
              ) : null}
              <div className="fil-parts">
                <span className="hint">필라멘트 ({product.parts?.length ? '1세트 · 구성품 합계로 자동' : '1개당'}){typeOpts.length <= 1 && onOpenFilament ? ' — ' : ''}
                  {typeOpts.length <= 1 && onOpenFilament && (
                    <button type="button" className="btn-link" onClick={onOpenFilament}>재질·색상 종류 추가하기</button>
                  )}
                </span>
                {(() => {
                  const parts = productParts(product, true);
                  const unused = typeOpts.filter((o) => !parts.some((x) => x.typeId === o.id));
                  return (
                    <>
                      {parts.map((part, pi) => {
                        const t = filament?.types.find((x) => x.id === part.typeId);
                        return (
                          <div className="fil-row" key={`${pi}-${part.typeId}-${part.grams}`}>
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
                              readOnly={!!product.parts?.length && parts.length === 1}
                              title={product.parts?.length ? '구성품 합계로 자동 계산 (재질 여러 개면 비율)' : undefined}
                              placeholder="g"
                              onBlur={(e) => setParts(name, parts.map((x, j) => (j === pi ? { ...x, grams: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 } : x)))}
                              aria-label={`${name} 필라멘트 g`}
                            />
                            <span>g</span>
                            <button type="button" className="btn btn-danger-ghost source-mgr-btn" onClick={() => setParts(name, parts.filter((_, j) => j !== pi))}>×</button>
                          </div>
                        );
                      })}
                      {unused.length > 0 ? (
                        <button
                          type="button"
                          className="btn btn-ghost source-mgr-btn"
                          onClick={() => setParts(name, [...parts, { typeId: unused[0].id, grams: 0 }])}
                        >
                          + 재질 추가
                        </button>
                      ) : (
                        <span className="hint">
                          {typeOpts.length === 0 ? '필라멘트 종류가 없어요. 「필라멘트」에서 먼저 추가해 주세요.' : '등록된 필라멘트 종류를 모두 넣었어요. 더 넣으려면 「필라멘트」에서 종류를 추가해 주세요.'}
                        </span>
                      )}
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
