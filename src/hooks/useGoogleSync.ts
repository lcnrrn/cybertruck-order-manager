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
import {
  canPushLocalOverRemote,
  mergeOrdersForSync,
  pullOrders,
  pushOrders,
} from '../google/sheets';
import { syncSettings } from '../google/settingsSync';
import { SETTINGS_CHANGED_EVENT } from '../settingsMeta';

const LS_SIGNED = 'cybertruck-google-signed';
const LS_EMAIL = 'cybertruck-google-email';
const DEBOUNCE_MS = 2000;
const POLL_MS = 60000;

export type SyncStatus = 'idle' | 'connecting' | 'syncing' | 'error';

interface Options {
  orders: Order[];
  replaceOrders: (next: Order[]) => void;
  onToast?: (msg: string) => void;
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

  const ordersRef = useRef(orders);
  const tokenRef = useRef<string | null>(null);
  const skipPushRef = useRef(false);
  /** Block write-through until the first pull+merge finishes (prevents race wipe). */
  const initialSyncDoneRef = useRef(false);
  /** Row count from last successful pull; used to refuse empty/sample overwrite. */
  const lastRemoteCountRef = useRef(-1);
  const debounceTimer = useRef<number | null>(null);
  const signedIntent = useRef(false);
  const replaceOrdersRef = useRef(replaceOrders);
  const onToastRef = useRef(onToast);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

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

  const refreshConfigured = useCallback(() => {
    setConfigured(hasGoogleConfig());
  }, []);

  const guardedPush = useCallback(async (token: string, next: Order[]) => {
    const guard = canPushLocalOverRemote(next, lastRemoteCountRef.current);
    if (!guard.ok) {
      onToastRef.current?.(guard.reason);
      setLastError(guard.reason);
      setStatus('error');
      return false;
    }
    await pushOrders(token, next);
    lastRemoteCountRef.current = next.length;
    return true;
  }, []);

  const runPullMergePush = useCallback(
    async (token: string, toastMsg?: string) => {
      setStatus('syncing');
      setLastError(null);
      try {
        const remote = await pullOrders(token);
        lastRemoteCountRef.current = remote.length;
        const merged = mergeOrdersForSync(ordersRef.current, remote);
        skipPushRef.current = true;
        replaceOrdersRef.current(merged);
        const pushed = await guardedPush(token, merged);
        initialSyncDoneRef.current = true;
        void syncSettings(token).catch(() => {
          /* settings sync is best-effort */
        });
        setStatus(pushed ? 'idle' : 'error');
        if (pushed) onToastRef.current?.(toastMsg || '동기화 완료');
      } catch (e) {
        const msg = e instanceof Error ? e.message : '동기화 실패';
        setLastError(msg);
        setStatus('error');
        onToastRef.current?.(msg);
        // Allow later manual sync; still block auto write-through until success.
        throw e;
      }
    },
    [guardedPush],
  );

  const pullingRef = useRef(false);
  const backgroundPull = useCallback(async () => {
    const token = tokenRef.current;
    if (!token || !initialSyncDoneRef.current || pullingRef.current) return;
    if (!navigator.onLine) return;
    pullingRef.current = true;
    try {
      const remote = await pullOrders(token);
      lastRemoteCountRef.current = remote.length;
      const local = ordersRef.current;
      const merged = mergeOrdersForSync(local, remote);
      if (JSON.stringify(merged) !== JSON.stringify(local)) {
        skipPushRef.current = true;
        replaceOrdersRef.current(merged);
      }
      if (JSON.stringify(merged) !== JSON.stringify(remote)) {
        await guardedPush(token, merged);
      }
      await syncSettings(token).catch(() => false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/401|invalid|expired|UNAUTHENTICATED/i.test(msg)) {
        // 토큰 만료: 팝업은 사용자 탭 안에서만 열 수 있어서, 다음 탭에 자동으로 다시 연결
        clearStoredToken();
        setAccessToken(null);
        tokenRef.current = null;
        setNeedsLogin(true);
      }
    } finally {
      pullingRef.current = false;
    }
  }, [guardedPush]);

  useEffect(() => {
    if (!accessToken) return;
    const id = window.setInterval(() => void backgroundPull(), POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') void backgroundPull();
    };
    window.addEventListener('focus', onVis);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onVis);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [accessToken, backgroundPull]);

  const connect = useCallback(async () => {
    if (!getClientId() || !getSheetId()) {
      onToastRef.current?.('설정에서 Client ID와 Sheet ID를 입력해 주세요.');
      return false;
    }
    if (reconnectingRef.current) return false;
    initialSyncDoneRef.current = false;
    setStatus('connecting');
    setLastError(null);
    try {
      const token = await requestAccessToken({ prompt: 'consent' });
      setAccessToken(token);
      tokenRef.current = token;
      setNeedsLogin(false);
      const mail = await fetchTokenEmail(token);
      if (mail) {
        setEmail(mail);
        localStorage.setItem(LS_EMAIL, mail);
      }
      localStorage.setItem(LS_SIGNED, '1');
      signedIntent.current = true;
      await runPullMergePush(token, '구글 시트 연결됨');
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '연결 실패';
      setLastError(msg);
      setStatus('error');
      onToastRef.current?.(msg);
      return false;
    }
  }, [runPullMergePush]);

  const disconnect = useCallback(() => {
    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    const t = tokenRef.current;
    if (t) revokeAccessToken(t);
    setAccessToken(null);
    tokenRef.current = null;
    setEmail(null);
    signedIntent.current = false;
    initialSyncDoneRef.current = false;
    lastRemoteCountRef.current = -1;
    try {
      localStorage.removeItem(LS_SIGNED);
      localStorage.removeItem(LS_EMAIL);
    } catch {
      /* ignore */
    }
    setStatus('idle');
    setLastError(null);
    onToastRef.current?.('연결 해제됨');
  }, []);

  const syncNow = useCallback(async () => {
    let token = tokenRef.current;
    if (!token) {
      if (!getClientId() || !getSheetId()) {
        onToastRef.current?.('설정에서 Client ID와 Sheet ID를 입력해 주세요.');
        return;
      }
      setStatus('connecting');
      try {
        if (reconnectingRef.current) return; // 첫 탭 자동 재연결이 이미 진행 중
        token = await requestAccessToken({ prompt: '', hint: localStorage.getItem(LS_EMAIL) });
        setNeedsLogin(false);
        setAccessToken(token);
        tokenRef.current = token;
        const mail = await fetchTokenEmail(token);
        if (mail) {
          setEmail(mail);
          localStorage.setItem(LS_EMAIL, mail);
        }
        localStorage.setItem(LS_SIGNED, '1');
        signedIntent.current = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : '재인증 실패';
        setLastError(msg);
        setStatus('error');
        onToastRef.current?.(msg);
        return;
      }
    }
    try {
      await runPullMergePush(token);
    } catch {
      /* already toasted */
    }
  }, [runPullMergePush]);

  // Debounced write-through — only after initial pull+merge succeeded
  useEffect(() => {
    if (!accessToken) return;
    if (!initialSyncDoneRef.current) return;
    if (skipPushRef.current) {
      skipPushRef.current = false;
      return;
    }
    if (!navigator.onLine) return;

    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      const token = tokenRef.current;
      if (!token || !initialSyncDoneRef.current) return;
      setStatus('syncing');
      void guardedPush(token, ordersRef.current)
        .then((ok) => {
          setStatus(ok ? 'idle' : 'error');
          if (ok) setLastError(null);
        })
        .catch((e) => {
          const msg = e instanceof Error ? e.message : '시트 저장 실패';
          setLastError(msg);
          setStatus('error');
        });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, [orders, accessToken, guardedPush]);

  // Debounced settings push (products, sources, SMS, filament) after local edits
  useEffect(() => {
    let timer: number | null = null;
    const onChanged = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const token = tokenRef.current;
        if (!token || !initialSyncDoneRef.current || !navigator.onLine) return;
        void syncSettings(token).catch(() => {
          /* retried on next poll */
        });
      }, DEBOUNCE_MS);
    };
    window.addEventListener(SETTINGS_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, onChanged);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  /** 재연결 성공 후 공통 처리 */
  const adoptToken = useCallback(
    async (token: string, toastMsg: string) => {
      setAccessToken(token);
      tokenRef.current = token;
      setNeedsLogin(false);
      try {
        localStorage.setItem(LS_SIGNED, '1');
      } catch {
        /* ignore */
      }
      signedIntent.current = true;
      if (!localStorage.getItem(LS_EMAIL)) {
        const mail = await fetchTokenEmail(token);
        if (mail) {
          setEmail(mail);
          localStorage.setItem(LS_EMAIL, mail);
        }
      }
      await runPullMergePush(token, toastMsg);
    },
    [runPullMergePush],
  );

  const isSigned = () => {
    try {
      return signedIntent.current || localStorage.getItem(LS_SIGNED) === '1';
    } catch {
      return signedIntent.current;
    }
  };

  // 앱 시작: 저장된 토큰이 아직 유효하면 그대로 바로 동기화 (팝업·버튼 없음)
  useEffect(() => {
    let cancelled = false;
    async function tryRestore() {
      if (!isSigned() || !hasGoogleConfig() || tokenRef.current) return;
      void loadGisScript().catch(() => undefined); // 다음 탭에서 즉시 팝업을 열 수 있게 미리 로드
      const stored = getStoredToken();
      if (stored) {
        try {
          await adoptToken(stored, '자동 동기화 완료');
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
        setNeedsLogin(true); // 첫 탭에서 자동 재연결
      }
    }
    void tryRestore();
    return () => {
      cancelled = true;
    };
  }, [adoptToken]);

  // 토큰이 만료된 상태면: 화면 어디든 처음 탭할 때(사용자 제스처) 자동으로 재연결
  const reconnectingRef = useRef(false);
  useEffect(() => {
    if (!needsLogin || accessToken) return;
    const onTap = () => {
      if (reconnectingRef.current || tokenRef.current || !isSigned() || !hasGoogleConfig()) return;
      reconnectingRef.current = true;
      setStatus('connecting');
      let hint: string | null = null;
      try {
        hint = localStorage.getItem(LS_EMAIL);
      } catch {
        /* ignore */
      }
      // 제스처 안에서 동기적으로 팝업 열기 (구글 로그인 유지 중이면 잠깐 떴다 자동으로 닫힘)
      requestAccessToken({ prompt: '', hint })
        .then((t) => adoptToken(t, '동기화 다시 연결됨'))
        .catch(() => {
          setStatus('idle');
        })
        .finally(() => {
          reconnectingRef.current = false;
        });
    };
    // 터치 끝(click) 시점이어야 iOS가 팝업을 허용
    document.addEventListener('click', onTap, { capture: true, once: true });
    return () => document.removeEventListener('click', onTap, { capture: true });
  }, [needsLogin, accessToken, adoptToken]);

  // 앱을 다시 열었을 때(포그라운드) 토큰이 만료됐으면 재연결 대기 상태로
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible' || !tokenRef.current) return;
      if (!getStoredToken()) {
        setAccessToken(null);
        tokenRef.current = null;
        setNeedsLogin(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return {
    connected: Boolean(accessToken),
    needsLogin,
    email,
    status,
    lastError,
    configured,
    refreshConfigured,
    connect,
    disconnect,
    syncNow,
  };
}
