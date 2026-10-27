import { useMemo } from 'react';
import { Coins, PackageOpen, Settings2, TrendingUp } from 'lucide-react';
import type { Order, PeriodRange } from '../types';
import type { Product } from '../products';
import { getProductColor } from '../products';
import type { FilamentState } from '../filament';
import { formatWon } from '../production';
import { resolvePeriodBounds, formatPeriodLabel } from '../period';
import { useShopSettings } from '../shop';
import { costPerGram, monthlyProfit, orderProfit, productMargins, shipFeeOf } from '../profit';
import { Bars } from '../ui/Charts';
import { useProductImages } from '../productImages';

interface Props {
  orders: Order[];
  products: Product[];
  filament: FilamentState;
  period: PeriodRange;
  onOpenShop: () => void;
}

const won = (n: number) => formatWon(n);
const short = (n: number) => (Math.abs(n) >= 10000 ? `${Math.round(n / 1000) / 10}만` : `${Math.round(n).toLocaleString('ko-KR')}`);

export function ProfitPanel({ orders, products, filament, period, onOpenShop }: Props) {
  const shop = useShopSettings();
  const images = useProductImages();
  const cpg = costPerGram(shop, filament);
  const fee = shipFeeOf(shop);
  const months = useMemo(() => monthlyProfit(orders, products, cpg.value, fee), [orders, products, cpg.value, fee]);
  const bounds = resolvePeriodBounds(period);
  const inPeriod = useMemo(
    () => orders.filter((o) => { const t = o.createdAt || o.updatedAt; return !bounds || (t >= bounds[0] && t <= bounds[1]); }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, bounds?.[0], bounds?.[1]],
  );
  const sum = useMemo(
    () => inPeriod.reduce((a, o) => { const p = orderProfit(o, products, cpg.value, fee); return { revenue: a.revenue + p.revenue, material: a.material + p.material, ship: a.ship + p.ship, net: a.net + p.net, grams: a.grams + p.grams }; }, { revenue: 0, material: 0, ship: 0, net: 0, grams: 0 }),
    [inPeriod, products, cpg.value, fee],
  );
  const margins = useMemo(() => productMargins(inPeriod, products, cpg.value), [inPeriod, products, cpg.value]);
  const rate = sum.revenue > 0 ? Math.round((sum.net / sum.revenue) * 100) : 0;
  const maxRev = Math.max(1, ...margins.map((m) => m.revenue));

  return (
    <div className="profit">
      <div className="kpis">
        <div className="kpi" style={{ ['--k' as string]: '#10b981' }}>
          <div className="kpi-top"><span className="kpi-label">순이익 (원가 기준)</span><span className="kpi-ico"><TrendingUp size={17} /></span></div>
          <div className={`kpi-value${sum.net < 0 ? ' neg' : ''}`}>{won(sum.net)}</div>
          <div className="kpi-sub">마진율 {rate}% · {formatPeriodLabel(period)}</div>
        </div>
        <div className="kpi" style={{ ['--k' as string]: '#f97316' }}>
          <div className="kpi-top"><span className="kpi-label">원가</span><span className="kpi-ico"><Coins size={17} /></span></div>
          <div className="kpi-value">{won(sum.material + sum.ship)}</div>
          <div className="kpi-sub">필라멘트 {won(sum.material)} · 택배 {won(sum.ship)}</div>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3><TrendingUp size={17} />월별 매출 · 원가 · 순이익</h3>
          <small>최근 6개월</small>
        </div>
        <Bars
          labels={months.map((m) => m.label)}
          series={[
            { label: '매출', values: months.map((m) => m.revenue), color: '#5ee1ff' },
            { label: '원가', values: months.map((m) => m.material + m.ship), color: '#fb923c' },
            { label: '순이익', values: months.map((m) => m.net), color: '#3ee08f' },
          ]}
          format={won}
        />
        <div className="legend"><span><i style={{ background: '#5ee1ff' }} />매출</span><span><i style={{ background: '#fb923c' }} />원가</span><span><i style={{ background: '#3ee08f' }} />순이익</span></div>
        <table className="profit-table">
          <thead><tr><th>월</th><th>매출</th><th>원가</th><th>순이익</th></tr></thead>
          <tbody>
            {months.slice().reverse().map((m) => (
              <tr key={m.key}>
                <td>{m.label}<small> {m.count}건</small></td>
                <td>{short(m.revenue)}</td>
                <td>{short(m.material + m.ship)}</td>
                <td className={m.net < 0 ? 'neg' : 'pos'}>{short(m.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3><PackageOpen size={17} />제품별 마진</h3>
          <small>{formatPeriodLabel(period)} · 택배비 제외</small>
        </div>
        {margins.length === 0 ? <p className="empty-hint">이 기간 판매가 없어요.</p> : (
          <ul className="rank margin-list">
            {margins.map((m) => {
              const c = getProductColor(m.name, products);
              const img = images[m.name];
              return (
                <li key={m.name}>
                  {img ? <img className="thumb" src={img} alt="" /> : <span className="thumb" style={{ background: c.bg, color: c.text }}>{m.name.slice(0, 1)}</span>}
                  <div className="rbody">
                    <span className="rname">{m.name} <small className="muted">×{m.qty}</small></span>
                    <div className="rbar"><i style={{ width: `${Math.max(3, (m.revenue / maxRev) * 100)}%` }} /></div>
                    <small className="margin-sub">매출 {won(m.revenue)} · 필라멘트 {Math.round(m.grams).toLocaleString('ko-KR')}g ({won(m.material)})</small>
                  </div>
                  <span className={`margin-rate ${m.rate >= 0.7 ? 'hi' : m.rate >= 0.4 ? 'mid' : 'lo'}`}>{Math.round(m.rate * 100)}%</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <button type="button" className="profit-basis" onClick={onOpenShop}>
        <Settings2 size={15} />
        <span>
          계산 기준: 필라멘트 <b>{cpg.value}원/g</b>
          {cpg.source === 'default' ? ' (기본값)' : cpg.source === 'purchase' ? ' (구매 기록 평균)' : ''} · 택배 <b>{won(fee)}</b>/건 (우체국 요금 기록이 있으면 그 값)
        </span>
        <small>바꾸기</small>
      </button>
    </div>
  );
}
