import { useState } from 'react';
import {
  DEFAULT_SMS_BODIES,
  getSmsTemplates,
  resetSmsTemplates,
  setSmsTemplates,
  type SmsTemplateBodies,
} from '../sms';

interface Props {
  onClose: () => void;
  onSaved?: () => void;
}

export function SmsSettings({ onClose, onSaved }: Props) {
  const [bodies, setBodies] = useState<SmsTemplateBodies>(() => getSmsTemplates());

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSmsTemplates(bodies);
    onSaved?.();
    onClose();
  }

  function handleReset() {
    if (!window.confirm('문자 템플릿을 기본값으로 되돌릴까요?')) return;
    resetSmsTemplates();
    setBodies({ ...DEFAULT_SMS_BODIES });
  }

  return (
    <form className="order-form sms-settings" onSubmit={handleSave}>
      <h2 className="sheet-title">문자 템플릿</h2>
      <p className="hint">
        완료안내 · 발송안내 버튼에 들어가는 문구입니다. 이 기기에만 저장됩니다.
        발송 안내에 <code>{'{{등기번호}}'}</code>를 넣으면 송장이 있을 때 자동으로
        바뀝니다.
      </p>

      <label className="field">
        <span>제작 완료</span>
        <textarea
          rows={3}
          value={bodies.완료}
          onChange={(e) => setBodies((b) => ({ ...b, 완료: e.target.value }))}
          placeholder={DEFAULT_SMS_BODIES.완료}
        />
      </label>

      <label className="field">
        <span>발송 안내</span>
        <textarea
          rows={4}
          value={bodies.발송}
          onChange={(e) => setBodies((b) => ({ ...b, 발송: e.target.value }))}
          placeholder={DEFAULT_SMS_BODIES.발송}
        />
      </label>

      <p className="hint">
        송장 번호가 없으면 <code>{'{{등기번호}}'}</code> 문장이 빠진 채로 전송됩니다.
      </p>

      <div className="form-actions google-settings-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          닫기
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleReset}>
          기본값
        </button>
        <button type="submit" className="btn btn-primary">
          저장
        </button>
      </div>
    </form>
  );
}
