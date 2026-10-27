/** 가벼운 SVG 차트 (라이브러리 없이) */
import { useId } from 'react';

export function Sparkline({ data, color = '#5ee1ff', height = 30 }: { data: number[]; color?: string; height?: number }) {
  const id = useId().replace(/:/g, '');
  const w = 100;
  const max = Math.max(1, ...data);
  const n = Math.max(1, data.length - 1);
  const pts = data.map((v, i) => [(i / n) * w, height - 2 - (v / max) * (height - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${height} L0,${height} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {data.length > 1 ? (
        <>
          <path d={area} fill={`url(#g${id})`} />
          <path d={line} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </>
      ) : null}
    </svg>
  );
}

export interface BarSeries {
  label: string;
  values: number[];
  color: string;
}

/** 묶음 막대 차트. labels: x축 */
export function Bars({ labels, series, height = 150, format }: { labels: string[]; series: BarSeries[]; height?: number; format?: (n: number) => string }) {
  const id = useId().replace(/:/g, '');
  const W = 320;
  const H = height;
  const pad = { l: 4, r: 4, t: 14, b: 20 };
  const all = series.flatMap((s) => s.values);
  const max = Math.max(1, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const gw = (W - pad.l - pad.r) / Math.max(1, labels.length);
  const bw = Math.max(3, Math.min(18, (gw - 6) / Math.max(1, series.length)));
  const y = (v: number) => pad.t + ((max - v) / span) * (H - pad.t - pad.b);
  return (
    <svg className="bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="차트">
      <defs>
        {series.map((s, i) => (
          <linearGradient key={i} id={`b${id}${i}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={s.color} stopOpacity="1" />
            <stop offset="1" stopColor={s.color} stopOpacity="0.45" />
          </linearGradient>
        ))}
      </defs>
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.12)" />
      {labels.map((lb, gi) => {
        const gx = pad.l + gi * gw + (gw - bw * series.length) / 2;
        return (
          <g key={lb + gi}>
            {series.map((s, si) => {
              const v = s.values[gi] || 0;
              const y0 = y(Math.max(0, v));
              const h = Math.abs(y(v) - y(0));
              return (
                <rect key={si} x={gx + si * bw + 0.5} y={y0} width={bw - 1} height={Math.max(v ? 1.5 : 0, h)} rx={Math.min(4, bw / 2)} fill={`url(#b${id}${si})`}>
                  <title>{`${lb} ${s.label}: ${format ? format(v) : v}`}</title>
                </rect>
              );
            })}
            <text x={pad.l + gi * gw + gw / 2} y={H - 5} textAnchor="middle" fontSize="10" fill="#9aa4b2">{lb}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** 도넛 진행률 */
export function Ring({ value, max, size = 44, color = '#5ee1ff' }: { value: number; max: number; size?: number; color?: string }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const p = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="4" fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="4" fill="none" strokeDasharray={`${c * p} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}
