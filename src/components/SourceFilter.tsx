import type { SourceFilter } from '../sources';
import { getSourceColor } from '../sources';

interface Props {
  options: string[];
  value: SourceFilter;
  onChange: (v: SourceFilter) => void;
}

export function SourceFilterBar({ options, value, onChange }: Props) {
  return (
    <div className="filter-bar source-filter-bar" role="tablist" aria-label="주문 경로 필터">
      {options.map((opt) => {
        const active = value === opt;
        const isAll = opt === '전체';
        const c = isAll ? null : getSourceColor(opt);
        return (
          <button
            key={opt}
            type="button"
            role="tab"
            aria-selected={active}
            className={`filter-chip source-filter-chip${active ? ' active' : ''}`}
            style={
              c
                ? {
                    background: active ? c.bg : 'var(--bg-elevated)',
                    borderColor: active ? c.border : c.border,
                    color: active ? c.text : c.text,
                    opacity: active ? 1 : 0.75,
                  }
                : undefined
            }
            onClick={() => onChange(opt)}
          >
            {isAll ? '경로 전체' : opt}
          </button>
        );
      })}
    </div>
  );
}
