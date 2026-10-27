import { useId } from 'react';

/** 빈 화면·대시보드용 SVG 일러스트 (외부 이미지 없이) */
export function TruckArt({ className = 'truck' }: { className?: string }) {
  const u = useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 220 90" fill="none" aria-hidden>
      <defs>
        <linearGradient id={`ta-steel${u}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d9dee5" />
          <stop offset="0.5" stopColor="#8b939e" />
          <stop offset="1" stopColor="#c3c9d1" />
        </linearGradient>
        <linearGradient id={`ta-glow${u}`} x1="0" x2="1">
          <stop offset="0" stopColor="#5ee1ff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#5ee1ff" />
          <stop offset="1" stopColor="#5ee1ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M8 58 L96 22 L214 44 L214 62 L8 66 Z" fill={`url(#ta-steel${u})`} opacity="0.92" />
      <path d="M96 22 L150 32 L120 44 L60 44 Z" fill="#1b2027" opacity="0.85" />
      <path d="M10 58 L212 46" stroke={`url(#ta-glow${u})`} strokeWidth="2" />
      <circle cx="52" cy="66" r="13" fill="#0b0e13" stroke="#59616c" strokeWidth="3" />
      <circle cx="170" cy="66" r="13" fill="#0b0e13" stroke="#59616c" strokeWidth="3" />
      <circle cx="52" cy="66" r="4" fill="#59616c" />
      <circle cx="170" cy="66" r="4" fill="#59616c" />
      <rect x="0" y="84" width="220" height="2" rx="1" fill={`url(#ta-glow${u})`} opacity="0.6" />
    </svg>
  );
}

export function EmptyArt({ kind = 'box' }: { kind?: 'box' | 'search' | 'done' | 'people' }) {
  const u = useId().replace(/:/g, '');
  return (
    <svg className="empty-art" viewBox="0 0 140 110" fill="none" aria-hidden>
      <defs>
        <linearGradient id={`ea-g${u}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5ee1ff" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <ellipse cx="70" cy="98" rx="46" ry="6" fill="#5ee1ff" opacity="0.08" />
      {kind === 'search' ? (
        <>
          <circle cx="62" cy="50" r="26" stroke={`url(#ea-g${u})`} strokeWidth="6" />
          <path d="M82 70 L104 92" stroke={`url(#ea-g${u})`} strokeWidth="8" strokeLinecap="round" />
        </>
      ) : kind === 'done' ? (
        <>
          <circle cx="70" cy="52" r="34" fill="#3ee08f" opacity="0.12" />
          <circle cx="70" cy="52" r="34" stroke="#3ee08f" strokeWidth="4" />
          <path d="M54 53 L66 65 L88 41" stroke="#3ee08f" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : kind === 'people' ? (
        <>
          <circle cx="56" cy="40" r="14" stroke={`url(#ea-g${u})`} strokeWidth="5" />
          <path d="M30 84 C32 64 80 64 82 84" stroke={`url(#ea-g${u})`} strokeWidth="5" strokeLinecap="round" />
          <circle cx="94" cy="46" r="11" stroke="#a78bfa" strokeWidth="4" />
          <path d="M80 84 C84 70 110 68 114 84" stroke="#a78bfa" strokeWidth="4" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M30 38 L70 22 L110 38 L110 80 L70 96 L30 80 Z" fill="#141920" stroke={`url(#ea-g${u})`} strokeWidth="4" strokeLinejoin="round" />
          <path d="M30 38 L70 54 L110 38 M70 54 L70 96" stroke={`url(#ea-g${u})`} strokeWidth="4" strokeLinejoin="round" />
          <path d="M50 30 L90 46" stroke="#5ee1ff" strokeOpacity="0.5" strokeWidth="3" />
        </>
      )}
    </svg>
  );
}

/** 사이버트럭 실루엣 로고 (작은 크기) */
export function BrandLogo() {
  const u = useId().replace(/:/g, '');
  return (
    <svg className="brand-logo" viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id={`bl-g${u}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5ee1ff" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="23" height="23" rx="7" fill="#0b0e13" stroke={`url(#bl-g${u})`} />
      <path d="M3.5 14.5 L11 8 L20.5 12 L20.5 15 L3.5 15.5 Z" fill={`url(#bl-g${u})`} />
      <circle cx="7.5" cy="16" r="1.6" fill="#eef2f6" />
      <circle cx="17" cy="16" r="1.6" fill="#eef2f6" />
    </svg>
  );
}
