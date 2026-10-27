import { useMemo, useState } from 'react';
import { Copy, Crown, Phone, Search, Users } from 'lucide-react';
import type { Order } from '../types';
import type { Product } from '../products';
import { formatWon, isUnpaid, orderAmount } from '../production';
import { avatarColor } from './Dashboard';
import { EmptyArt } from '../ui/Art';

interface Props {
  orders: Order[];
  products: Product[];
  copyText: (text: string, ok: string) => void;
  onSearch: (q: string) => void;
}

export interface Customer {
  key: string;
  name: string;
  phone: string;
  orders: Order[];
  total: number;
  unpaid: number;
  last: number;
  first: number;
}

function digits(p: string): string {
  return (p || '').replace(/\D/g, '');
}
function baseName(n: string): string {
  return (n || '').trim().split(/[\s(/,]+/)[0] || (n || '').trim();
}
function fmtPhone(p: string): string {
  const d = digits(p);
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}
function fmtDay(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}.${d.getDate()}`;
}

/** 전화번호(숫자만)로 묶고, 번호가 없으면 이름으로 */
export function groupCustomers(orders: Order[], catalog: Product[]): Customer[] {
  const m = new Map<string, Customer>();
  for (const o of orders) {
    const ph = digits(o.phone);
    const key = ph.length >= 9 ? `p:${ph}` : `n:${baseName(o.name)}`;
    const at = o.createdAt || o.updatedAt;
    const c = m.get(key) || { key, name: baseName(o.name), phone: ph ? fmtPhone(o.phone) : '', orders: [], total: 0, unpaid: 0, last: 0, first: at };
    c.orders.push(o);
    const amt = orderAmount(o, catalog);
    c.total += amt;
    if (isUnpaid(o, catalog)) c.unpaid += amt;
    if (at >= c.last) {
      c.last = at;
      c.name = baseName(o.name) || c.name;
    }
    c.first = Math.min(c.first, at);
    m.set(key, c);
  }
  return [...m.values()];
}

type SortKey = 'total' | 'count' | 'last';

export function Customers({ orders, products, copyText, onSearch }: Props) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('total');
  const all = useMemo(() => groupCustomers(orders, products), [orders, products]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const d = digits(q);
    const f = all.filter((c) => !t || c.name.toLowerCase().includes(t) || (d.length >= 3 && digits(c.phone).includes(d)));
    return f.sort((a, b) =>
      sort === 'total' ? b.total - a.total : sort === 'count' ? b.orders.length - a.orders.length || b.total - a.total : b.last - a.last,
    );
  }, [all, q, sort]);
  const repeat = all.filter((c) => c.orders.length > 1).length;
  const top = Math.max(1, ...all.map((c) => c.total));

  if (!all.length) {
    return (
      <div className="empty"><EmptyArt kind="people" /><p className="empty-title">아직 고객이 없어요</p><p className="empty-hint">주문이 들어오면 이름·전화번호로 자동으로 묶여요.</p></div>
    );
  }

  const phones = list.filter((c) => c.phone).map((c) => c.phone);

  return (
    <div className="cust">
      <div className="kpis cust-kpis">
        <div className="kpi" style={{ ['--k' as string]: '#3b82f6' }}>
          <div className="kpi-top"><span className="kpi-label">고객</span><span className="kpi-ico"><Users size={17} /></span></div>
          <div className="kpi-value">{all.length}<small>명</small></div>
        </div>
        <div className="kpi" style={{ ['--k' as string]: '#f59e0b' }}>
          <div className="kpi-top"><span className="kpi-label">재구매</span><span className="kpi-ico"><Crown size={17} /></span></div>
          <div className="kpi-value">{repeat}<small>명 · {Math.round((repeat / all.length) * 100)}%</small></div>
        </div>
      </div>

      <div className="cust-tools">
        <div className="search-wrap">
          <input className="search-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 전화번호" aria-label="고객 검색" />
        </div>
        <div className="seg">
          {([['total', '구매액'], ['count', '주문수'], ['last', '최근']] as const).map(([k, l]) => (
            <button key={k} type="button" className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-compact" data-allow-locked disabled={!phones.length} onClick={() => copyText(phones.join('\n'), `전화번호 ${phones.length}개 복사됨`)}>
          <Copy size={14} />번호 {phones.length}개 복사
        </button>
      </div>

      <ul className="cust-list">
        {list.map((c, i) => (
          <li key={c.key} className="cust-row">
            <span className="avatar" style={{ background: avatarColor(c.name) }}>{c.name.slice(0, 1)}</span>
            <div className="cust-main">
              <div className="cust-name">
                <b>{c.name}</b>
                {sort === 'total' && i < 3 && !q ? <span className="pill make"><Crown size={11} />TOP {i + 1}</span> : null}
                {c.orders.length > 1 ? <span className="pill paid">{c.orders.length}회 주문</span> : null}
                {c.unpaid > 0 ? <span className="pill unpaid">미입금 {formatWon(c.unpaid)}</span> : null}
              </div>
              <div className="cust-meta">
                {c.phone ? (
                  <a href={`tel:${digits(c.phone)}`} className="cust-phone" data-allow-locked><Phone size={11} />{c.phone}</a>
                ) : <span>번호 없음</span>}
                <span>최근 {fmtDay(c.last)}</span>
                {c.orders.length > 1 ? <span>첫 주문 {fmtDay(c.first)}</span> : null}
              </div>
              <div className="rbar cust-bar"><i style={{ width: `${Math.max(3, (c.total / top) * 100)}%` }} /></div>
            </div>
            <div className="cust-side">
              <b>{formatWon(c.total)}</b>
              <button type="button" className="link-btn" data-allow-locked onClick={() => onSearch(c.phone ? digits(c.phone) : c.name)}><Search size={12} />주문 보기</button>
            </div>
          </li>
        ))}
      </ul>
      {!list.length ? <p className="empty-hint">검색 결과가 없어요.</p> : null}
    </div>
  );
}
