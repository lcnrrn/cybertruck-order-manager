import { formatOrderDate, relativeLabel } from '../dates';
import type { Order, OrderStatus } from '../types';
import { STATUS_OPTIONS } from '../types';
import type { Product } from '../products';
import { ProductBadges } from './ProductBadges';
import { buildReceiptSmsBody, buildCompleteSmsBody, buildShippingSmsBody, buildSmsLink, formatPhoneDisplay } from '../sms';
import { getSourceColor } from '../sources';
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
}: Props) {
  const phoneOk = order.phone.replace(/\D/g, '').length >= 10;
  const active = order.status === '대기' || order.status === '제작중';
  const createdTs = order.createdAt || order.updatedAt;
  const progress = active ? orderItemProgress(order, products.map((p) => p.name)) : [];
  const totals = progressTotals(progress);
  const allDone = totals.total > 0 && totals.done >= totals.total;



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
        {order.group ? (
          <span
            className="order-group order-source-badge"
            title="주문 경로"
            style={{
              background: getSourceColor(order.group).bg,
              borderColor: getSourceColor(order.group).border,
              color: getSourceColor(order.group).text,
            }}
          >
            {order.group}
          </span>
        ) : null}
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
            {allDone ? (
              <button type="button" className="btn make-complete" onClick={() => onStatus(order.id, '완료')}>
                모두 제작됨 → 완료 처리
              </button>
            ) : null}
          </div>
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
