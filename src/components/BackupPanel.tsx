import { useEffect, useRef, useState } from 'react';
import type { Order, PeriodRange } from '../types';
import type { Product } from '../products';
import { applyBackupSettings, downloadBackupFile, exportJsonBackup, exportLedgerXlsx, exportOrdersXlsx, ledgerMonths, parseBackup, type BackupFile } from '../backup';
import { getSnapshotBackup, listSnapshots, savePreRestoreSnapshot, type SnapMeta } from '../snapshots';
import { orderTimestamp, resolvePeriodBounds } from '../period';

interface Props {
  orders: Order[];
  products: Product[];
  period: PeriodRange;
  onRestore: (orders: Order[]) => void;
  onToast: (m: string) => void;
  onClose: () => void;
}

function when(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function BackupPanel({ orders, products, period, onRestore, onToast, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const months = ledgerMonths(orders);
  const [ledgerMonth, setLedgerMonth] = useState(() => months[0] || 'all');
  const [snaps, setSnaps] = useState<SnapMeta[]>([]);
  useEffect(() => {
    void listSnapshots().then(setSnaps);
  }, []);
  const bounds = resolvePeriodBounds(period);
  const periodOrders = bounds
    ? orders.filter((o) => {
        const t = orderTimestamp(o.createdAt, o.updatedAt);
        return t >= bounds[0] && t <= bounds[1];
      })
    : orders;

  async function run(job: () => Promise<string>) {
    setBusy(true);
    try {
      onToast(await job());
    } catch (e) {
      onToast(`내보내기 실패: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  /** 복원 직전 현재 상태를 이 기기에 따로 저장해 두고(되돌리기용) 복원 */
  async function applyRestore(b: BackupFile, label: string) {
    const stamp = b.exportedAt ? new Date(b.exportedAt).toLocaleString('ko-KR') : '알 수 없음';
    if (
      !window.confirm(
        `${label}(${stamp})으로 복원할까요?\n주문 ${b.orders.length}건과 설정이 지금 내용을 대체합니다.\n(현재 주문 ${orders.length}건)\n\n복원 직전 상태는 「자동 백업」에 따로 저장해 둬요.`,
      )
    )
      return;
    await savePreRestoreSnapshot(orders);
    onRestore(applyBackupSettings(b));
    onToast(`복원 완료: 주문 ${b.orders.length}건`);
    onClose();
  }

  async function restoreFile(file: File) {
    try {
      await applyRestore(parseBackup(await file.text()), '백업 파일');
    } catch (e) {
      onToast(`복원 실패: ${(e as Error).message}`);
    }
  }

  async function snapAction(id: string, mode: 'restore' | 'save') {
    const b = await getSnapshotBackup(id);
    if (!b) return onToast('이 백업을 읽지 못했어요');
    if (mode === 'save') {
      downloadBackupFile(b);
      onToast('백업 파일 저장됨');
    } else {
      await applyRestore(b, '자동 백업');
    }
  }

  return (
    <div className="sheet-body backup-panel">
      <h2 className="sheet-title">💾 데이터 백업 · 장부</h2>

      <section className="backup-sec">
        <h3>📒 장부 엑셀 (세무·정산용)</h3>
        <p className="hint">요약 · 월별 · 매출장부(공급가액/부가세 참고값) · 지출장부가 시트별로 들어가요. 부가세·종합소득세 신고 준비에 쓰세요.</p>
        <div className="backup-btns">
          <select className="ledger-select" value={ledgerMonth} onChange={(e) => setLedgerMonth(e.target.value)} aria-label="장부 기간">
            <option value="all">전체 기간</option>
            {months.map((m) => <option key={m} value={m}>{m.replace('-', '년 ')}월</option>)}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !orders.length}
            onClick={() => void run(async () => { const r = await exportLedgerXlsx(orders, products, ledgerMonth); return `장부 저장됨 · 주문 ${r.orders}건 · 지출 ${r.expenses}건`; })}
          >
            장부 내려받기
          </button>
        </div>
      </section>

      <section className="backup-sec">
        <h3>주문 전체 엑셀</h3>
        <p className="hint">이름·연락처·주소·주문내용·상태·금액·입금·송장까지 모두 들어가요.</p>
        <div className="backup-btns">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void run(async () => { await exportOrdersXlsx(orders, products, '전체'); return `엑셀 ${orders.length}건 내보냄`; })}>
            전체 주문 ({orders.length}건)
          </button>
          {period.preset !== 'all' && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(async () => { await exportOrdersXlsx(periodOrders, products, '기간'); return `엑셀 ${periodOrders.length}건 내보냄`; })}>
              선택한 기간만 ({periodOrders.length}건)
            </button>
          )}
        </div>
      </section>

      <section className="backup-sec">
        <h3>전체 백업 파일 (JSON)</h3>
        <p className="hint">주문 + 제품·문자·필라멘트·제작·지출 설정까지 파일 하나로 저장해요.</p>
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
              if (f) void restoreFile(f);
            }}
          />
        </div>
      </section>

      <section className="backup-sec">
        <h3>🛟 자동 백업 (이 기기)</h3>
        <p className="hint">앱을 열면 하루 한 번 자동으로 저장돼요 (최근 14일). 구글 시트와 별개라, 시트가 잘못돼도 여기서 되돌릴 수 있어요. 기기마다 따로 쌓여요.</p>
        {snaps.length === 0 ? (
          <p className="hint">아직 자동 백업이 없어요. 오늘 안에 첫 백업이 만들어져요.</p>
        ) : (
          <ul className="snap-list">
            {snaps.map((s) => (
              <li key={s.id}>
                <span><b>{when(s.at)}</b> · {s.count}건{s.kind === 'pre-restore' ? ' · 복원 직전' : ''}</span>
                <span className="snap-btns">
                  <button type="button" className="btn btn-ghost btn-compact" onClick={() => void snapAction(s.id, 'save')}>파일 저장</button>
                  <button type="button" className="btn btn-ghost btn-compact" onClick={() => void snapAction(s.id, 'restore')}>복원</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
