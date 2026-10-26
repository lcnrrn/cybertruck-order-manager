import { useMemo, useState } from 'react';
import type { Order, Shipment } from '../types';
import { shipmentLabel } from '../shipments';
import { formatWon } from '../production';
import { createEpostRequest, isBusy, isWeekend, modeLabel, nextWeekday, type EpostMode, type EpostRequest } from '../epost';

const PER_PARCEL = 4000; // 3kg·80cm 창구 접수 예상 요금(원/건)

function personName(n: string): string {
  return (n || '').trim().split(/[\s(/,]+/)[0] || n;
}

function fmtDate(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  orders: Order[];
  request: EpostRequest | null;
  onRequest: (r: EpostRequest) => void;
  onCancelShip: (orderId: string, shipId: string) => void;
  onClose: () => void;
}

export function EpostPanel({ orders, request, onRequest, onCancelShip, onClose }: Props) {
  const [confirm, setConfirm] = useState<EpostMode | null>(null);
  const [pickupDate, setPickupDate] = useState(() => nextWeekday());
  const minDate = nextWeekday();
  const dateBad = !pickupDate || isWeekend(pickupDate) || pickupDate < minDate;
  const pending = useMemo(() => {
    const out: { o: Order; s: Shipment }[] = [];
    for (const o of orders) for (const s of o.shipments || []) if (s.postStatus === 'requested') out.push({ o, s });
    return out.sort((a, b) => a.s.requestedAt - b.s.requestedAt);
  }, [orders]);
  const history = useMemo(() => {
    const m = new Map<string, { receiptNo: string; at: number; rows: { o: Order; s: Shipment }[] }>();
    for (const o of orders)
      for (const s of o.shipments || []) {
        if (s.postStatus !== 'registered') continue;
        const k = s.receiptNo || '(접수번호 없음)';
        const g = m.get(k) || { receiptNo: k, at: 0, rows: [] };
        g.at = Math.max(g.at, s.registeredAt || s.updatedAt);
        g.rows.push({ o, s });
        m.set(k, g);
      }
    return [...m.values()].sort((a, b) => b.at - a.at);
  }, [orders]);
  const busy = isBusy(request);

  const groups = (['counter', 'visit'] as const).map((m) => ({ m, rows: pending.filter((p) => (p.s.mode === 'visit' ? 'visit' : 'counter') === m) }));
  const submit = (m: EpostMode) => {
    setConfirm(null);
    const rows = groups.find((g) => g.m === m)!.rows;
    onRequest(createEpostRequest(rows.map((p) => p.s.id), Date.now(), m, m === 'visit' ? pickupDate : undefined));
  };

  return (
    <div className="sheet-body epost">
      <h2 className="sheet-title">📮 우체국 접수</h2>

      {request && (
        <div className={`epost-status st-${request.status}`}>
          {request.status === 'pending' && <b>⏳ 접수 대기 중 (15분 안에 처리) · {modeLabel(request)}</b>}
          {request.status === 'running' && <b>🔄 접수 중… · {modeLabel(request)}</b>}
          {request.status === 'done' && (
            <b>
              ✅ {modeLabel(request)} 완료 · 접수번호 {request.receiptNo || '-'} · {request.count ?? request.shipmentIds.length}건
              {typeof request.amount === 'number' ? ` · 예상 ${formatWon(request.amount)}` : ''}
            </b>
          )}
          {request.status === 'error' && (
            <>
              <b>⚠️ {request.message || '접수 실패'}</b>
              <button type="button" className="btn btn-secondary btn-compact" disabled={!groups.find((g) => g.m === (request.mode || 'counter'))!.rows.length} onClick={() => setConfirm(request.mode || 'counter')}>다시 요청</button>
            </>
          )}
          <small>요청 {fmtDate(request.requestedAt)} {new Date(request.requestedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</small>
        </div>
      )}

      {pending.length === 0 && (
        <>
          <h3 className="section-title">전송 대기 <span className="section-sub">0건</span></h3>
          <p className="empty-hint">제작 체크에서 「🏤 창구 접수」나 「🚚 방문 접수」를 누르면 여기 모여요.</p>
        </>
      )}
      {groups.filter((g) => g.rows.length).map(({ m, rows }) => (
        <section key={m} className="epost-group">
          <h3 className="section-title">
            {m === 'visit' ? '🚚 방문 접수 (집 픽업)' : '🏤 창구 접수 (사전접수)'} <span className="section-sub">{rows.length}건</span>
          </h3>
          <ul className="epost-list">
            {rows.map(({ o, s }) => (
              <li key={s.id} className="epost-row">
                <div className="epost-main">
                  <b>{personName(o.name)} <span className="epost-no">{s.no}차</span> <span className={`mode-badge ${m}`}>{m === 'visit' ? '방문' : '창구'}</span></b>
                  <small>{o.phone}</small>
                  <small className="epost-addr">{o.address}</small>
                  <small className="epost-items">{shipmentLabel(s)}</small>
                </div>
                <button
                  type="button"
                  className="btn-icon epost-x"
                  aria-label="전송 취소"
                  disabled={busy && !!request?.shipmentIds.includes(s.id)}
                  onClick={() => {
                    if (window.confirm(`${personName(o.name)} ${s.no}차 전송을 취소할까?`)) onCancelShip(o.id, s.id);
                  }}
                >✕</button>
              </li>
            ))}
          </ul>
          {m === 'visit' && (
            <label className="epost-date">
              픽업 희망일 (평일)
              <input type="date" value={pickupDate} min={minDate} onChange={(e) => setPickupDate(e.target.value)} />
              {dateBad && <small className="epost-warn">내일 이후 평일로 골라줘</small>}
            </label>
          )}
          <button
            type="button"
            className={`btn btn-primary epost-go${m === 'visit' ? ' visit' : ''}`}
            disabled={busy || (m === 'visit' && dateBad)}
            onClick={() => setConfirm(m)}
          >
            {busy ? (request?.status === 'running' ? '다른 접수 처리 중…' : '접수 대기 중… (끝나면 요청 가능)') : `${m === 'visit' ? '방문' : '창구'} 접수 요청 (${rows.length}건)`}
          </button>
          {confirm === m && (
            <div className="epost-confirm" role="alertdialog">
              <p><b>{rows.length}건</b>을 {modeLabel({ mode: m, pickupDate })}으로 요청할까?</p>
              <p className="empty-hint">예상 {formatWon(rows.length * PER_PARCEL)}{m === 'visit' ? ' · 방문 접수는 요금이 더 나올 수 있음' : ' · 창구에서 결제'}</p>
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>취소</button>
                <button type="button" className="btn btn-primary" disabled={m === 'visit' && dateBad} onClick={() => submit(m)}>접수 요청</button>
              </div>
            </div>
          )}
        </section>
      ))}

      <h3 className="section-title">접수 내역</h3>
      {history.length === 0 ? (
        <p className="empty-hint">아직 접수된 건이 없어요.</p>
      ) : (
        history.map((g) => (
          <details key={g.receiptNo} className="epost-hist">
            <summary>
              <b>{fmtDate(g.at)}</b> · {g.receiptNo} · {g.rows.length}건 · {formatWon(g.rows.length * PER_PARCEL)}
            </summary>
            <ul>
              {g.rows.map(({ o, s }) => (
                <li key={s.id}>{personName(o.name)} {s.no}차 · {shipmentLabel(s)}{s.trackingNumber ? ` · ${s.trackingNumber}` : ''}</li>
              ))}
            </ul>
          </details>
        ))
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
