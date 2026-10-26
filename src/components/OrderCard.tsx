import { useState } from 'react';
import { activeShipments, shipmentLabel, shippableItems } from '../shipments';
import { formatOrderDate, relativeLabel } from '../dates';
import type { Order, OrderStatus } from '../types';
import { STATUS_OPTIONS } from '../types';
import type { Product } from '../products';
import { ProductBadges } from './ProductBadges';
import { buildReceiptSmsBody, buildCompleteSmsBody, buildShippingSmsBody, buildSmsLink, formatPhoneDisplay } from '../sms';
import { PayBadge } from './PayBadge';
import { formatWon, orderAmount, orderItemProgress, progressTotals } from '../production';

interface Props {
  order: Order;
  products: Product[];
  onEdit: (order: Order) => void;
  onDelete: (id: string) => void;
  onStatus: (id: string, status: OrderStatus) => void;
  copyText: (text: string, okMessage: string) => void;
  onTogglePriority: (id: string) => void;
  onTogglePaid: (id: string) => void;
  onItemDone: (id: string, key: string, count: number) => void;
  onShip: (id: string, items: Record<string, number>, mode?: 'counter' | 'visit') => void;
  onCancelShip: (id: string, shipId: string) => void;
}

export function OrderCard({
  order,
  products,
  onEdit,
  onDelete,
  onStatus,
  copyText,
  onTogglePriority,
  onTogglePaid,
  onItemDone,
  onShip,
  onCancelShip,
}: Props) {
  const phoneOk = order.phone.replace(/\D/g, '').length >= 10;
  const active = order.status === '대기' || order.status === '제작중';
  const createdTs = order.createdAt || order.updatedAt;
  const progress = active ? orderItemProgress(order, products.map((p) => p.name)) : [];
  const totals = progressTotals(progress);
  const allDone = totals.total > 0 && totals.done >= totals.total;
  const ships = activeShipments(order);
  const avail = shippableItems(order, progress);
  const availKeys = Object.keys(avail);
  const [pick, setPick] = useState<Record<string, number> | null>(null);
  const [pickMode, setPickMode] = useState<'counter' | 'visit'>('counter');
  const pickTotal = pick ? Object.values(pick).reduce((a, b) => a + b, 0) : 0;
  const nextNo = ships.reduce((m, x) => Math.max(m, x.no), 0) + 1;



  return (
    <article id={`order-${order.id}`} className={`order-card ${order.priority ? 'priority' : ''}`}>
      <header className="order-card-header">
        <div className="order-title-row">
          <h2 className="order-name">{order.name}</h2>
          <span className="order-date" title={new Date(createdTs).toLocaleString('ko-KR')}>
            {formatOrderDate(createdTs)} 접수
            {active ? <em> · {relativeLabel(createdTs)}</em> : null}
          </span>
          <button
            type="button"
            className={`btn-icon priority-btn ${order.priority ? 'on' : ''}`}
            aria-label={order.priority ? '우선순위 해제' : '우선순위 설정'}
            onClick={() => onTogglePriority(order.id)}
          >
            {order.priority ? '★' : '☆'}
          </button>
        </div>
      </header>

      <div className="order-body">
        <div className="order-items"><ProductBadges items={order.items} products={products} prices={order.prices} /></div>
        {progress.length ? (
          <div className="make-list" aria-label="품목별 제작 체크">
            <div className="make-head">
              <span>제작 체크</span>
              <span className={`make-count ${allDone ? 'done' : ''}`}>
                제작 {totals.done}/{totals.total}
              </span>
            </div>
            {progress.map((it) => {
              const full = it.done >= it.qty;
              return (
                <div key={it.key} className={`make-item ${full ? 'done' : ''}`}>
                  <button
                    type="button"
                    className="make-tap"
                    onClick={() => onItemDone(order.id, it.key, full ? 0 : it.done + 1)}
                    aria-label={`${it.label} 제작 ${it.done}/${it.qty}`}
                  >
                    <span className="make-box">{full ? '✓' : it.done > 0 ? it.done : ''}</span>
                    <span className="make-label">{it.label}</span>
                    <span className="make-qty">{it.qty > 1 ? `${it.done}/${it.qty}` : full ? '완료' : ''}</span>
                  </button>
                  {it.done > 0 && it.qty > 1 ? (
                    <button
                      type="button"
                      className="btn-icon make-minus"
                      aria-label="1개 빼기"
                      onClick={() => onItemDone(order.id, it.key, it.done - 1)}
                    >
                      −
                    </button>
                  ) : null}
                </div>
              );
            })}
            {pick ? (
              <div className="ship-picker" role="group" aria-label="우체국 전송 품목 선택">
                <div className="ship-picker-head">{pickMode === 'visit' ? '🚚 방문' : '🏤 창구'} 접수 · {nextNo}차 품목</div>
                {availKeys.map((k) => (
                  <div key={k} className="ship-pick-row">
                    <span className="ship-pick-name">{k}</span>
                    <span className="qty-stepper">
                      <button type="button" className="btn-icon" aria-label="1개 빼기" disabled={!pick[k]}
                        onClick={() => setPick({ ...pick, [k]: Math.max(0, (pick[k] || 0) - 1) })}>−</button>
                      <b>{pick[k] || 0}</b>
                      <button type="button" className="btn-icon" aria-label="1개 더하기" disabled={(pick[k] || 0) >= avail[k]}
                        onClick={() => setPick({ ...pick, [k]: Math.min(avail[k], (pick[k] || 0) + 1) })}>＋</button>
                    </span>
                  </div>
                ))}
                <div className="ship-picker-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setPick(null)}>취소</button>
                  <button type="button" className={`btn ship-btn${pickMode === 'visit' ? ' visit' : ''}`} disabled={pickTotal === 0}
                    onClick={() => { onShip(order.id, pick, pickMode); setPick(null); }}>
                    {pickTotal}개 전송 요청
                  </button>
                </div>
              </div>
            ) : (
              <div className="ship-btns make-complete">
                {(['counter', 'visit'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`btn ship-btn${m === 'visit' ? ' visit' : ''}`}
                    disabled={availKeys.length === 0}
                    title={availKeys.length === 0 ? '제작 체크된 품목 중 아직 안 보낸 게 없어요' : undefined}
                    onClick={() => { setPickMode(m); setPick({ ...avail }); }}
                  >
                    {m === 'visit' ? '🚚 방문 접수' : '🏤 창구 접수'}{availKeys.length ? ` (${Object.values(avail).reduce((x, y) => x + y, 0)}개)` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {ships.length ? (
          <ul className="ship-list" aria-label="우체국 발송">
            {ships.map((sh) => (
              <li key={sh.id} className={`ship-line ${sh.postStatus}`}>
                <span className="ship-no">{sh.no}차</span>
                <span className={`mode-badge ${sh.mode === 'visit' ? 'visit' : 'counter'}`}>{sh.mode === 'visit' ? '방문' : '창구'}</span>
                <span className="ship-items">{shipmentLabel(sh)}</span>
                <span className="ship-state">
                  {sh.postStatus === 'registered'
                    ? `✅ 접수 완료${sh.trackingNumber ? ` · 송장 ${sh.trackingNumber}` : sh.receiptNo ? ` · ${sh.receiptNo}` : ''}`
                    : '📮 전송 대기'}
                  {sh.delivered ? <span className="ship-flag">🏠 배달완료{sh.deliveredAt ? ` ${new Date(sh.deliveredAt).getMonth() + 1}/${new Date(sh.deliveredAt).getDate()}` : ''}</span> : null}
                  {sh.trackingNumber ? <span className="ship-flag">{sh.smsSent ? '💬 문자 보냄' : '💬 문자 전'}</span> : null}
                </span>
                {sh.postStatus === 'requested' ? (
                  <button type="button" className="btn-icon ship-cancel" aria-label={`${sh.no}차 전송 취소`}
                    onClick={() => { if (window.confirm(`${sh.no}차 우체국 전송 요청을 취소할까?`)) onCancelShip(order.id, sh.id); }}>✕</button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="order-address">{order.address || '주소 없음'}</p>
        <PayBadge order={order} products={products} onToggle={onTogglePaid} showAmount />
        <p className="order-phone">{formatPhoneDisplay(order.phone) || '연락처 없음'}</p>
        {order.trackingNumber ? (
          <p className="order-tracking" title="등기번호">
            송장 <code>{order.trackingNumber}</code>
          </p>
        ) : null}
      </div>

      <div className="copy-row" role="group" aria-label="복사">
        <button
          type="button"
          className="btn btn-copy"
          onClick={() => copyText(order.name, '이름 복사됨')}
        >
          이름
        </button>
        <button
          type="button"
          className="btn btn-copy"
          onClick={() => copyText(order.address, '주소 복사됨')}
        >
          주소
        </button>
        <button
          type="button"
          className="btn btn-copy"
          onClick={() => copyText(order.phone, '연락처 복사됨')}
        >
          연락처
        </button>
        <button
          type="button"
          className="btn btn-copy btn-copy-post"
          onClick={() => copyText(`${order.address}\n${order.phone}`, '복사됨')}
        >
          우체국용
        </button>
      </div>

      <div className="status-row" role="group" aria-label="상태 변경">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className={`status-btn status-${s} ${order.status === s ? 'active' : ''}`}
            onClick={() => onStatus(order.id, s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="action-row">
        {phoneOk ? (
          <div className="sms-group">
            <a className="btn btn-secondary" href={buildSmsLink(order.phone)}>
              문자
            </a>
            <a
              className={`btn ${order.status === '대기' ? 'btn-receipt' : 'btn-ghost'}`}
              href={buildSmsLink(order.phone, buildReceiptSmsBody(order, formatWon(orderAmount(order, products))))}
            >
              접수문자
            </a>
            <a
              className="btn btn-ghost"
              href={buildSmsLink(order.phone, buildCompleteSmsBody())}
            >
              완료안내
            </a>
            <a
              className="btn btn-ghost"
              href={buildSmsLink(order.phone, buildShippingSmsBody(order.trackingNumber))}
            >
              발송안내
            </a>
          </div>
        ) : (
          <span className="hint">연락처 없음 · SMS 불가</span>
        )}
      </div>

      <div className="meta-row">
        <button type="button" className="btn btn-ghost" onClick={() => onEdit(order)}>
          수정
        </button>
        <button
          type="button"
          className="btn btn-danger-ghost"
          onClick={() => {
            if (window.confirm(`「${order.name}」 주문을 삭제할까요?`)) {
              onDelete(order.id);
            }
          }}
        >
          삭제
        </button>
      </div>
    </article>
  );
}
