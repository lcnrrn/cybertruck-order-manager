import { getSourceColor } from '../sources';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Managed source list (from getSources / state). */
  sources: string[];
  /** Show required hint when empty */
  required?: boolean;
  id?: string;
}

/**
 * Chip presets + free-text custom 주문 경로.
 * Value is stored in Order.group; UI label is always 주문 경로.
 */
export function SourcePicker({ value, onChange, sources, required, id }: Props) {
  const trimmed = value.trim();
  const isPreset = sources.includes(trimmed);

  return (
    <div className="source-picker" id={id}>
      <div className="source-chips" role="group" aria-label="주문 경로 선택">
        {sources.map((p) => {
          const c = getSourceColor(p);
          const active = trimmed === p;
          return (
            <button
              key={p}
              type="button"
              className={`source-chip${active ? ' active' : ''}`}
              style={{
                background: active ? c.bg : 'var(--bg-elevated)',
                borderColor: active ? c.border : 'var(--border)',
                color: active ? c.text : 'var(--text-muted)',
                boxShadow: active ? `inset 0 0 0 1px ${c.border}` : undefined,
              }}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          );
        })}
      </div>
      <input
        className="source-custom-input"
        value={isPreset ? '' : value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="또는 직접 입력"
        aria-label="주문 경로 직접 입력"
      />
      {required && !trimmed && (
        <p className="source-required-hint">주문 경로를 선택하거나 입력해 주세요.</p>
      )}
    </div>
  );
}
