import { useMemo, useState } from 'react';
import type { Order } from '../types';
import { parseNaverFormFile, parseReminderText } from '../parseImport';

type Tab = 'naver' | 'reminders';

interface Props {
  onImport: (partials: Partial<Order>[]) => number;
  onClose: () => void;
}

export function ImportModal({ onImport, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('naver');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileOrders, setFileOrders] = useState<Partial<Order>[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const reminderPreview = useMemo(() => parseReminderText(text), [text]);
  const preview = tab === 'naver' ? fileOrders : reminderPreview;

  async function handleFile(file: File | null) {
    setFileError(null);
    setFileOrders([]);
    setFileName('');
    if (!file) return;

    setFileName(file.name);
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = await parseNaverFormFile(buf);
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
    if (preview.length === 0) {
      window.alert(
        tab === 'naver'
          ? '가져올 주문이 없습니다. Excel/CSV 파일을 선택해 주세요.'
          : '파싱된 주문이 없습니다. 한 줄에 한 주문씩 붙여넣어 주세요.',
      );
      return;
    }
    const n = onImport(preview);
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
          onClick={() => setTab('naver')}
        >
          네이버 폼 Excel
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'reminders'}
          className={`import-tab${tab === 'reminders' ? ' active' : ''}`}
          onClick={() => setTab('reminders')}
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
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={'이름 - 주문내용 / 주소 01012345678\n이름 / 주문 / 주소 / 연락처'}
          />
        </>
      )}

      {preview.length > 0 && (
        <div className="import-preview">
          <strong>미리보기 {preview.length}건</strong>
          <ul>
            {preview.slice(0, 5).map((p, i) => (
              <li key={i}>
                {p.name} · {p.items || '(내용없음)'} · {p.phone || '(번호없음)'}
              </li>
            ))}
            {preview.length > 5 && <li>…외 {preview.length - 5}건</li>}
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
          disabled={parsing || preview.length === 0}
        >
          {preview.length > 0 ? `${preview.length}건 가져오기` : '가져오기'}
        </button>
      </div>
    </div>
  );
}
