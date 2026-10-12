import { useCallback, useEffect, useRef, useState } from 'react';
import type { Order } from '../types';
import { getClientId, getSheetId, hasGoogleConfig } from '../google/config';
import {
  fetchTokenEmail,
  requestAccessToken,
  revokeAccessToken,
} from '../google/gis';
import {
  canPushLocalOverRemote,
  mergeOrdersForSync,
  pullOrders,
  pushOrders,
} from '../google/sheets';

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
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/401|invalid|expired|UNAUTHENTICATED/i.test(msg)) {
        // token expired: try silent refresh once
        try {
          const t = await requestAccessToken({ prompt: '' });
          setAccessToken(t);
          tokenRef.current = t;
        } catch {
          setAccessToken(null);
          tokenRef.current = null;
          setNeedsLogin(true);
        }
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
        token = await requestAccessToken({ prompt: '' });
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

  // Silent re-auth on load if previously signed in
  useEffect(() => {
    let cancelled = false;
    async function tryRestore() {
      let signed = signedIntent.current;
      try {
        signed = signed || localStorage.getItem(LS_SIGNED) === '1';
      } catch {
        /* ignore */
      }
      if (!signed) return;
      if (!hasGoogleConfig()) return;
      if (tokenRef.current) return;
      try {
        setStatus('connecting');
        const token = await requestAccessToken({ prompt: '' });
        if (cancelled) return;
        setAccessToken(token);
        tokenRef.current = token;
        const mail = await fetchTokenEmail(token);
        if (mail && !cancelled) {
          setEmail(mail);
          localStorage.setItem(LS_EMAIL, mail);
        }
        setNeedsLogin(false);
        await runPullMergePush(token, '자동 동기화 완료');
      } catch {
        if (!cancelled) {
          setStatus('idle');
          if (!tokenRef.current) setNeedsLogin(true);
        }
      }
    }
    void tryRestore();
    return () => {
      cancelled = true;
    };
  }, [runPullMergePush]);

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
