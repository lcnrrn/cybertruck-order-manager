import { useMemo, useState } from 'react';
import type { Order } from '../types';
import {
  matchTrackingRows,
  parseTrackingReceipt,
  type TrackingMatchPreview,
} from '../parseTrackingReceipt';

interface Props {
  orders: Order[];
  onApply: (updates: { orderId: string; trackingNumber: string }[]) => void;
  onClose: () => void;
}

export function TrackingRegisterModal({ orders, onApply, onClose }: Props) {
  const [text, setText] = useState('');
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});

  const parsed = useMemo(() => parseTrackingReceipt(text), [text]);
  const basePreview = useMemo(
    () => matchTrackingRows(parsed, orders),
    [parsed, orders],
  );

  const preview: TrackingMatchPreview[] = useMemo(() => {
    return basePreview.map((row) => {
      const key = row.trackingNumber;
      if (!(key in overrides)) return row;
      const selected = overrides[key];
      if (!selected) {
        return { ...row, selectedOrderId: null };
      }
      return {
        ...row,
        kind: row.kind === 'unmatched' ? row.kind : row.kind,
        selectedOrderId: selected,
      };
    });
  }, [basePreview, overrides]);

  const counts = useMemo(() => {
    let matched = 0;
    let ambiguous = 0;
    let unmatched = 0;
    let ready = 0;
    for (const row of preview) {
      if (row.kind === 'matched') matched += 1;
      else if (row.kind === 'ambiguous') ambiguous += 1;
      else unmatched += 1;
      if (row.selectedOrderId) ready += 1;
    }
    return { matched, ambiguous, unmatched, ready };
  }, [preview]);

  function setSelection(trackingNumber: string, orderId: string | null) {
    setOverrides((prev) => ({ ...prev, [trackingNumber]: orderId }));
  }

  function handleApply() {
    const used = new Set<string>();
    const updates: { orderId: string; trackingNumber: string }[] = [];
    for (const row of preview) {
      if (!row.selectedOrderId) continue;
      if (used.has(row.selectedOrderId)) {
        window.alert(
          `같은 주문에 송장이 중복 배정되었습니다. 「${row.recipientHint || row.trackingNumber}」를 확인해 주세요.`,
        );
        return;
      }
      used.add(row.selectedOrderId);
      updates.push({
        orderId: row.selectedOrderId,
        trackingNumber: row.trackingNumber,
      });
    }
    if (updates.length === 0) {
      window.alert('적용할 매칭이 없습니다. 일치 항목을 선택해 주세요.');
      return;
    }
    onApply(updates);
  }

  return (
    <div className="sheet-body tracking-modal">
      <h2 className="sheet-title">송장 등록</h2>
      <p className="hint">
        우체국 모바일 영수증 텍스트를 붙여넣으면 등기번호와 수취인을 읽어
        주문에 연결합니다.
        <br />
        마스킹 이름(예: 임*욱)은 첫·끝 글자와 글자 수로 매칭합니다.
      </p>

      <label className="field">
        <span>영수증 붙여넣기</span>
        <textarea
          className="import-textarea"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOverrides({});
          }}
          rows={8}
          placeholder={
            '6892013747044  4,000  44429  임*욱\n소포 3000g/80cm 생활용품\n6892013747045  4,000  48751  최*훈'
          }
        />
      </label>

      {preview.length > 0 && (
        <div className="tracking-preview">
          <strong>
            미리보기 {preview.length}건 · 일치 {counts.matched} · 모호{' '}
            {counts.ambiguous} · 미매칭 {counts.unmatched}
          </strong>
          <ul className="tracking-preview-list">
            {preview.map((row) => {
              const selected =
                row.selectedOrderId &&
                orders.find((o) => o.id === row.selectedOrderId);
              return (
                <li
                  key={row.trackingNumber}
                  className={`tracking-preview-item kind-${row.kind}`}
                >
                  <div className="tracking-preview-top">
                    <code className="tracking-num">{row.trackingNumber}</code>
                    <span className="tracking-hint">
                      {row.recipientHint || '(이름 없음)'}
                    </span>
                    <span className={`tracking-badge badge-${row.kind}`}>
                      {row.kind === 'matched'
                        ? '일치'
                        : row.kind === 'ambiguous'
                          ? '모호'
                          : '미매칭'}
                    </span>
                  </div>

                  {row.kind === 'matched' && selected && (
                    <p className="tracking-match-line">
                      → {selected.name}
                      {selected.trackingNumber
                        ? ` (기존 ${selected.trackingNumber})`
                        : ''}
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => setSelection(row.trackingNumber, null)}
                      >
                        제외
                      </button>
                    </p>
                  )}

                  {row.kind === 'matched' && !row.selectedOrderId && (
                    <p className="tracking-match-line muted">
                      제외됨
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() =>
                          setSelection(
                            row.trackingNumber,
                            row.candidates[0]?.id ?? null,
                          )
                        }
                      >
                        다시 포함
                      </button>
                    </p>
                  )}

                  {(row.kind === 'ambiguous' || row.kind === 'unmatched') && (
                    <label className="tracking-pick field">
                      <span>주문 선택</span>
                      <select
                        value={row.selectedOrderId || ''}
                        onChange={(e) =>
                          setSelection(
                            row.trackingNumber,
                            e.target.value || null,
                          )
                        }
                      >
                        <option value="">— 선택 —</option>
                        {(row.kind === 'ambiguous'
                          ? row.candidates
                          : orders
                        ).map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                            {o.group ? ` · ${o.group}` : ''}
                            {o.trackingNumber ? ' · 송장있음' : ''}
                            {` · ${o.status}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          취소
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleApply}
          disabled={counts.ready === 0}
        >
          {counts.ready > 0 ? `${counts.ready}건 등록` : '등록'}
        </button>
      </div>
    </div>
  );
}
