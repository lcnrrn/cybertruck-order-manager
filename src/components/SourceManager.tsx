import { useState } from 'react';
import { DEFAULT_SOURCES, getSourceColor } from '../sources';

interface Props {
  sources: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}

export function SourceManager({ sources, onChange, onClose }: Props) {
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  function addSource() {
    const name = draft.trim();
    if (!name) return;
    if (sources.includes(name)) {
      window.alert('이미 있는 경로입니다.');
      return;
    }
    onChange([...sources, name]);
    setDraft('');
  }

  function removeSource(name: string) {
    if (sources.length <= 1) {
      window.alert('경로를 최소 1개 이상 남겨 주세요.');
      return;
    }
    if (
      !window.confirm(
        `「${name}」을(를) 목록에서 삭제할까요?\n기존 주문의 경로는 그대로 남고, 필터에 추가 항목으로 표시됩니다.`,
      )
    ) {
      return;
    }
    onChange(sources.filter((s) => s !== name));
  }

  function startRename(name: string) {
    setRenaming(name);
    setRenameValue(name);
  }

  function commitRename() {
    if (!renaming) return;
    const next = renameValue.trim();
    if (!next) {
      window.alert('이름을 입력해 주세요.');
      return;
    }
    if (next !== renaming && sources.includes(next)) {
      window.alert('이미 있는 경로입니다.');
      return;
    }
    onChange(sources.map((s) => (s === renaming ? next : s)));
    setRenaming(null);
    setRenameValue('');
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= sources.length) return;
    const next = [...sources];
    const tmp = next[index];
    next[index] = next[j];
    next[j] = tmp;
    onChange(next);
  }

  function resetDefaults() {
    if (!window.confirm('기본 경로(TKC · 오너스클럽 · 기타)로 되돌릴까요?')) return;
    onChange([...DEFAULT_SOURCES]);
  }

  return (
    <div className="sheet-body source-manager">
      <h2 className="sheet-title">경로 관리</h2>
      <p className="hint">
        주문 경로 목록을 추가·이름 변경·삭제·순서 변경할 수 있습니다. 이 기기에만
        저장됩니다. 삭제해도 기존 주문의 경로 값은 유지됩니다.
      </p>

      <ul className="source-manager-list">
        {sources.map((name, i) => {
          const c = getSourceColor(name);
          const isRenaming = renaming === name;
          return (
            <li key={`${name}-${i}`} className="source-manager-item">
              <span
                className="source-manager-swatch"
                style={{ background: c.bg, borderColor: c.border, color: c.text }}
                aria-hidden
              />
              {isRenaming ? (
                <input
                  className="source-manager-rename"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRename();
                    } else if (e.key === 'Escape') {
                      setRenaming(null);
                    }
                  }}
                  autoFocus
                  aria-label="경로 이름 변경"
                />
              ) : (
                <span className="source-manager-name">{name}</span>
              )}
              <div className="source-manager-actions">
                <button
                  type="button"
                  className="btn btn-ghost source-mgr-btn"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="위로"
                  title="위로"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-ghost source-mgr-btn"
                  disabled={i === sources.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="아래로"
                  title="아래로"
                >
                  ↓
                </button>
                {isRenaming ? (
                  <button
                    type="button"
                    className="btn btn-secondary source-mgr-btn"
                    onClick={commitRename}
                  >
                    확인
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost source-mgr-btn"
                    onClick={() => startRename(name)}
                  >
                    이름
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-danger-ghost source-mgr-btn"
                  onClick={() => removeSource(name)}
                >
                  삭제
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="source-manager-add">
        <input
          className="source-custom-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addSource();
            }
          }}
          placeholder="새 경로 이름"
          aria-label="새 경로 이름"
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={addSource}
          disabled={!draft.trim()}
        >
          추가
        </button>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={resetDefaults}>
          기본값 복원
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
