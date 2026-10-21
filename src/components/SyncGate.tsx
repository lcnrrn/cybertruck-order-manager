import type { GateState } from '../hooks/useGoogleSync';

interface Props {
  gate: GateState;
  error?: string | null;
  onRetry: () => void;
  onReadOnly: () => void;
}

/** 앱을 켤 때/오래 쉬었다 돌아올 때: 시트의 최신 내용을 받기 전에는 화면을 가림 */
export function SyncGate({ gate, error, onRetry, onReadOnly }: Props) {
  if (gate === 'none') return null;
  return (
    <div className={`sync-gate gate-${gate}`} role="dialog" aria-modal="true" aria-live="polite">
      <div className="sync-gate-card">
        {gate === 'loading' ? (
          <>
            <div className="gate-spinner" aria-hidden />
            <p className="gate-title">최신 내용 불러오는 중…</p>
            <p className="gate-hint">다른 기기에서 고친 내용까지 받은 뒤에 수정할 수 있어요</p>
          </>
        ) : (
          <>
            <div className="gate-ico" aria-hidden>{gate === 'offline' ? '📡' : gate === 'login' ? '🔄' : '⚠️'}</div>
            <p className="gate-title">
              {gate === 'offline' ? '인터넷 연결이 없어요' : gate === 'login' ? '최신 내용을 먼저 받아야 해요' : '최신 내용을 못 받았어요'}
            </p>
            <p className="gate-hint">
              {gate === 'offline'
                ? '연결되면 자동으로 다시 불러와요. 그 전에는 읽기만 할 수 있어요.'
                : gate === 'login'
                  ? '구글 로그인 시간이 지났어요. 버튼을 누르면 바로 이어져요.'
                  : error || '잠시 후 다시 시도해 주세요.'}
            </p>
            {gate !== 'offline' ? (
              <button type="button" className="btn btn-primary gate-main" onClick={onRetry}>
                {gate === 'login' ? '탭해서 최신 내용 불러오기' : '다시 시도'}
              </button>
            ) : (
              <button type="button" className="btn btn-secondary gate-main" onClick={onRetry}>다시 확인</button>
            )}
            <button type="button" className="btn-link gate-ro" onClick={onReadOnly}>읽기 전용으로 보기</button>
          </>
        )}
      </div>
    </div>
  );
}

/** 읽기 전용 상태 배너 */
export function LockedBanner({ onSync }: { onSync: () => void }) {
  return (
    <button type="button" className="locked-banner" onClick={onSync}>
      🔒 읽기 전용 — 최신 내용을 받기 전이라 수정이 잠겨 있어요 · <u>탭해서 불러오기</u>
    </button>
  );
}
