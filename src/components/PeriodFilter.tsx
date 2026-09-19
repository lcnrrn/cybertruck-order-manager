import type { PeriodRange } from '../types';
import { PERIOD_PRESETS, formatPeriodLabel } from '../period';

interface Props {
  value: PeriodRange;
  onChange: (v: PeriodRange) => void;
}

export function PeriodFilterBar({ value, onChange }: Props) {
  return (
    <div className="period-filter">
      <div className="filter-bar period-preset-bar" role="tablist" aria-label="기간 필터">
        {PERIOD_PRESETS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={value.preset === opt.id}
            className={`filter-chip ${value.preset === opt.id ? 'active' : ''}`}
            onClick={() =>
              onChange(
                opt.id === 'custom'
                  ? { preset: 'custom', from: value.from, to: value.to }
                  : { preset: opt.id },
              )
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {value.preset === 'custom' && (
        <div className="period-custom-row">
          <label className="period-date-field">
            <span>시작</span>
            <input
              type="date"
              value={value.from || ''}
              onChange={(e) => onChange({ ...value, preset: 'custom', from: e.target.value || undefined })}
            />
          </label>
          <span className="period-tilde" aria-hidden>
            ~
          </span>
          <label className="period-date-field">
            <span>종료</span>
            <input
              type="date"
              value={value.to || ''}
              onChange={(e) => onChange({ ...value, preset: 'custom', to: e.target.value || undefined })}
            />
          </label>
        </div>
      )}

      <p className="period-active-label" aria-live="polite">
        기간 · {formatPeriodLabel(value)}
      </p>
    </div>
  );
}
