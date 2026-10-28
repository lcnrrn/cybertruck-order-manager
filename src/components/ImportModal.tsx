import { useMemo, useState } from 'react';
import type { Order } from '../types';
import { applyNickname, parseNaverFormFile, parseReminderText } from '../parseImport';
import {
  getProducts,
  joinItems,
  parseItemsAgainstCatalog,
} from '../products';

type Tab = 'naver' | 'reminders';

interface Props {
  /** 이미 있는 주문 (중복 감지용) */
  existing: Order[];
  onImport: (partials: Partial<Order>[]) => number;
  onClose: () => void;
}


const digitsOf = (s?: string) => (s || '').replace(/\D/g, '');
const squash = (s?: string) => (s || '').replace(/\s+/g, '').toLowerCase();
/** 같은 사람(연락처, 없으면 이름) + 같은 주문 내용이면 같은 주문으로 봄 */
function dupKey(o: Partial<Order>): string {
  const ph = digitsOf(o.phone);
  const who = ph.length >= 9 ? `p${ph}` : `n${squash(o.name)}`;
  return `${who}|${squash(o.items)}`;
}

/** Map imported items text onto catalog chips; leftover → note (요청 등). */
function alignItemsToCatalog(partials: Partial<Order>[]): Partial<Order>[] {
  const catalog = getProducts();
  return partials.map((o) => {
    const raw = (o.items || '').trim();
    if (!raw) return o;
    const { selected, note, qty } = parseItemsAgainstCatalog(raw, catalog);
    return { ...o, items: joinItems(selected, note, qty) };
  });
}

export function ImportModal({ existing, onImport, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('naver');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileOrders, setFileOrders] = useState<Partial<Order>[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  /** Default 기타 (or empty); user must pick — no longer 네이버 폼. */

  const reminderPreview = useMemo(
    () => alignItemsToCatalog(parseReminderText(text)),
    [text],
  );
  const rawPreview = tab === 'naver' ? fileOrders : reminderPreview;
  const preview = useMemo(
    () => applyNickname(rawPreview),
    [rawPreview],
  );
  /** 중복 의심: 이미 있는 주문 / 이번 목록 안의 앞줄과 같음 */
  const dups = useMemo(() => {
    const have = new Map<string, Order>();
    for (const o of existing) have.set(dupKey(o), o);
    const seen = new Set<string>();
    return preview.map((p): { kind: 'existing' | 'batch'; at?: number } | null => {
      const k = dupKey(p);
      const hit = have.get(k);
      if (hit) return { kind: 'existing', at: hit.createdAt || hit.updatedAt };
      if (seen.has(k)) return { kind: 'batch' };
      seen.add(k);
      return null;
    });
  }, [preview, existing]);
  /** 직접 바꾼 체크 (없으면 중복은 기본 제외) */
  const [override, setOverride] = useState<Record<number, boolean>>({});
  const isOn = (i: number) => override[i] ?? !dups[i];
  const picked = preview.map((_, i) => i).filter(isOn);
  const dupCount = dups.filter(Boolean).length;

  function switchTab(next: Tab) {
    setTab(next);
    setOverride({});
  }

  async function handleFile(file: File | null) {
    setFileError(null);
    setOverride({});
    setFileOrders([]);
    setFileName('');
    if (!file) return;

    setFileName(file.name);
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = alignItemsToCatalog(await parseNaverFormFile(buf));
      setFileOrders(parsed);
      if (parsed.length === 0) {
        setFileError('파싱된 주문이 없습니다. 네이버 폼 Excel 헤더를 확인해 주세요.');
      }
    } catch (err) {
      console.error(err);
      setFileError('파일을 읽을 수 없습니다. .xlsx 또는 .csv 인지 확인해 주세요.');
    } finally {
      setParsing(false);
    }
  }

  function handleImport() {
    if (picked.length === 0) {
      window.alert(
        tab === 'naver'
          ? '가져올 주문이 없습니다. Excel/CSV 파일을 선택해 주세요.'
          : '파싱된 주문이 없습니다. 한 줄에 한 주문씩 붙여넣어 주세요.',
      );
      return;
    }
    const n = onImport(applyNickname(rawPreview.filter((_, i) => isOn(i))));
    window.alert(`${n}건을 가져왔습니다.`);
    onClose();
  }

  return (
    <div className="sheet-body import-modal">
      <h2 className="sheet-title">주문 가져오기</h2>

      <div className="import-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'naver'}
          className={`import-tab${tab === 'naver' ? ' active' : ''}`}
          onClick={() => switchTab('naver')}
        >
          네이버 폼 Excel
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'reminders'}
          className={`import-tab${tab === 'reminders' ? ' active' : ''}`}
          onClick={() => switchTab('reminders')}
        >
          리마인더 붙여넣기
        </button>
      </div>

      {tab === 'naver' ? (
        <>
          <p className="hint">
            네이버 폼 설문 답변 Excel(.xlsx) 또는 CSV를 선택하세요.
            <br />
            성함·연락처·주소·옵션 열을 자동으로 매핑합니다.
          </p>
          <label className="file-picker">
            <span className="btn btn-ghost file-picker-btn">파일 선택</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {fileName && (
            <p className="file-name">
              {fileName}
              {parsing ? ' · 읽는 중…' : ''}
            </p>
          )}
          {fileError && <p className="import-error">{fileError}</p>}
        </>
      ) : (
        <>
          <p className="hint">
            Apple 미리알림처럼 한 줄에 한 주문씩 붙여넣으세요.
            <br />
            예: <code>김민수 - 사이드미러 / 서울시 강남구 … 01012345678</code>
          </p>
          <textarea
            className="import-textarea"
            value={text}
            onChange={(e) => { setText(e.target.value); setOverride({}); }}
            rows={8}
            placeholder={'이름 - 주문내용 / 주소 01012345678\n이름 / 주문 / 주소 / 연락처'}
          />
        </>
      )}

      {preview.length > 0 && (
        <div className="import-preview">
          <strong>
            미리보기 {preview.length}건 · 가져올 것 {picked.length}건
          </strong>
          {dupCount > 0 ? <p className="import-dup-note">⚠️ 이미 있는 주문과 같아 보이는 {dupCount}건은 기본으로 빼놨어요. 새 주문이 맞으면 체크해줘.</p> : null}
          <ul className="import-rows">
            {preview.slice(0, 60).map((p, i) => (
              <li key={i} className={dups[i] ? 'is-dup' : ''}>
                <label>
                  <input type="checkbox" checked={isOn(i)} onChange={(e) => setOverride((o) => ({ ...o, [i]: e.target.checked }))} />
                  <span className="import-row-text">
                    {p.name} · {p.items || '(내용없음)'} · {p.phone || '(번호없음)'}
                    {dups[i] ? (
                      <em className="dup-badge">
                        {dups[i]!.kind === 'existing' ? `이미 있음 · ${new Date(dups[i]!.at || 0).getMonth() + 1}/${new Date(dups[i]!.at || 0).getDate()} 접수` : '목록 안에서 중복'}
                      </em>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
            {preview.length > 60 && <li>…외 {preview.length - 60}건 (목록에 안 보이는 건 중복이 아니면 그대로 가져와요)</li>}
          </ul>
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          취소
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleImport}
          disabled={parsing || picked.length === 0}
        >
          {picked.length > 0 ? `${picked.length}건 가져오기` : '가져오기'}
        </button>
      </div>
    </div>
  );
}
