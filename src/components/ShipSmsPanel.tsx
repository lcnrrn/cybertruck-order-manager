import { useEffect, useMemo, useRef, useState } from 'react';
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

/** 진행 표시에 넣는 '최근' 송장 범위 (보낸 건은 이 기간 안에 송장 붙은 것만 셈) */
const RECENT_MS = 3 * 24 * 60 * 60 * 1000;

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
  const nextId = pending[0]?.sh.id;

  // 진행: 아직 안 보낸 건 + 최근 3일 안에 송장 붙고 보낸 건
  const progress = useMemo(() => {
    const now = Date.now();
    let total = 0;
    let sent = 0;
    for (const o of orders) {
      for (const sh of activeShipments(o)) {
        if (sh.postStatus !== 'registered' || !sh.trackingNumber) continue;
        if (sh.smsSent) {
          const at = sh.registeredAt || sh.smsSentAt || sh.updatedAt || 0;
          if (now - at > RECENT_MS) continue;
          sent += 1;
        }
        total += 1;
      }
    }
    return { total, sent };
  }, [orders]);

  const topRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(0);
  const markTimer = useRef<number | null>(null);
  const toTop = () => {
    topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setFlash(Date.now());
  };
  // 문자 앱에서 돌아오면: 맨 위로 + 다음 보낼 카드 강조
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') toTop();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (markTimer.current) window.clearTimeout(markTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(0), 2500);
    return () => window.clearTimeout(t);
  }, [flash]);

  /** 「문자 앱」 누르면 자동으로 보냄 처리 (문자 앱이 열린 뒤에 — 링크 이동을 막지 않게 잠깐 뒤) */
  const openedSms = (orderId: string, shipId: string) => {
    if (markTimer.current) window.clearTimeout(markTimer.current);
    markTimer.current = window.setTimeout(() => {
      markTimer.current = null;
      onToggleSent(orderId, shipId, true);
      toTop();
    }, 700);
  };

  const copyAll = () => {
    if (!pending.length) return;
    const text = pending.map((r) => `${r.order.name} ${formatPhoneDisplay(r.order.phone)}\n${r.body}`).join('\n\n');
    copyText(text, `${pending.length}건 전체 복사됨`);
  };

  return (
    <div className="sheet-body ship-sms" ref={topRef}>
      <h2 className="sheet-title">💬 발송 문자 보내기</h2>
      <p className="hint">송장이 등록됐는데 아직 발송안내 문자를 안 보낸 건이에요. 「📱 문자 앱」을 누르면 자동으로 「보냄」 처리돼서 목록에서 빠져요. 잘못 눌렀으면 「보낸 것도 보기」에서 체크를 풀면 돼요.</p>
      {progress.total > 0 ? (
        <div className="ship-sms-progress" aria-live="polite">
          <span>
            {progress.total}건 중 <b>{progress.sent}건</b> 보냄{pending.length ? ` · 남은 ${pending.length}건` : ' · 다 보냈어요 🎉'}
          </span>
          <i style={{ width: `${Math.round((progress.sent / progress.total) * 100)}%` }} aria-hidden />
        </div>
      ) : null}
      <div className="ship-sms-top">
        <button type="button" className="btn btn-primary" disabled={!pending.length} onClick={copyAll}>📋 전체 복사 ({pending.length}건)</button>
        <label className="ship-sms-showsent">
          <input type="checkbox" checked={showSent} onChange={(e) => setShowSent(e.target.checked)} /> 보낸 것도 보기
        </label>
      </div>
      {rows.length === 0 ? <p className="hint">보낼 문자가 없어요 🎉</p> : null}
      <ul className="ship-sms-list">
        {rows.map(({ order, sh, body }) => (
          <li key={sh.id} className={`ship-sms-item${sh.smsSent ? ' sent' : ''}${sh.id === nextId ? ' next' : ''}${sh.id === nextId && flash ? ' flash' : ''}`}>
            {sh.id === nextId ? <div className="ship-sms-nexttag">👉 다음 보낼 문자</div> : null}
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
              {order.phone ? <a className="btn btn-copy" href={smsHref(order.phone, body)} onClick={() => { if (!sh.smsSent) openedSms(order.id, sh.id); }}>📱 문자 앱</a> : null}
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
