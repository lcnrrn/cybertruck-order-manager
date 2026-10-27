import { useState } from 'react';
import { Copy, ExternalLink, Landmark, Store } from 'lucide-react';
import { bankInfo, loadShop, saveShop, type ShopSettings } from '../shop';
import { DEFAULT_COST_PER_GRAM, DEFAULT_SHIP_FEE } from '../profit';

interface Props {
  copyText: (text: string, ok: string) => void;
  onSaved: () => void;
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

export function ShopSettingsPanel({ copyText, onSaved, onClose }: Props) {
  const init = loadShop();
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
        <button type="button" className="btn btn-primary" onClick={() => { saveShop(draft); onSaved(); }}>저장</button>
      </div>
    </div>
  );
}
