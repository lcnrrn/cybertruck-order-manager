import { useMemo, useState } from 'react';
import type { Order } from '../types';
import {
  matchTrackingToOrders,
  parseTrackingText,
  type TrackingMatch,
} from '../parseTracking';

interface Props {
  orders: Order[];
  onApply: (updates: { id: string; trackingNumber: string }[]) => number;
  onClose: () => void;
}

export function TrackingModal({ orders, onApply, onClose }: Props) {
  const [text, setText] = useState('');

  const matches: TrackingMatch[] = useMemo(
    () => matchTrackingToOrders(parseTrackingText(text), orders),
    [text, orders],
  );

  const applied = matches.filter((m) => m.order);

  function handleApply() {
    if (applied.length === 0) {
      window.alert('매칭된 주문이 없습니다. 이름과 송장번호가 보이게 붙여넣어 주세요.');
      return;
    }
    const n = onApply(
      applied.map((m) => ({
        id: m.order!.id,
        trackingNumber: m.parsed.trackingNumber,
      })),
    );
    window.alert(`${n}건 송장번호를 저장했습니다.`);
    onClose();
  }

  return (
    <div className="sheet-body import-modal">
      <h2 className="sheet-title">송장번호 등록</h2>
      <p className="hint">
        우체국 접수증·목록을 캡처한 뒤 텍스트를 붙여넣거나, 이름과 송장번호를
        한 줄에 넣으세요.
        <br />
        예: <code>김민수 1234567890123</code>
        <br />
        이름이 주문 목록과 같거나 포함되면 자동으로 연결됩니다. 「발송안내」를
        누르면 문자에 송장번호가 들어갑니다.
      </p>
      <textarea
        className="import-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={'정하늘 6869415411384\n김민수 1234567890123'}
      />
      {matches.length > 0 && (
        <div className="import-preview">
          <strong>
            인식 {matches.length}건 · 매칭 {applied.length}건
          </strong>
          <ul>
            {matches.slice(0, 12).map((m, i) => (
              <li key={i}>
                {m.parsed.name || '(이름없음)'} · {m.parsed.trackingNumber}
                {m.order
                  ? ` → ${m.order.name}`
                  : ' → 매칭 실패 (주문 이름을 확인)'}
              </li>
            ))}
            {matches.length > 12 && <li>…외 {matches.length - 12}건</li>}
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
          disabled={applied.length === 0}
        >
          {applied.length > 0 ? `${applied.length}건 저장` : '저장'}
        </button>
      </div>
    </div>
  );
}
