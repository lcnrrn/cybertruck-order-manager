import { useRef, useState } from 'react';
import type { Order, PeriodRange } from '../types';
import type { Product } from '../products';
import { applyBackupSettings, exportJsonBackup, exportOrdersXlsx, parseBackup } from '../backup';
import { orderTimestamp, resolvePeriodBounds } from '../period';

interface Props {
  orders: Order[];
  products: Product[];
  period: PeriodRange;
  onRestore: (orders: Order[]) => void;
  onToast: (m: string) => void;
  onClose: () => void;
}

export function BackupPanel({ orders, products, period, onRestore, onToast, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const bounds = resolvePeriodBounds(period);
  const periodOrders = bounds
    ? orders.filter((o) => {
        const t = orderTimestamp(o.createdAt, o.updatedAt);
        return t >= bounds[0] && t <= bounds[1];
      })
    : orders;

  async function xlsx(list: Order[], label: string) {
    setBusy(true);
    try {
      await exportOrdersXlsx(list, products, label);
      onToast(`엑셀 ${list.length}건 내보냄`);
    } catch (e) {
      onToast(`내보내기 실패: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function restore(file: File) {
    try {
      const b = parseBackup(await file.text());
      const when = b.exportedAt ? new Date(b.exportedAt).toLocaleString('ko-KR') : '알 수 없음';
      if (
        !window.confirm(
          `백업(${when})으로 복원할까요?\n주문 ${b.orders.length}건과 설정이 지금 내용을 대체합니다.\n(현재 주문 ${orders.length}건)`,
        )
      )
        return;
      onRestore(applyBackupSettings(b));
      onToast(`복원 완료: 주문 ${b.orders.length}건`);
      onClose();
    } catch (e) {
      onToast(`복원 실패: ${(e as Error).message}`);
    }
  }

  return (
    <div className="sheet-body backup-panel">
      <h2 className="sheet-title">💾 데이터 백업</h2>
      <section className="backup-sec">
        <h3>엑셀로 내보내기</h3>
        <p className="hint">이름·연락처·주소·주문내용·경로·상태·금액·입금·입금일·송장·등록일까지 모두 들어갑니다. 세금 신고용으로도 쓸 수 있어요.</p>
        <div className="backup-btns">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void xlsx(orders, '전체')}>
            전체 주문 ({orders.length}건)
          </button>
          {period.preset !== 'all' && (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void xlsx(periodOrders, '기간')}>
              선택한 기간만 ({periodOrders.length}건)
            </button>
          )}
        </div>
      </section>
      <section className="backup-sec">
        <h3>전체 백업 (JSON)</h3>
        <p className="hint">주문 + 제품·경로·문자·필라멘트·제작 설정까지 파일 하나로 저장합니다.</p>
        <div className="backup-btns">
          <button type="button" className="btn btn-secondary" onClick={() => { exportJsonBackup(orders); onToast('백업 파일 저장됨'); }}>
            백업 파일 저장
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            백업에서 복원…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void restore(f);
            }}
          />
        </div>
      </section>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
