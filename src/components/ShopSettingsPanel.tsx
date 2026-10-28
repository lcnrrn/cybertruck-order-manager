import { useState } from 'react';
import { BellRing, Copy, ExternalLink, Landmark, Send, Store } from 'lucide-react';
import { cleanKey, cleanUrl, hasWebhook, loadWebhook, saveWebhook, sendWebhook, webhookToast } from '../epostWebhook';
import { bankInfo, loadShop, saveShop, type ShopSettings } from '../shop';
import { DEFAULT_COST_PER_GRAM, DEFAULT_SHIP_FEE } from '../profit';

interface Props {
  copyText: (text: string, ok: string) => void;
  onSaved: () => void;
  onToast: (msg: string) => void;
  onClose: () => void;
}

export function buyerLinks(): { order: string; lookup: string } {
  const base = `${window.location.origin}${import.meta.env.BASE_URL || '/'}`;
  return { order: `${base}order.html`, lookup: `${base}lookup.html` };
}

export function buyerGuideText(s: ShopSettings = loadShop()): string {
  const b = bankInfo(s);
  const l = buyerLinks();
  return [
    '주문해 주셔서 감사합니다 🙏',
    `입금 계좌: ${b.bank} ${b.number} (${b.holder})`,
    '입금자명은 주문하신 성함으로 보내 주세요.',
    `주문 진행·송장 확인: ${l.lookup}`,
    '(성함 + 전화번호 뒤 4자리로 조회)',
  ].join('\n');
}

const num = (v: string): number | undefined => {
  const n = Number(v.replace(/[^\d.]/g, ''));
  return v.trim() && Number.isFinite(n) ? n : undefined;
};

export function ShopSettingsPanel({ copyText, onSaved, onToast, onClose }: Props) {
  const init = loadShop();
  const wh0 = loadWebhook();
  const [wh, setWh] = useState({ url: wh0.url || '', key: wh0.key || '' });
  const [testing, setTesting] = useState(false);
  const runTest = async () => {
    const w = { url: cleanUrl(wh.url), key: cleanKey(wh.key) };
    if (!hasWebhook(w)) {
      onToast('웹훅 URL(https://…)을 먼저 넣어줘');
      return;
    }
    setTesting(true);
    const r = await sendWebhook(w, { event: 'test' });
    setTesting(false);
    onToast(r === 'ok' ? '테스트 성공 · Bot이 깨어났어 (할 일 없으면 조용히 끝나요)' : webhookToast(r));
  };
  const [f, setF] = useState({
    bankName: init.bankName || '',
    bankNumber: init.bankNumber || '',
    bankHolder: init.bankHolder || '',
    costPerGram: init.costPerGram !== undefined ? String(init.costPerGram) : '',
    shipFee: init.shipFee !== undefined ? String(init.shipFee) : '',
  });
  const def = bankInfo({});
  const links = buyerLinks();
  const draft: ShopSettings = {
    bankName: f.bankName.trim() || undefined,
    bankNumber: f.bankNumber.trim() || undefined,
    bankHolder: f.bankHolder.trim() || undefined,
    costPerGram: num(f.costPerGram),
    shipFee: num(f.shipFee),
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="sheet-body shop-settings">
      <h2 className="sheet-title"><Store size={20} /> 가게 · 구매자 안내</h2>

      <section className="panel">
        <div className="panel-head"><h3><Landmark size={16} />입금 계좌</h3><small>주문 완료·조회 화면에 보여요</small></div>
        <div className="form-grid">
          <label>은행<input value={f.bankName} onChange={set('bankName')} placeholder={def.bank} /></label>
          <label>계좌번호<input value={f.bankNumber} onChange={set('bankNumber')} inputMode="numeric" placeholder={def.number} /></label>
          <label>예금주<input value={f.bankHolder} onChange={set('bankHolder')} placeholder={def.holder} /></label>
        </div>
        <p className="muted-line">비워두면 지금 쓰는 계좌({def.bank} · {def.holder})가 그대로 보여요. 구매자 페이지에 반영되려면 구글 시트 동기화 + Apps Script 새 배포가 한 번 필요해요.</p>
      </section>

      <section className="panel">
        <div className="panel-head"><h3>원가 계산 기준</h3><small>매출 › 원가·순이익</small></div>
        <div className="form-grid">
          <label>필라멘트 1g 원가(원)<input value={f.costPerGram} onChange={set('costPerGram')} inputMode="decimal" placeholder={`비우면 구매 기록 평균 또는 ${DEFAULT_COST_PER_GRAM}`} /></label>
          <label>택배비 1건(원)<input value={f.shipFee} onChange={set('shipFee')} inputMode="numeric" placeholder={String(DEFAULT_SHIP_FEE)} /></label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h3><BellRing size={16} />접수 알림 웹훅</h3><small>우체국 「접수 요청」 누르면 Bot을 바로 깨워요</small></div>
        <div className="form-grid">
          <label>웹훅 URL<input value={wh.url} onChange={(e) => setWh((p) => ({ ...p, url: e.target.value }))} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="https://…" /></label>
          <label>발신자 키 (key)<input type="password" value={wh.key} onChange={(e) => setWh((p) => ({ ...p, key: e.target.value }))} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="루틴 화면의 key" /></label>
        </div>
        <button type="button" className="btn btn-secondary btn-wide" data-allow-locked disabled={testing} onClick={() => void runTest()}><Send size={15} />{testing ? '보내는 중…' : '테스트 알림'}</button>
        <p className="muted-line">Bot 루틴 화면(웹훅)에 있는 주소와 key를 붙여넣고 아래 「저장」을 눌러요. 두 기기(맥북·아이폰)에 같이 적용돼요. 비워두면 알림 없이 시트에만 저장되고, 채팅으로 「접수해줘」라고 말하면 돼요.</p>
      </section>

      <section className="panel">
        <div className="panel-head"><h3>구매자 링크 · 안내 문구</h3></div>
        <div className="link-rows">
          <div className="link-row"><span><b>주문하기</b><small>{links.order}</small></span>
            <button type="button" className="btn btn-ghost btn-compact" data-allow-locked onClick={() => copyText(links.order, '주문 링크 복사됨')}><Copy size={13} />복사</button>
            <a className="btn btn-ghost btn-compact" href={links.order} target="_blank" rel="noreferrer" data-allow-locked><ExternalLink size={13} /></a>
          </div>
          <div className="link-row"><span><b>내 주문 조회</b><small>{links.lookup}</small></span>
            <button type="button" className="btn btn-ghost btn-compact" data-allow-locked onClick={() => copyText(links.lookup, '조회 링크 복사됨')}><Copy size={13} />복사</button>
            <a className="btn btn-ghost btn-compact" href={links.lookup} target="_blank" rel="noreferrer" data-allow-locked><ExternalLink size={13} /></a>
          </div>
        </div>
        <pre className="guide-preview">{buyerGuideText(draft)}</pre>
        <button type="button" className="btn btn-secondary btn-wide" data-allow-locked onClick={() => copyText(buyerGuideText(draft), '안내 문구 복사됨 · 카페 댓글/문자에 붙여넣기')}><Copy size={15} />안내 문구 복사</button>
      </section>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>닫기</button>
        <button type="button" className="btn btn-primary" onClick={() => { saveShop(draft); if (cleanUrl(wh.url) !== (wh0.url || '') || cleanKey(wh.key) !== (wh0.key || '')) saveWebhook(wh); onSaved(); }}>저장</button>
      </div>
    </div>
  );
}
