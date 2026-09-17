import { SOURCE_PRESETS } from '../sources';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Show required hint when empty */
  required?: boolean;
  id?: string;
}

/**
 * Chip presets + free-text custom 주문 경로.
 * Value is stored in Order.group; UI label is always 주문 경로.
 */
export function SourcePicker({ value, onChange, required, id }: Props) {
  const trimmed = value.trim();
  const isPreset = (SOURCE_PRESETS as readonly string[]).includes(trimmed);

  return (
    <div className="source-picker" id={id}>
      <div className="source-chips" role="group" aria-label="주문 경로 선택">
        {SOURCE_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className={`source-chip${trimmed === p ? ' active' : ''}`}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <input
        className="source-custom-input"
        value={isPreset ? '' : value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="또는 직접 입력 (예: TKC 카페)"
        aria-label="주문 경로 직접 입력"
      />
      {required && !trimmed && (
        <p className="source-required-hint">주문 경로를 선택하거나 입력해 주세요.</p>
      )}
    </div>
  );
}
