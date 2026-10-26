import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BANK, CATALOG, SHIPPING, epostTrackUrl } from './config';
import { apiReady, lookup, submitOrder, type LookupOrder } from './api';
import { orderItemProgress, progressTotals } from '../production';
import './buyer.css';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const BASE = import.meta.env.BASE_URL;

function Header({ sub }: { sub: string }) {
  return (
    <header className="b-head">
      <h1>Cybertruck 전용 액세서리</h1>
      <p>{sub}</p>
      <nav>
        <a href={`${BASE}order.html`}>주문하기</a>
        <a href={`${BASE}lookup.html`}>내 주문 조회</a>
      </nav>
    </header>
  );
}

function NotReady() {
  return <div className="b-card b-warn">주문 접수 준비 중이에요. 잠시 후 다시 열어 주세요.</div>;
}

function OrderPage() {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [f, setF] = useState({ nick: '', name: '', phone: '', address: '', payer: '', memo: '', website: '' });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ orderNo?: string; total: number } | null>(null);

  const all = useMemo(() => CATALOG.flatMap((g) => g.options), []);
  const sub = all.reduce((s, o) => s + (qty[o.name] || 0) * o.price, 0);
  const count = all.reduce((s, o) => s + (qty[o.name] || 0), 0);
  const total = count ? sub + SHIPPING.price : 0;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const bump = (name: string, d: number) => setQty((q) => ({ ...q, [name]: Math.max(0, Math.min(20, (q[name] || 0) + d)) }));

  const submit = async () => {
    setErr('');
    const phone = f.phone.replace(/\D/g, '');
    if (!count) return setErr('제품을 하나 이상 골라 주세요');
    if (!f.nick.trim()) return setErr('카페 닉네임을 적어 주세요');
    if (!f.name.trim()) return setErr('성함을 적어 주세요');
    if (phone.length < 10) return setErr('연락처를 확인해 주세요');
    if (f.address.trim().length < 5) return setErr('주소를 적어 주세요');
    if (!agree) return setErr('개인정보 수집·이용에 동의해 주세요');
    setBusy(true);
    try {
      const items: Record<string, number> = {};
      for (const [k, v] of Object.entries(qty)) if (v > 0) items[k] = v;
      const r = await submitOrder({ ...f, phone, payer: f.payer.trim() || f.name.trim(), items, agree });
      if (!r.ok) setErr(r.error || '접수에 실패했어요. 다시 시도해 주세요');
      else setDone({ orderNo: r.orderNo, total: r.total || total });
    } catch {
      setErr('네트워크 오류예요. 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <div className="b-wrap">
        <Header sub="주문이 접수됐어요" />
        <div className="b-card b-ok">
          <h2>주문 완료 🎉</h2>
          <p>주문번호 <b>{done.orderNo}</b></p>
          <p>입금하실 금액 <b>{won(done.total)}</b></p>
          <p className="b-bank">{BANK.bank} {BANK.number} {BANK.holder}</p>
          <button type="button" className="b-ghost" onClick={() => navigator.clipboard?.writeText(BANK.number)}>계좌번호 복사</button>
          <p className="b-muted">제작 상황과 송장번호는 「내 주문 조회」에서 성함 + 전화번호 뒷 4자리로 확인할 수 있어요.</p>
          <a className="b-btn" href={`${BASE}lookup.html`}>내 주문 조회</a>
        </div>
      </div>
    );

  return (
    <div className="b-wrap">
      <Header sub="사이버트럭 전용 액세서리 입니다." />
      <div className="b-card b-notice">
        모든 프린트 작업은 주문 후 작업에 들어가며, 기본 색상은 Black으로 합니다. 다른 색상을 요청하시면 가능은 합니다.
      </div>
      {!apiReady() && <NotReady />}
      {CATALOG.map((g, gi) => (
        <section className="b-card" key={g.title}>
          <h3><span className="b-no">{gi + 1}.</span> {g.title}</h3>
          {g.desc && <p className="b-muted">{g.desc}</p>}
          {g.options.map((o) => {
            const n = qty[o.name] || 0;
            return (
              <div className={`b-opt${n ? ' on' : ''}`} key={o.name}>
                <button type="button" className="b-opt-main" onClick={() => bump(o.name, n ? -n : 1)}>
                  <span className="b-check">{n ? '✓' : ''}</span>
                  <span className="b-opt-label">{o.label}</span>
                  <span className="b-price">{won(o.price)}</span>
                </button>
                {n > 0 && (
                  <div className="b-qty">
                    <button type="button" onClick={() => bump(o.name, -1)} aria-label="빼기">−</button>
                    <span>{n}개</span>
                    <button type="button" onClick={() => bump(o.name, 1)} aria-label="더하기">+</button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
      <section className="b-card">
        <h3><span className="b-no">10.</span> 택배비용 <em>필수</em></h3>
        <div className="b-opt on"><div className="b-opt-main"><span className="b-check">✓</span><span className="b-opt-label">{SHIPPING.label}</span><span className="b-price">{won(SHIPPING.price)}</span></div></div>
      </section>
      <section className="b-card b-fields">
        <label>11. 카페 닉네임 <em>필수</em><input value={f.nick} onChange={set('nick')} autoComplete="nickname" maxLength={30} /></label>
        <label>12. 성 함 <em>필수</em><input value={f.name} onChange={set('name')} autoComplete="name" maxLength={30} /></label>
        <label>13. 연락처 <em>필수</em><input value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="010-0000-0000" maxLength={13} /></label>
        <label>14. 주 소 <em>필수</em><textarea value={f.address} onChange={set('address')} autoComplete="street-address" rows={2} maxLength={200} placeholder="동·호수까지 적어 주세요" /></label>
        <label>입금자명 <span className="b-muted">(성함과 다를 때만)</span><input value={f.payer} onChange={set('payer')} maxLength={30} /></label>
        <label>15. 요청사항 <span className="b-muted">(색상 변경 등)</span><textarea value={f.memo} onChange={set('memo')} rows={2} maxLength={500} placeholder="예) 견인고리 커버 블랙 / 앰블럼 화이트" /></label>
        <input className="b-hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} aria-hidden="true" />
      </section>
      <section className="b-card">
        <label className="b-agree">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>개인정보 수집·이용에 동의합니다 <em>필수</em></span>
        </label>
        <p className="b-muted b-small">수집 항목: 카페 닉네임, 성함, 연락처, 주소, 입금자명 · 목적: 주문 제작, 입금 확인, 택배 발송 및 배송 안내 · 보관: 발송 완료 후 1년까지 보관 후 파기. 동의하지 않으면 주문할 수 없어요.</p>
      </section>
      <div className="b-bar">
        <div>
          <div className="b-muted b-small">{count ? `제품 ${count}개 + 택배비` : '제품을 골라 주세요'}</div>
          <b>{won(total)}</b>
        </div>
        <button type="button" className="b-btn" disabled={busy || !apiReady()} onClick={submit}>{busy ? '보내는 중…' : '주문하기'}</button>
      </div>
      {err && <div className="b-err" role="alert">{err}</div>}
      <p className="b-muted b-small b-center">입금 계좌: {BANK.bank} {BANK.number} {BANK.holder}</p>
    </div>
  );
}

function stepOf(o: LookupOrder): number {
  const sent = Boolean(o.trackingNumber || o.shipments.some((s) => s.trackingNumber));
  if (o.status === '완료') return sent ? 4 : 3;
  if (o.status === '제작중') return 2;
  return o.paid ? 1 : 0;
}
const STEPS = ['주문 접수', '입금 확인', '제작중', '제작 완료', '발송'];

function LookupPage() {
  const [name, setName] = useState('');
  const [last4, setLast4] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [orders, setOrders] = useState<LookupOrder[] | null>(null);
  const [names, setNames] = useState<string[]>([]);

  const go = async () => {
    setErr('');
    if (!name.trim() || !/^\d{4}$/.test(last4)) return setErr('성함과 전화번호 뒷 4자리를 넣어 주세요');
    setBusy(true);
    try {
      const r = await lookup(name.trim(), last4);
      if (!r.ok) setErr(r.error || '조회에 실패했어요');
      else {
        setOrders(r.orders || []);
        setNames(r.names || Object.keys(r.prices || {}));
      }
    } catch {
      setErr('네트워크 오류예요. 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="b-wrap">
      <Header sub="성함과 전화번호 뒷 4자리로 내 주문만 볼 수 있어요" />
      {!apiReady() && <NotReady />}
      <section className="b-card b-fields">
        <label>성함<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={30} /></label>
        <label>전화번호 뒷 4자리<input value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" maxLength={4} onKeyDown={(e) => e.key === 'Enter' && go()} /></label>
        <button type="button" className="b-btn" disabled={busy || !apiReady()} onClick={go}>{busy ? '찾는 중…' : '조회하기'}</button>
        {err && <div className="b-err" role="alert">{err}</div>}
      </section>
      {orders && !orders.length && <div className="b-card b-muted">주문을 찾지 못했어요. 주문할 때 쓴 성함과 연락처인지 확인해 주세요.</div>}
      {orders?.map((o) => {
        const st = stepOf(o);
        const prog = o.done && names.length ? orderItemProgress({ items: o.itemsRaw ?? o.items.join(' / '), doneMap: o.done }, names) : null;
        const tot = progressTotals(prog || []);
        const shipped = o.shipments.filter((sh) => sh.registered || sh.trackingNumber);
        const extraTrack = o.trackingNumber && !o.shipments.some((sh) => sh.trackingNumber === o.trackingNumber) ? o.trackingNumber : null;
        return (
          <section className="b-card" key={o.no + (o.createdAt || '')}>
            <div className="b-row">
              <b>주문 {o.no}</b>
              <span className="b-muted b-small">{o.createdAt ? new Date(o.createdAt).toLocaleDateString('ko-KR') : ''}</span>
            </div>
            {prog ? (
              <div className="b-prog">
                <div className="b-row"><b>제작 {tot.done}/{tot.total}</b><span className="b-muted b-small">{tot.total ? Math.round((tot.done / tot.total) * 100) : 0}%</span></div>
                <div className="b-bar-bg"><div className="b-bar-fg" style={{ width: `${tot.total ? (tot.done / tot.total) * 100 : 0}%` }} /></div>
                <ul className="b-pitems">
                  {prog.map((p) => (
                    <li key={p.key} className={p.done >= p.qty ? 'full' : ''}>
                      <span>{p.done >= p.qty ? '✅' : p.done > 0 ? '🛠️' : '⏳'} {p.label}</span>
                      <b>{p.done >= p.qty ? '완료' : `${p.done}/${p.qty}`}</b>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ul className="b-items">{o.items.map((it) => <li key={it}>{it}</li>)}</ul>
            )}
            <div className="b-badges">
              <span className={o.paid ? 'b-badge ok' : 'b-badge'}>{o.paid ? '입금 확인' : '입금 전'}</span>
              <span className="b-badge">{st >= 4 ? (o.shipments.length > 0 && o.shipments.filter((sh) => sh.trackingNumber).every((sh) => sh.delivered) && o.shipments.some((sh) => sh.delivered) ? '배달완료' : '발송') : o.status}{st < 4 && o.shipments.some((sh) => sh.registered || sh.trackingNumber) ? ' · 일부 발송' : ''}</span>
            </div>
            <ol className="b-steps">{STEPS.map((s, i) => <li key={s} className={i <= st ? 'on' : ''}>{s}</li>)}</ol>
            {shipped.map((sh) => (
              <div key={sh.no} className="b-ship">
                <div className="b-row"><b>📦 {sh.no}차 발송{sh.delivered ? ' · 🏠 배달완료' : ''}</b>{sh.at ? <span className="b-muted b-small">{new Date(sh.at).toLocaleDateString('ko-KR')}</span> : null}</div>
                <div className="b-small">{Object.entries(sh.items).map(([k, v]) => `${k}${v > 1 ? ` ${v}개` : ''}`).join(' · ')}</div>
                {sh.trackingNumber ? (
                  <a className="b-track" href={epostTrackUrl(sh.trackingNumber)} target="_blank" rel="noreferrer">우체국 {sh.trackingNumber} <span>배송조회 ›</span></a>
                ) : (
                  <div className="b-muted b-small">우체국 접수 완료 · 송장번호 곧 나와요</div>
                )}
              </div>
            ))}
            {extraTrack && (
              <a className="b-track" href={epostTrackUrl(extraTrack)} target="_blank" rel="noreferrer">📦 발송 · 우체국 {extraTrack} <span>배송조회 ›</span></a>
            )}
            {!o.paid && <p className="b-muted b-small">입금 계좌: {BANK.bank} {BANK.number} {BANK.holder}</p>}
          </section>
        );
      })}
    </div>
  );
}

const mode = document.getElementById('buyer-root')?.dataset.page;
createRoot(document.getElementById('buyer-root')!).render(
  <StrictMode>{mode === 'lookup' ? <LookupPage /> : <OrderPage />}</StrictMode>,
);
