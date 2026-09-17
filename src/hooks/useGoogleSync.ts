import { useCallback, useEffect, useRef, useState } from 'react';
import type { Order } from '../types';
import { getClientId, getSheetId, hasGoogleConfig } from '../google/config';
import {
  fetchTokenEmail,
  requestAccessToken,
  revokeAccessToken,
} from '../google/gis';
import { mergeByUpdatedAt, pullOrders, pushOrders } from '../google/sheets';

const LS_SIGNED = 'cybertruck-google-signed';
const LS_EMAIL = 'cybertruck-google-email';
const DEBOUNCE_MS = 400;

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
  const [configured, setConfigured] = useState(() => hasGoogleConfig());

  const ordersRef = useRef(orders);
  const tokenRef = useRef<string | null>(null);
  const skipPushRef = useRef(false);
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

  const runPullMergePush = useCallback(async (token: string, toastMsg?: string) => {
    setStatus('syncing');
    setLastError(null);
    try {
      const remote = await pullOrders(token);
      const merged = mergeByUpdatedAt(ordersRef.current, remote);
      skipPushRef.current = true;
      replaceOrdersRef.current(merged);
      await pushOrders(token, merged);
      setStatus('idle');
      onToastRef.current?.(toastMsg || '동기화 완료');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '동기화 실패';
      setLastError(msg);
      setStatus('error');
      onToastRef.current?.(msg);
      throw e;
    }
  }, []);

  const connect = useCallback(async () => {
    if (!getClientId() || !getSheetId()) {
      onToastRef.current?.('설정에서 Client ID와 Sheet ID를 입력해 주세요.');
      return false;
    }
    setStatus('connecting');
    setLastError(null);
    try {
      const token = await requestAccessToken({ prompt: 'consent' });
      setAccessToken(token);
      tokenRef.current = token;
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

  // Debounced write-through when signed in and orders change
  useEffect(() => {
    if (!accessToken) return;
    if (skipPushRef.current) {
      skipPushRef.current = false;
      return;
    }
    if (!navigator.onLine) return;

    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      const token = tokenRef.current;
      if (!token) return;
      setStatus('syncing');
      pushOrders(token, ordersRef.current)
        .then(() => {
          setStatus('idle');
          setLastError(null);
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
  }, [orders, accessToken]);

  // Silent re-auth on load if previously signed in
  useEffect(() => {
    let cancelled = false;
    async function tryRestore() {
      if (!signedIntent.current) return;
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
        await runPullMergePush(token, '동기화 완료');
      } catch {
        if (!cancelled) setStatus('idle');
      }
    }
    void tryRestore();
    return () => {
      cancelled = true;
    };
  }, [runPullMergePush]);

  return {
    connected: Boolean(accessToken),
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
