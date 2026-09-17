import type { SyncStatus } from '../hooks/useGoogleSync';

interface Props {
  connected: boolean;
  email: string | null;
  status: SyncStatus;
  onConnect: () => void;
  onSync: () => void;
  onDisconnect: () => void;
  onOpenSettings: () => void;
}

export function GoogleSyncBar({
  connected,
  email,
  status,
  onConnect,
  onSync,
  onDisconnect,
  onOpenSettings,
}: Props) {
  const busy = status === 'connecting' || status === 'syncing';

  return (
    <div className="google-sync-bar">
      {!connected ? (
        <>
          <button
            type="button"
            className="btn btn-secondary google-connect-btn"
            onClick={onConnect}
            disabled={busy}
          >
            {status === 'connecting' ? '연결 중…' : '구글 시트 연결'}
          </button>
          <button type="button" className="btn btn-ghost btn-compact" onClick={onOpenSettings}>
            설정
          </button>
        </>
      ) : (
        <>
          <span className="google-email" title={email || undefined}>
            {email || '연결됨'}
            {status === 'syncing' ? ' · 동기화 중…' : null}
            {status === 'error' ? ' · 오류' : null}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-compact"
            onClick={onSync}
            disabled={busy}
          >
            동기화
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            onClick={onDisconnect}
            disabled={busy}
          >
            연결 해제
          </button>
          <button type="button" className="btn btn-ghost btn-compact" onClick={onOpenSettings}>
            설정
          </button>
        </>
      )}
    </div>
  );
}
