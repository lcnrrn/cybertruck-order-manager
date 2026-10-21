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
  dirty?: boolean;
  lastSyncAt?: number;
  lastError?: string | null;
  outdated?: boolean;
}

function hm(ms: number): string {
  const d = new Date(ms);
  const t = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return t;
  return `${d.getMonth() + 1}/${d.getDate()} ${t}`;
}

/** 한 줄 저장 상태: 초록 '저장됨 · 오전 8:20' / 빨강 '저장 안 됨 — 탭해서 다시 연결' */
export function SaveStatus({ connected, needsLogin, status, dirty, lastSyncAt, lastError, outdated, onSync }: {
  connected: boolean; needsLogin?: boolean; status: SyncStatus; dirty?: boolean; lastSyncAt?: number; lastError?: string | null; outdated?: boolean; onSync: () => void;
}) {
  let tone = 'ok';
  let text: string;
  if (outdated) {
    tone = 'bad';
    text = '옛 버전이라 저장을 멈췄어요 — 새로고침 중 (안 되면 앱을 완전히 닫았다 열기)';
  } else if (status === 'syncing' || status === 'connecting') {
    tone = 'busy';
    text = '저장 중…';
  } else if (!connected && (needsLogin || dirty)) {
    tone = 'bad';
    text = dirty ? '저장 안 됨 — 탭해서 다시 연결 (고친 내용은 연결되면 자동 저장)' : '연결 끊김 — 탭해서 다시 연결 (최신 데이터 받기)';
  } else if (status === 'error') {
    tone = 'bad';
    text = `저장 안 됨 — ${lastError || '오류'} · 탭해서 다시 시도`;
  } else if (dirty) {
    tone = 'busy';
    text = '저장 대기 중…';
  } else if (lastSyncAt) {
    text = `저장됨 · ${hm(lastSyncAt)}`;
  } else {
    return null;
  }
  return (
    <button type="button" className={`save-status ${tone}`} onClick={tone === 'bad' ? onSync : undefined} aria-live="polite">
      <i aria-hidden />
      <span>{text}</span>
    </button>
  );
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
  dirty,
  lastSyncAt,
  lastError,
  outdated,
}: Props) {
  const busy = status === 'connecting' || status === 'syncing';

  return (
    <div className="google-sync-bar-wrap">
      <SaveStatus connected={connected} needsLogin={needsLogin} status={status} dirty={dirty} lastSyncAt={lastSyncAt} lastError={lastError} outdated={outdated} onSync={onSync} />
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
          구글 로그인 시간이 지나서 잠시 멈췄어요. 위 버튼을 누르면 최신 내용을 받고 수정할 수 있어요.
        </p>
      ) : !connected ? (
        <p className="google-backup-hint">
          팁: 구글 시트를 연결하면 앱 업데이트·다른 기기에서도 주문이 유지됩니다.
        </p>
      ) : null}
    </div>
  );
}
