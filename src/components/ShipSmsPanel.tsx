import { useMemo, useState } from 'react';
import type { Order, Shipment } from '../types';
import { activeShipments, shipmentLabel } from '../shipments';
import { buildShippingSmsBody, formatPhoneDisplay } from '../sms';

interface Props {
  orders: Order[];
  copyText: (text: string, okMessage: string) => void;
  onToggleSent: (orderId: string, shipId: string, sent: boolean) => void;
  onClose: () => void;
}

interface Row {
  order: Order;
  sh: Shipment;
  body: string;
}

const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;

/** iPhone: sms:번호&body= , 그 외: sms:번호?body= */
function smsHref(phone: string, body: string): string {
  const d = phone.replace(/[^\d+]/g, '');
  return `sms:${d}${isIOS ? '&' : '?'}body=${encodeURIComponent(body)}`;
}

/** 송장 등록된 발송건의 발송안내 문자 모아보기 · 보냄 체크 */
export function ShipSmsPanel({ orders, copyText, onToggleSent, onClose }: Props) {
  const [showSent, setShowSent] = useState(false);
  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const o of orders) {
      for (const sh of activeShipments(o)) {
        if (sh.postStatus !== 'registered' || !sh.trackingNumber) continue;
        if (!showSent && sh.smsSent) continue;
        out.push({ order: o, sh, body: buildShippingSmsBody(sh.trackingNumber) });
      }
    }
    return out.sort((a, b) => Number(!!a.sh.smsSent) - Number(!!b.sh.smsSent) || (b.sh.registeredAt || 0) - (a.sh.registeredAt || 0));
  }, [orders, showSent]);
  const pending = rows.filter((r) => !r.sh.smsSent);

  const copyAll = () => {
    if (!pending.length) return;
    const text = pending.map((r) => `${r.order.name} ${formatPhoneDisplay(r.order.phone)}\n${r.body}`).join('\n\n');
    copyText(text, `${pending.length}건 전체 복사됨`);
  };

  return (
    <div className="sheet-body ship-sms">
      <h2 className="sheet-title">💬 발송 문자 보내기</h2>
      <p className="hint">송장이 등록됐는데 아직 발송안내 문자를 안 보낸 건이에요. 보낸 뒤 「보냄」을 체크하면 목록에서 빠져요.</p>
      <div className="ship-sms-top">
        <button type="button" className="btn btn-primary" disabled={!pending.length} onClick={copyAll}>📋 전체 복사 ({pending.length}건)</button>
        <label className="ship-sms-showsent">
          <input type="checkbox" checked={showSent} onChange={(e) => setShowSent(e.target.checked)} /> 보낸 것도 보기
        </label>
      </div>
      {rows.length === 0 ? <p className="hint">보낼 문자가 없어요 🎉</p> : null}
      <ul className="ship-sms-list">
        {rows.map(({ order, sh, body }) => (
          <li key={sh.id} className={`ship-sms-item${sh.smsSent ? ' sent' : ''}`}>
            <div className="ship-sms-head">
              <b>{order.name}</b>
              <span>{formatPhoneDisplay(order.phone) || '연락처 없음'}</span>
              <span className="ship-sms-no">{sh.no}차 · {sh.trackingNumber}{sh.delivered ? ' · 배달완료' : ''}</span>
            </div>
            <div className="ship-sms-items">{shipmentLabel(sh)}</div>
            <pre className="ship-sms-body">{body}</pre>
            <div className="ship-sms-actions">
              <button type="button" className="btn btn-copy" disabled={!order.phone} onClick={() => copyText(order.phone.replace(/\D/g, ''), '번호 복사됨')}>번호 복사</button>
              <button type="button" className="btn btn-copy" onClick={() => copyText(body, '문자 복사됨')}>문자 복사</button>
              {order.phone ? <a className="btn btn-copy" href={smsHref(order.phone, body)}>📱 문자 앱</a> : null}
              <label className="ship-sms-check">
                <input type="checkbox" checked={!!sh.smsSent} onChange={(e) => onToggleSent(order.id, sh.id, e.target.checked)} /> 보냄
              </label>
            </div>
          </li>
        ))}
      </ul>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
