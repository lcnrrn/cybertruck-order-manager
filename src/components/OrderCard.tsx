import type { Order, OrderStatus } from '../types';
import { STATUS_OPTIONS } from '../types';
import { SMS_TEMPLATES, buildSmsLink, formatPhoneDisplay } from '../sms';

interface Props {
  order: Order;
  onEdit: (order: Order) => void;
  onDelete: (id: string) => void;
  onStatus: (id: string, status: OrderStatus) => void;
  onCopy: (order: Order) => void;
  onTogglePriority: (id: string) => void;
}

export function OrderCard({
  order,
  onEdit,
  onDelete,
  onStatus,
  onCopy,
  onTogglePriority,
}: Props) {
  const phoneOk = order.phone.replace(/\D/g, '').length >= 10;

  return (
    <article className={`order-card ${order.priority ? 'priority' : ''}`}>
      <header className="order-card-header">
        <div className="order-title-row">
          <h2 className="order-name">{order.name}</h2>
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
          <span className="order-group order-source-badge" title="주문 경로">
            {order.group}
          </span>
        ) : null}
      </header>

      <div className="order-body">
        <p className="order-items">{order.items || '주문 내용 없음'}</p>
        <p className="order-address">{order.address || '주소 없음'}</p>
        <p className="order-phone">{formatPhoneDisplay(order.phone) || '연락처 없음'}</p>
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
        <button type="button" className="btn btn-primary" onClick={() => onCopy(order)}>
          주소·연락처 복사
        </button>
        {phoneOk ? (
          <div className="sms-group">
            <a className="btn btn-secondary" href={buildSmsLink(order.phone)}>
              문자
            </a>
            <a
              className="btn btn-ghost"
              href={buildSmsLink(order.phone, SMS_TEMPLATES.완료.body)}
            >
              완료안내
            </a>
            <a
              className="btn btn-ghost"
              href={buildSmsLink(order.phone, SMS_TEMPLATES.발송.body)}
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
