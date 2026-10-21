import { useCallback, useEffect, useRef, useState } from 'react';
import { UPDATE_EVENT, applyUpdate, checkOutdated, latestBuild } from '../appVersion';

const POLL_MS = 3 * 60 * 1000;

/**
 * 새 버전 감지: 켤 때 · 다시 볼 때 · 3분마다 version.json 확인.
 * 저장 안 된 수정이 없으면 자동으로 업데이트, 있으면 배너(탭하면 업데이트 — 고친 내용은 이 기기에 남았다가 새 버전이 저장).
 */
export function useAppUpdate(opts: { dirty: boolean; busy: boolean }) {
  const [available, setAvailable] = useState<string | null>(() => latestBuild());
  const [stuck, setStuck] = useState(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const apply = useCallback(async () => {
    const ok = await applyUpdate(latestBuild());
    if (!ok) setStuck(true);
  }, []);

  const check = useCallback(async (): Promise<boolean> => {
    const out = await checkOutdated();
    if (out) setAvailable(latestBuild());
    return out;
  }, []);

  useEffect(() => {
    void check();
    const onVis = () => document.visibilityState === 'visible' && void check();
    const onEvt = (e: Event) => setAvailable(String((e as CustomEvent).detail || latestBuild() || ''));
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    window.addEventListener(UPDATE_EVENT, onEvt);
    const id = window.setInterval(() => void check(), POLL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
      window.removeEventListener(UPDATE_EVENT, onEvt);
      window.clearInterval(id);
    };
  }, [check]);

  // 저장 안 된 수정이 없고 동기화 중이 아니면 자동 업데이트
  useEffect(() => {
    if (!available || stuck) return;
    if (opts.dirty || opts.busy) return;
    const t = window.setTimeout(() => {
      if (!optsRef.current.dirty && !optsRef.current.busy) void apply();
    }, 1500);
    return () => window.clearTimeout(t);
  }, [available, stuck, opts.dirty, opts.busy, apply]);

  return { available, stuck, apply, check };
}
