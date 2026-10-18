import type { SyncStatus } from '../hooks/useGoogleSync';

interface Props {
  connected: boolean;
  needsLogin?: boolean;
  email: string | null;
  status: SyncStatus;
  onConnect: () => void;
  onSync: () => void;
  onDisconnect: () => void;
  onOpenSettings: () => void;
}

export function GoogleSyncBar({
  connected,
  needsLogin,
  email,
  status,
  onConnect,
  onSync,
  onDisconnect,
  onOpenSettings,
}: Props) {
  const busy = status === 'connecting' || status === 'syncing';

  return (
    <div className="google-sync-bar-wrap">
      <div className="google-sync-bar">
        {!connected && needsLogin ? (
          <button type="button" className="btn btn-secondary google-connect-btn" onClick={onSync} disabled={busy}>
            {busy ? '다시 연결 중…' : '🔄 탭해서 동기화 이어가기'}
          </button>
        ) : !connected ? (
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
              {status === 'idle' ? ' · 자동 동기화 켜짐' : null}
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
      {!connected && needsLogin ? (
        <p className="google-backup-hint">
          구글 로그인 시간이 지나서 잠시 멈췄어요. 화면 아무 곳이나 한 번 누르면 자동으로 다시 이어져요 (주문은 그대로 사용 가능).
        </p>
      ) : !connected ? (
        <p className="google-backup-hint">
          팁: 구글 시트를 연결하면 앱 업데이트·다른 기기에서도 주문이 유지됩니다.
        </p>
      ) : null}
    </div>
  );
}
