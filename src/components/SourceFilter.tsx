import type { SourceFilter } from '../sources';

interface Props {
  options: string[];
  value: SourceFilter;
  onChange: (v: SourceFilter) => void;
}

export function SourceFilterBar({ options, value, onChange }: Props) {
  return (
    <div className="filter-bar source-filter-bar" role="tablist" aria-label="주문 경로 필터">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          role="tab"
          aria-selected={value === opt}
          className={`filter-chip source-filter-chip${value === opt ? ' active' : ''}`}
          onClick={() => onChange(opt)}
        >
          {opt === '전체' ? '경로 전체' : opt}
        </button>
      ))}
    </div>
  );
}
