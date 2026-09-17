import type { StatusFilter as Filter } from '../types';
import { FILTER_OPTIONS } from '../types';

interface Props {
  value: Filter;
  counts: Record<Filter, number>;
  onChange: (v: Filter) => void;
}

export function StatusFilterBar({ value, counts, onChange }: Props) {
  return (
    <div className="filter-bar" role="tablist" aria-label="상태 필터">
      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt}
          type="button"
          role="tab"
          aria-selected={value === opt}
          className={`filter-chip ${value === opt ? 'active' : ''}`}
          onClick={() => onChange(opt)}
        >
          {opt}
          <span className="filter-count">{counts[opt]}</span>
        </button>
      ))}
    </div>
  );
}
