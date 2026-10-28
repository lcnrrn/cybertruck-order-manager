import type { BalanceEstimate } from '../balance';
import { formatWon } from '../production';

const fmtAt = (ms: number) => new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** 예상 통장 잔고 + 기준 잔고 / +입금 / −지출 내역 */
export function BalanceBreakdown({ est, detail = false }: { est: BalanceEstimate; detail?: boolean }) {
  return (
    <div className="bal-est">
      <div className="bal-est-main">
        <span>예상 통장 잔고</span>
        <b>{formatWon(est.expected)}</b>
      </div>
      <div className="bal-est-rows">
        <div><span>기준 잔고 <small>({fmtAt(est.base.at)} 입력)</small></span><b>{formatWon(est.base.amount)}</b></div>
        <div className="plus"><span>＋ 입금 {est.deposits.length}건</span><b>{formatWon(est.depositSum)}</b></div>
        <div className="minus"><span>− 지출</span><b>{formatWon(est.spent)}</b></div>
      </div>
      {detail && est.deposits.length > 0 && (
        <ul className="bal-est-list">
          {est.deposits.map((d) => (
            <li key={d.id}><span>{d.name} <small>{fmtAt(d.at)}</small></span><b>+{formatWon(d.amount)}</b></li>
          ))}
        </ul>
      )}
      {detail && est.mismatch !== 0 && (
        <p className="hint bal-est-warn">참고: 잔고 입력 뒤에 예전 주문의 금액이 바뀐 게 있어요 (합계 {formatWon(est.mismatch)} 차이). 입금 시각 기준으로만 더했으니 그 금액은 포함 안 돼요.</p>
      )}
    </div>
  );
}
