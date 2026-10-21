import { useCallback, useEffect, useRef, useState } from 'react';
import type { Order } from '../types';
import { getClientId, getSheetId, hasGoogleConfig } from '../google/config';
import {
  clearStoredToken,
  fetchTokenEmail,
  getStoredToken,
  loadGisScript,
  requestAccessToken,
  revokeAccessToken,
} from '../google/gis';
import { SETTINGS_CHANGED_EVENT } from '../settingsMeta';
import { checkOutdated } from '../appVersion';
import { isAuthError, ordersFingerprint, pullMergePush } from '../google/syncCore';

const LS_SIGNED = 'cybertruck-google-signed';
const LS_EMAIL = 'cybertruck-google-email';
/** 시트에 아직 안 올라간 변경이 있는지 (앱을 껐다 켜도 유지 → 다시 연결되면 자동 업로드) */
const LS_DIRTY = 'cybertruck-sync-dirty';
const LS_LAST_SYNC = 'cybertruck-last-sync';
const DEBOUNCE_MS = 1200;
const POLL_MS = 45000;

export type SyncStatus = 'idle' | 'connecting' | 'syncing' | 'error';
/** 시작 화면 가림막: loading=불러오는 중, login=탭 필요, offline, error, none=사용 가능 */
export type GateState = 'none' | 'loading' | 'login' | 'offline' | 'error';
const GATE_TIMEOUT_MS = 20000;
const BACKGROUND_REGATE_MS = 60000;

interface Options {
  orders: Order[];
  replaceOrders: (next: Order[]) => void;
  onToast?: (msg: string) => void;
}

function lsNum(k: string): number {
  try {
    return Number(localStorage.getItem(k)) || 0;
  } catch {
    return 0;
  }
}
function lsSet(k: string, v: string | null): void {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

export function useGoogleSync({ orders, replaceOrders, onToast }: Options) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_EMAIL);
    } catch {
      return null;
    }
  });
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [configured, setConfigured] = useState(() => hasGoogleConfig());
  const [dirtySince, setDirtySince] = useState<number>(() => lsNum(LS_DIRTY));
  const [lastSyncAt, setLastSyncAt] = useState<number>(() => lsNum(LS_LAST_SYNC));
  const [outdated, setOutdated] = useState(false);
  /** 시트와 맞춘 뒤에만 true — false 면 수정 잠금 */
  const usesSheet = (() => {
    try {
      return localStorage.getItem(LS_SIGNED) === '1' && hasGoogleConfig();
    } catch {
      return false;
    }
  })();
  const [synced, setSynced] = useState<boolean>(!usesSheet);
  const [gate, setGateState] = useState<GateState>(usesSheet ? (navigator.onLine ? 'loading' : 'offline') : 'none');
  const gateRef = useRef<GateState>(gate);
  const setGate = useCallback((g: GateState) => {
    gateRef.current = g;
    setGateState(g);
  }, []);
  const syncedRef = useRef(synced);
  const setSyncedBoth = useCallback((v: boolean) => {
    syncedRef.current = v;
    setSynced(v);
  }, []);
  /** 가림막/읽기 전용 상태에서 실패 이유 반영 */
  const gateFail = useCallback(
    (kind: 'login' | 'offline' | 'error') => {
      if (syncedRef.current) return;
      if (gateRef.current !== 'none') setGate(kind);
    },
    [setGate],
  );

  const ordersRef = useRef(orders);
  const tokenRef = useRef<string | null>(null);
  /** 시트와 마지막으로 맞춘 주문 상태 — 이것과 다르면 '저장 안 된 변경' */
  const syncedFpRef = useRef<string | null>(null);
  const lastRemoteCountRef = useRef(-1);
  const outdatedRef = useRef(false);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const pendingRef = useRef(false);
  const debounceTimer = useRef<number | null>(null);
  const signedIntent = useRef(false);
  const replaceOrdersRef = useRef(replaceOrders);
  const onToastRef = useRef(onToast);

  useEffect(() => {
    replaceOrdersRef.current = replaceOrders;
  }, [replaceOrders]);
  useEffect(() => {
    onToastRef.current = onToast;
  }, [onToast]);
  useEffect(() => {
    try {
      signedIntent.current = localStorage.getItem(LS_SIGNED) === '1';
    } catch {
      signedIntent.current = false;
    }
  }, []);

  const markDirty = useCallback(() => {
    const now = Date.now();
    if (!lsNum(LS_DIRTY)) lsSet(LS_DIRTY, String(now));
    setDirtySince((d) => d || now);
  }, []);

  const refreshConfigured = useCallback(() => setConfigured(hasGoogleConfig()), []);

  const dropToken = useCallback((msg: string) => {
    clearStoredToken();
    setAccessToken(null);
    tokenRef.current = null;
    setNeedsLogin(true);
    setLastError(msg);
    setStatus('error');
  }, []);

  /**
   * 한 번의 동기화 = (1) 설정 받기·합치기·올리기 (2) 주문 최신본 받기 → 항목별 최신 updatedAt 병합 → 다르면 올리기.
   * 항상 먼저 받아서 합친 뒤 쓰므로, 옛 데이터가 더 새 데이터를 덮을 수 없음. 동시에 한 개만 실행(줄 세움).
   */
  const syncOnce = useCallback(
    (reason: 'open' | 'edit' | 'poll' | 'manual', toastMsg?: string): Promise<boolean> => {
      const run = async (): Promise<boolean> => {
        const token = tokenRef.current;
        if (!token) {
          if (lsNum(LS_DIRTY)) setNeedsLogin(true);
          gateFail('login');
          return false;
        }
        if (!navigator.onLine) {
          setLastError('오프라인 — 연결되면 자동 저장');
          setStatus('error');
          gateFail('offline');
          return false;
        }
        if (await checkOutdated()) {
          outdatedRef.current = true;
          setOutdated(true);
          setLastError('옛 버전 앱 — 새 버전으로 새로고침 중');
          setStatus('error');
          gateFail('error');
          return false;
        }
        const startedDirty = lsNum(LS_DIRTY);
        if (reason !== 'poll') setStatus('syncing');
        try {
          const local = ordersRef.current;
          let timer = 0;
          const { merged, remoteCount } = await Promise.race([
            pullMergePush(token, local),
            new Promise<never>((_, rej) => {
              timer = window.setTimeout(() => rej(new Error('응답이 너무 늦어요 (시간 초과)')), GATE_TIMEOUT_MS);
            }),
          ]).finally(() => window.clearTimeout(timer));
          lastRemoteCountRef.current = remoteCount;
          const mergedFp = ordersFingerprint(merged);
          if (mergedFp !== ordersFingerprint(ordersRef.current)) {
            // 받는 동안 사용자가 또 고쳤으면 그 수정은 다음 회차에 반영 (지금 덮지 않음)
            if (ordersRef.current === local) {
              syncedFpRef.current = mergedFp; // 이 교체는 '로컬 수정'이 아님
              ordersRef.current = merged;
              replaceOrdersRef.current(merged);
            }
          }
          syncedFpRef.current = mergedFp;
          // 동기화 도중 새로 고친 게 없을 때만 '저장됨'
          if (lsNum(LS_DIRTY) === startedDirty && ordersFingerprint(ordersRef.current) === mergedFp) {
            lsSet(LS_DIRTY, null);
            setDirtySince(0);
          }
          const now = Date.now();
          lsSet(LS_LAST_SYNC, String(now));
          setLastSyncAt(now);
          setLastError(null);
          setStatus('idle');
          setSyncedBoth(true);
          readOnlyRef.current = false;
          setGate('none');
          if (toastMsg) onToastRef.current?.(toastMsg);
          return true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : '동기화 실패';
          if (isAuthError(msg)) {
            dropToken('구글 로그인 만료 — 탭해서 다시 연결');
            gateFail('login');
          } else {
            gateFail(navigator.onLine ? 'error' : 'offline');
            setLastError(msg);
            setStatus('error');
            if (reason !== 'poll') onToastRef.current?.(`저장 실패: ${msg}`);
          }
          return false;
        }
      };
      const p = queueRef.current.then(run, run);
      queueRef.current = p.catch(() => undefined);
      return p;
    },
    [dropToken, gateFail, setGate, setSyncedBoth],
  );

  // 로컬 주문이 바뀔 때마다: 시트 기준과 다르면 '저장 안 됨' 표시 + 잠시 후 자동 저장
  useEffect(() => {
    ordersRef.current = orders;
    const fp = ordersFingerprint(orders);
    if (syncedFpRef.current === null) {
      // 앱을 켠 직후 첫 값 — 지난번 저장 안 된 표시는 LS_DIRTY 가 기억함
      syncedFpRef.current = lsNum(LS_DIRTY) ? '' : fp;
      return;
    }
    if (fp === syncedFpRef.current) return;
    markDirty();
    scheduleSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const scheduleSync = useCallback(() => {
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      debounceTimer.current = null;
      if (!tokenRef.current) {
        setNeedsLogin(isSigned());
        return;
      }
      if (pendingRef.current) return;
      pendingRef.current = true;
      void syncOnce('edit').finally(() => {
        pendingRef.current = false;
        if (lsNum(LS_DIRTY) && tokenRef.current && ordersFingerprint(ordersRef.current) !== syncedFpRef.current) scheduleSync();
      });
    }, DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncOnce]);

  // 설정(제품·경로·문자·필라멘트 등) 수정도 똑같이 바로 저장
  useEffect(() => {
    const onChanged = () => {
      markDirty();
      scheduleSync();
    };
    window.addEventListener(SETTINGS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, onChanged);
  }, [markDirty, scheduleSync]);

  // 앱 열기/다시 보기/주기적으로: 최신본 먼저 받기
  useEffect(() => {
    if (!accessToken) return;
    const id = window.setInterval(() => void syncOnce('poll'), POLL_MS);
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (!getStoredToken()) {
        dropToken('구글 로그인 만료 — 탭해서 다시 연결');
        return;
      }
      void syncOnce('open');
    };
    const onOnline = () => void syncOnce('open');
    window.addEventListener('focus', onVis);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onVis);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [accessToken, syncOnce, dropToken]);

  // 백그라운드에 1분 넘게 있다가 돌아오면: 다시 최신 내용부터 받고 나서 수정 허용
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (!hiddenAt || Date.now() - hiddenAt < BACKGROUND_REGATE_MS) return;
      hiddenAt = 0;
      if (!isSigned() || !hasGoogleConfig()) return;
      setSyncedBoth(false);
      if (!navigator.onLine) return setGate('offline');
      if (!tokenRef.current || !getStoredToken()) return setGate('login');
      setGate('loading');
      void syncOnce('open');
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncOnce, setGate, setSyncedBoth]);

  // 오프라인 → 온라인: 가림막 중이면 다시 시도
  useEffect(() => {
    const on = () => {
      if (syncedRef.current) return;
      if (tokenRef.current) {
        if (gateRef.current !== 'none') setGate('loading');
        void syncOnce('open');
      } else if (gateRef.current === 'offline') setGate('login');
    };
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [syncOnce, setGate]);

  // 페이지를 닫기 직전 남은 저장 시도
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && debounceTimer.current && tokenRef.current) {
        window.clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
        void syncOnce('edit');
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [syncOnce]);

  // 버전 확인: 켤 때 + 다시 볼 때
  useEffect(() => {
    const run = () =>
      void checkOutdated().then((o) => {
        outdatedRef.current = o;
        setOutdated(o);
      });
    run();
    const onVis = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const adoptToken = useCallback(
    async (token: string, toastMsg: string) => {
      setAccessToken(token);
      tokenRef.current = token;
      setNeedsLogin(false);
      lsSet(LS_SIGNED, '1');
      signedIntent.current = true;
      if (!localStorage.getItem(LS_EMAIL)) {
        const mail = await fetchTokenEmail(token);
        if (mail) {
          setEmail(mail);
          lsSet(LS_EMAIL, mail);
        }
      }
      const ok = await syncOnce('open', toastMsg);
      if (!ok && !tokenRef.current) throw new Error('auth');
    },
    [syncOnce],
  );

  const reconnectingRef = useRef(false);
  const readOnlyRef = useRef(false);

  const connect = useCallback(async () => {
    if (!getClientId() || !getSheetId()) {
      onToastRef.current?.('설정에서 Client ID와 Sheet ID를 입력해 주세요.');
      return false;
    }
    if (reconnectingRef.current) return false;
    setStatus('connecting');
    setLastError(null);
    try {
      const token = await requestAccessToken({ prompt: 'consent' });
      const mail = await fetchTokenEmail(token);
      if (mail) {
        setEmail(mail);
        lsSet(LS_EMAIL, mail);
      }
      await adoptToken(token, '구글 시트 연결됨');
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '연결 실패';
      setLastError(msg);
      setStatus('error');
      onToastRef.current?.(msg);
      return false;
    }
  }, [adoptToken]);

  const disconnect = useCallback(() => {
    const t = tokenRef.current;
    if (t) revokeAccessToken(t);
    setAccessToken(null);
    tokenRef.current = null;
    setEmail(null);
    signedIntent.current = false;
    lastRemoteCountRef.current = -1;
    lsSet(LS_SIGNED, null);
    lsSet(LS_EMAIL, null);
    setStatus('idle');
    setLastError(null);
    onToastRef.current?.('연결 해제됨');
  }, []);

  const syncNow = useCallback(async () => {
    if (!tokenRef.current) {
      if (!getClientId() || !getSheetId()) {
        onToastRef.current?.('설정에서 Client ID와 Sheet ID를 입력해 주세요.');
        return;
      }
      if (reconnectingRef.current) return;
      setStatus('connecting');
      try {
        reconnectingRef.current = true;
        const token = await requestAccessToken({ prompt: '', hint: localStorage.getItem(LS_EMAIL) });
        await adoptToken(token, '동기화 다시 연결됨');
      } catch (e) {
        const msg = e instanceof Error ? e.message : '재인증 실패';
        setLastError(msg);
        setStatus('error');
        onToastRef.current?.(msg);
        gateFail('login');
      } finally {
        reconnectingRef.current = false;
      }
      return;
    }
    await syncOnce('manual', '동기화 완료');
  }, [adoptToken, syncOnce, gateFail]);

  function isSigned() {
    try {
      return signedIntent.current || localStorage.getItem(LS_SIGNED) === '1';
    } catch {
      return signedIntent.current;
    }
  }

  // 앱 시작: 저장된 토큰이 유효하면 바로 받기→합치기→올리기
  useEffect(() => {
    let cancelled = false;
    async function tryRestore() {
      if (!isSigned() || !hasGoogleConfig() || tokenRef.current) return;
      if (!navigator.onLine) {
        setGate('offline');
        void loadGisScript().catch(() => undefined);
        const st = getStoredToken();
        if (st) {
          setAccessToken(st);
          tokenRef.current = st;
        }
        return;
      }
      void loadGisScript().catch(() => undefined);
      const stored = getStoredToken();
      if (stored) {
        try {
          await adoptToken(stored, '최신 데이터 받음');
          return;
        } catch {
          clearStoredToken();
          if (cancelled) return;
          setAccessToken(null);
          tokenRef.current = null;
        }
      }
      if (!cancelled) {
        setStatus('idle');
        setNeedsLogin(true);
        if (!syncedRef.current) setGate(navigator.onLine ? 'login' : 'offline');
      }
    }
    void tryRestore();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adoptToken]);

  // 토큰 만료 상태: 화면 아무 곳이나 처음 탭할 때 자동 재연결 (iOS 는 탭 안에서만 팝업 허용)
  useEffect(() => {
    if (!needsLogin || accessToken) return;
    const onTap = (ev: MouseEvent) => {
      // '읽기 전용으로 보기'를 고른 경우엔 아무 탭으로 팝업을 띄우지 않음 (배너/버튼으로만)
      if (readOnlyRef.current || (ev.target as HTMLElement | null)?.closest?.('.gate-ro')) return;
      if (reconnectingRef.current || tokenRef.current || !isSigned() || !hasGoogleConfig()) return;
      reconnectingRef.current = true;
      setStatus('connecting');
      let hint: string | null = null;
      try {
        hint = localStorage.getItem(LS_EMAIL);
      } catch {
        /* ignore */
      }
      requestAccessToken({ prompt: '', hint })
        .then((t) => adoptToken(t, '다시 연결됨 · 저장 완료'))
        .catch(() => {
          setStatus('error');
          gateFail('login');
        })
        .finally(() => {
          reconnectingRef.current = false;
        });
    };
    document.addEventListener('click', onTap, { capture: true, once: true });
    return () => document.removeEventListener('click', onTap, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsLogin, accessToken, adoptToken]);

  /** 가림막의 큰 버튼: 토큰 있으면 다시 받기, 없으면 구글 팝업(탭 안에서) */
  const retryGate = useCallback(() => {
    if (!navigator.onLine) {
      setGate('offline');
      onToastRef.current?.('인터넷 연결이 없어요');
      return;
    }
    setGate('loading');
    if (tokenRef.current && getStoredToken()) void syncOnce('open');
    else void syncNow();
  }, [setGate, syncOnce, syncNow]);

  /** 읽기 전용으로 보기: 가림막만 닫고 수정은 계속 잠금 */
  const viewReadOnly = useCallback(() => {
    readOnlyRef.current = true;
    setGate('none');
  }, [setGate]);

  return {
    gate,
    locked: !synced,
    retryGate,
    viewReadOnly,
    connected: Boolean(accessToken),
    needsLogin,
    email,
    status,
    lastError,
    configured,
    dirty: dirtySince > 0,
    lastSyncAt,
    outdated,
    refreshConfigured,
    connect,
    disconnect,
    syncNow,
  };
}
