import { useMemo, useState } from 'react';
import { BadgeCheck, ClipboardPaste, Landmark, Search, TriangleAlert } from 'lucide-react';
import type { Order } from '../types';
import type { Product } from '../products';
import { depositCandidates, parseDeposits, sureMatch, type Deposit } from '../deposit';
import { formatWon, isUnpaid, orderAmount } from '../production';

interface Props {
  orders: Order[];
  products: Product[];
  onApply: (list: { id: string; paidAt: number }[]) => void;
  onClose: () => void;
}

function fmt(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function DepositMatch({ orders, products, onApply, onClose }: Props) {
  const [text, setText] = useState('');
  const [deps, setDeps] = useState<Deposit[] | null>(null);
  /** 입금 idx → 주문 id ('' = 건너뜀) */
  const [pick, setPick] = useState<Record<number, string>>({});
  const unpaid = useMemo(() => orders.filter((o) => isUnpaid(o, products)), [orders, products]);

  const rows = useMemo(
    () => (deps || []).map((d) => ({ d, cands: depositCandidates(d, orders, products) })),
    [deps, orders, products],
  );

  const parse = (raw: string) => {
    const list = parseDeposits(raw);
    setDeps(list);
    const next: Record<number, string> = {};
    const taken = new Set<string>();
    for (const d of list) {
      const s = sureMatch(depositCandidates(d, orders, products));
      if (s && !taken.has(s.order.id)) {
        next[d.idx] = s.order.id;
        taken.add(s.order.id);
      }
    }
    setPick(next);
  };

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) {
        setText(t);
        parse(t);
      }
    } catch {
      /* 권한 없음 — 직접 붙여넣기 */
    }
  };

  const chosen = Object.entries(pick).filter(([, id]) => id);
  const dupIds = new Set(chosen.map(([, id]) => id).filter((id, i, a) => a.indexOf(id) !== i));

  return (
    <div className="sheet-body deposit">
      <h2 className="sheet-title"><Landmark size={20} /> 입금 확인</h2>
      <p className="muted-line">은행 앱(카카오뱅크 등) 거래내역을 길게 눌러 복사 → 아래에 붙여넣으면 미입금 주문과 이름·금액으로 짝을 찾아줘요. <b>확인 누르기 전엔 아무것도 안 바뀌어요.</b></p>
      <div className="dep-input">
        <textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'예)\n10.27 14:22 홍길동 입금 25,000원\n김철수 입금 17,500원'}
        />
        <div className="dep-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void paste()}><ClipboardPaste size={15} />붙여넣기</button>
          <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => parse(text)}><Search size={15} />짝 찾기</button>
        </div>
      </div>
      <p className="muted-line">미입금 주문 {unpaid.length}건 · {formatWon(unpaid.reduce((s, o) => s + orderAmount(o, products), 0))}</p>

      {deps && deps.length === 0 ? <p className="empty-hint">입금 내역을 못 찾았어요. 「이름 + 금액(원)」이 들어간 줄을 붙여넣어 줘.</p> : null}

      {rows.length > 0 && (
        <ul className="dep-list">
          {rows.map(({ d, cands }) => {
            const sel = pick[d.idx] || '';
            const top = cands[0];
            const sure = sureMatch(cands);
            return (
              <li key={d.idx} className={`dep-row${sel ? ' on' : ''}`}>
                <div className="dep-head">
                  <b className="dep-name">{d.name}</b>
                  <b className="dep-amt">{formatWon(d.amount)}</b>
                  {d.at ? <small>{fmt(d.at)}</small> : null}
                  {sure ? (
                    <span className="pill done"><BadgeCheck size={12} />이름·금액 일치</span>
                  ) : top ? (
                    <span className="pill make"><TriangleAlert size={12} />{top.nameHit ? '이름만 일치' : '금액만 일치'}</span>
                  ) : (
                    <span className="pill wait">후보 없음</span>
                  )}
                </div>
                {cands.length > 0 ? (
                  <div className="dep-cands">
                    {cands.slice(0, 4).map((c) => (
                      <label key={c.order.id} className={`dep-cand${sel === c.order.id ? ' on' : ''}${dupIds.has(c.order.id) && sel === c.order.id ? ' dup' : ''}`}>
                        <input
                          type="radio"
                          name={`dep-${d.idx}`}
                          checked={sel === c.order.id}
                          onChange={() => setPick((p) => ({ ...p, [d.idx]: c.order.id }))}
                        />
                        <span className="dep-cand-main">
                          <b>{c.order.name}</b>
                          <small>{c.order.items.replace(/\s*\n\s*/g, ' / ').slice(0, 40)}</small>
                        </span>
                        <span className={`dep-cand-amt${c.amountHit ? ' hit' : ''}`}>{formatWon(c.amount)}</span>
                      </label>
                    ))}
                    <label className={`dep-cand skip${!sel ? ' on' : ''}`}>
                      <input type="radio" name={`dep-${d.idx}`} checked={!sel} onChange={() => setPick((p) => ({ ...p, [d.idx]: '' }))} />
                      <span className="dep-cand-main"><b>건너뛰기</b></span>
                    </label>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {dupIds.size > 0 ? <p className="epost-warn">같은 주문을 두 입금에 골랐어요. 하나만 골라줘.</p> : null}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>닫기</button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!chosen.length || dupIds.size > 0}
          onClick={() => {
            const byIdx = new Map((deps || []).map((d) => [d.idx, d]));
            onApply(chosen.map(([idx, id]) => ({ id, paidAt: byIdx.get(Number(idx))?.at || Date.now() })));
          }}
        >
          <BadgeCheck size={16} />{chosen.length}건 입금완료 처리
        </button>
      </div>
    </div>
  );
}
