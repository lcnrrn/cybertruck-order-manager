import { useMemo, useState } from 'react';
import type { Order } from '../types';
import { formatPhoneDisplay } from '../sms';
import {
  loadBlacklist,
  matchBlacklist,
  newBlacklistId,
  normalizePhone,
  saveBlacklist,
  type BlacklistEntry,
} from '../blacklist';

interface Props {
  list: BlacklistEntry[];
  /** 주문 카드의 「블랙리스트」 버튼으로 연 경우 미리 채울 값 */
  draft?: { name?: string; phone?: string; address?: string } | null;
  orders: Order[];
  onToast: (msg: string) => void;
  onClose: () => void;
}

/** 블랙리스트 관리 — 전화번호(숫자만) 또는 주소가 같은 주문은 구매자 주문서에서 접수되지 않음 */
export function BlacklistPanel({ list, draft, orders, onToast, onClose }: Props) {
  const [open, setOpen] = useState<boolean>(!!draft);
  const [name, setName] = useState(draft?.name || '');
  const [phone, setPhone] = useState(draft?.phone || '');
  const [address, setAddress] = useState(draft?.address || '');
  const [reason, setReason] = useState('');
  const dup = useMemo(() => (phone.trim() || address.trim() ? matchBlacklist(phone, address, list) : null), [phone, address, list]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of list) m.set(e.id, orders.filter((o) => matchBlacklist(o.phone, o.address, [e])).length);
    return m;
  }, [list, orders]);

  const add = () => {
    const ph = phone.trim();
    const ad = address.trim();
    if (normalizePhone(ph).length < 9 && ad.length < 5) {
      window.alert('전화번호나 주소 중 하나는 정확히 넣어줘.');
      return;
    }
    if (ph && normalizePhone(ph).length < 9) {
      window.alert('전화번호가 너무 짧아. 다시 확인해 줘.');
      return;
    }
    const map = loadBlacklist();
    const id = newBlacklistId();
    map[id] = { id, name: name.trim() || undefined, phone: ph, address: ad, reason: reason.trim() || undefined, at: Date.now() };
    saveBlacklist(map);
    onToast('블랙리스트에 추가했어요');
    setOpen(false);
    setName('');
    setPhone('');
    setAddress('');
    setReason('');
  };
  const remove = (e: BlacklistEntry) => {
    if (!window.confirm(`${e.name || formatPhoneDisplay(e.phone) || e.address} 을(를) 블랙리스트에서 뺄까?`)) return;
    const map = loadBlacklist();
    delete map[e.id];
    saveBlacklist(map);
    onToast('블랙리스트에서 뺐어요');
  };

  return (
    <div className="sheet-body blacklist-panel">
      <h2 className="sheet-title">🚫 블랙리스트</h2>
      <p className="hint">
        여기 등록된 <b>전화번호</b>(숫자만 비교) 또는 <b>주소</b>(띄어쓰기·기호 달라도 같은 곳이면)로 들어오는 구매 요청은 구매자 주문서에서 접수되지 않아요.
        구매자에겐 “지금은 접수가 어렵다”는 일반 안내만 보여요. 주문서 서버(Apps Script) 새 버전 배포가 필요해요 (구글 시트 → 확장 프로그램 → Apps Script).
      </p>
      {!open ? (
        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>+ 블랙리스트 추가</button>
        </div>
      ) : (
        <div className="expense-form">
          <input className="source-custom-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (선택)" aria-label="이름" />
          <input className="source-custom-input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="전화번호 (예: 010-1234-5678)" aria-label="전화번호" />
          <input className="source-custom-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="주소 (동·호수까지 있으면 더 정확)" aria-label="주소" />
          <input className="source-custom-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유 (예: 환불 후 재주문 반복)" aria-label="사유" />
          {dup && <p className="report-warn">⚠️ 이미 등록된 {dup.by === 'phone' ? '전화번호' : '주소'}예요 ({dup.entry.name || formatPhoneDisplay(dup.entry.phone) || dup.entry.address}).</p>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>취소</button>
            <button type="button" className="btn btn-primary" onClick={add}>추가</button>
          </div>
        </div>
      )}
      <h3 className="report-h">등록 {list.length}명</h3>
      {list.length === 0 ? (
        <p className="hint">아직 없어요.</p>
      ) : (
        <ul className="expense-list bl-list">
          {list.map((e) => (
            <li key={e.id} className="bl-row">
              <div className="bl-main">
                <b>{e.name || '(이름 없음)'}</b>
                {e.phone ? <span>{formatPhoneDisplay(e.phone) || e.phone}</span> : null}
                {e.address ? <span>{e.address}</span> : null}
                {e.reason ? <small>사유: {e.reason}</small> : null}
                <small>{new Date(e.at).toLocaleDateString('ko-KR')} 등록{counts.get(e.id) ? ` · 내 주문 중 ${counts.get(e.id)}건 일치` : ''}</small>
              </div>
              <button type="button" className="btn btn-danger-ghost" onClick={() => remove(e)}>삭제</button>
            </li>
          ))}
        </ul>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
