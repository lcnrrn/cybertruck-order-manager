import { useState } from 'react';
import type { Order, OrderStatus } from '../types';
import { STATUS_OPTIONS } from '../types';
import { SMS_TEMPLATES, buildSmsLink, formatPhoneDisplay } from '../sms';

interface Props {
  orders: Order[];
  onEdit: (order: Order) => void;
  onDelete: (id: string) => void;
  onStatus: (id: string, status: OrderStatus) => void;
  copyText: (text: string, okMessage: string) => void;
  onTogglePriority: (id: string) => void;
}

export function OrderTable({
  orders,
  onEdit,
  onDelete,
  onStatus,
  copyText,
  onTogglePriority,
}: Props) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set());
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  function toggleItems(id: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleMenu(id: string) {
    setOpenMenu((prev) => (prev === id ? null : id));
  }

  return (
    <div className="order-table-wrap">
      {openMenu && (
        <button
          type="button"
          className="order-table-menu-backdrop"
          aria-label="메뉴 닫기"
          onClick={() => setOpenMenu(null)}
        />
      )}
      <table className="order-table">
        <thead>
          <tr>
            <th className="col-sticky col-group">경로</th>
            <th className="col-sticky-2 col-name">이름</th>
            <th className="col-items">주문 내용</th>
            <th className="col-address">주소</th>
            <th className="col-phone">연락처</th>
            <th className="col-status">상태</th>
            <th className="col-priority">★</th>
            <th className="col-actions">액션</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const phoneOk = order.phone.replace(/\D/g, '').length >= 10;
            const itemsExpanded = expandedItems.has(order.id);
            const itemsText = order.items || '—';
            const longItems = itemsText.length > 40 || itemsText.includes('\n');
            const menuOpen = openMenu === order.id;

            return (
              <tr
                key={order.id}
                className={order.priority ? 'row-priority' : undefined}
              >
                <td className="col-sticky col-group">
                  {order.group ? (
                    <span className="table-source-badge">{order.group}</span>
                  ) : (
                    <span className="table-muted">—</span>
                  )}
                </td>
                <td className="col-sticky-2 col-name">
                  <span className="table-name">{order.name}</span>
                </td>
                <td className="col-items">
                  <button
                    type="button"
                    className={`table-items ${itemsExpanded ? 'expanded' : ''} ${longItems ? 'expandable' : ''}`}
                    onClick={() => longItems && toggleItems(order.id)}
                    title={longItems ? (itemsExpanded ? '접기' : '펼치기') : undefined}
                  >
                    {itemsText}
                  </button>
                </td>
                <td className="col-address">
                  <span className="table-cell-text">{order.address || '—'}</span>
                </td>
                <td className="col-phone">
                  <span className="table-cell-text">
                    {formatPhoneDisplay(order.phone) || '—'}
                  </span>
                </td>
                <td className="col-status">
                  <select
                    className={`table-status-select status-${order.status}`}
                    value={order.status}
                    onChange={(e) =>
                      onStatus(order.id, e.target.value as OrderStatus)
                    }
                    aria-label={`${order.name} 상태`}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="col-priority">
                  <button
                    type="button"
                    className={`table-priority-btn ${order.priority ? 'on' : ''}`}
                    aria-label={order.priority ? '우선순위 해제' : '우선순위 설정'}
                    onClick={() => onTogglePriority(order.id)}
                  >
                    {order.priority ? '★' : '☆'}
                  </button>
                </td>
                <td className="col-actions">
                  <div className="table-actions">
                    <button
                      type="button"
                      className="table-action-btn"
                      title="이름 복사"
                      onClick={() => copyText(order.name, '이름 복사됨')}
                    >
                      이름
                    </button>
                    <button
                      type="button"
                      className="table-action-btn"
                      title="주소 복사"
                      onClick={() => copyText(order.address, '주소 복사됨')}
                    >
                      주소
                    </button>
                    <button
                      type="button"
                      className="table-action-btn"
                      title="연락처 복사"
                      onClick={() => copyText(order.phone, '연락처 복사됨')}
                    >
                      연락처
                    </button>
                    <button
                      type="button"
                      className="table-action-btn table-action-post"
                      title="우체국용 복사"
                      onClick={() =>
                        copyText(`${order.address}\n${order.phone}`, '복사됨')
                      }
                    >
                      우체국
                    </button>
                    <div className="table-overflow">
                      <button
                        type="button"
                        className="table-action-btn table-more-btn"
                        aria-expanded={menuOpen}
                        aria-haspopup="true"
                        onClick={() => toggleMenu(order.id)}
                      >
                        ···
                      </button>
                      {menuOpen && (
                        <div className="table-menu" role="menu">
                          {phoneOk ? (
                            <>
                              <a
                                className="table-menu-item"
                                role="menuitem"
                                href={buildSmsLink(order.phone)}
                                onClick={() => setOpenMenu(null)}
                              >
                                문자
                              </a>
                              <a
                                className="table-menu-item"
                                role="menuitem"
                                href={buildSmsLink(
                                  order.phone,
                                  SMS_TEMPLATES.완료.body,
                                )}
                                onClick={() => setOpenMenu(null)}
                              >
                                완료안내
                              </a>
                              <a
                                className="table-menu-item"
                                role="menuitem"
                                href={buildSmsLink(
                                  order.phone,
                                  SMS_TEMPLATES.발송.body,
                                )}
                                onClick={() => setOpenMenu(null)}
                              >
                                발송안내
                              </a>
                            </>
                          ) : (
                            <span className="table-menu-hint">SMS 불가</span>
                          )}
                          <button
                            type="button"
                            className="table-menu-item"
                            role="menuitem"
                            onClick={() => {
                              setOpenMenu(null);
                              onEdit(order);
                            }}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className="table-menu-item danger"
                            role="menuitem"
                            onClick={() => {
                              setOpenMenu(null);
                              if (
                                window.confirm(
                                  `「${order.name}」 주문을 삭제할까요?`,
                                )
                              ) {
                                onDelete(order.id);
                              }
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
