import { useEffect, useRef, useState } from 'react';

/** 모바일(홈 화면 앱 포함) 당겨서 새로고침: 맨 위에서 아래로 70px 이상 당겼다 놓으면 onRefresh */
export function PullToRefresh({ onRefresh, disabled }: { onRefresh: () => void; disabled?: boolean }) {
  const [pull, setPull] = useState(0);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;
  const disRef = useRef(disabled);
  disRef.current = disabled;

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (disRef.current || window.scrollY > 0 || e.touches.length !== 1) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || window.scrollY > 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      pullRef.current = Math.min(120, dy * 0.6);
      setPull(pullRef.current);
    };
    const onEnd = () => {
      if (startY.current !== null && pullRef.current >= 70) cbRef.current();
      startY.current = null;
      pullRef.current = 0;
      setPull(0);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  if (pull <= 4) return null;
  return (
    <div className="ptr-indicator" style={{ height: pull }} aria-hidden>
      <span style={{ transform: `rotate(${pull * 3}deg)` }}>↻</span>
      <small>{pull >= 70 ? '놓으면 새로고침' : '당겨서 새로고침'}</small>
    </div>
  );
}
