import { useState } from 'react';
import {
  getClientId,
  getSheetId,
  setClientIdOverride,
  setSheetIdOverride,
} from '../google/config';

interface Props {
  onSaved: () => void;
  onClose: () => void;
  onConnect?: () => void;
}

export function GoogleSettings({ onSaved, onClose, onConnect }: Props) {
  const [clientId, setClientId] = useState(() => getClientId());
  const [sheetId, setSheetId] = useState(() => getSheetId());

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setClientIdOverride(clientId);
    setSheetIdOverride(sheetId);
    onSaved();
  }

  function handleSaveAndConnect(e: React.FormEvent) {
    handleSave(e);
    onConnect?.();
  }

  return (
    <form className="order-form google-settings" onSubmit={handleSave}>
      <h2 className="sheet-title">구글 시트 설정</h2>
      <p className="hint">
        Google Cloud에서 OAuth 웹 클라이언트와 Sheets API를 설정한 뒤, Client ID와
        스프레드시트 ID를 붙여넣으세요. 값은 이 기기의 브라우저에만 저장됩니다.
      </p>

      <label className="field">
        <span>OAuth Client ID</span>
        <input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="xxxx.apps.googleusercontent.com"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <label className="field">
        <span>스프레드시트 ID</span>
        <input
          value={sheetId}
          onChange={(e) => setSheetId(e.target.value)}
          placeholder="시트 URL의 /d/ 와 /edit 사이 문자열"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <p className="hint">
        승인된 JavaScript 원본에{' '}
        <code>https://lcnrrn.github.io</code> 와 로컬(<code>http://localhost:5173</code>)을
        추가하세요. Sheets API를 사용 설정해야 합니다.
      </p>

      <div className="form-actions google-settings-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          닫기
        </button>
        <button type="submit" className="btn btn-secondary">
          저장
        </button>
        {onConnect && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveAndConnect}
            disabled={!clientId.trim() || !sheetId.trim()}
          >
            저장 후 연결
          </button>
        )}
      </div>
    </form>
  );
}
