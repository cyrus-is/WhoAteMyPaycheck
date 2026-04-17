import { useState } from 'react'

interface CategoryVisibilityToggleProps {
  /** All expense categories present in the current view, with their total spend */
  categories: { name: string; amount: number }[]
  hidden: Set<string>
  onChange: (hidden: Set<string>) => void
}

export function CategoryVisibilityToggle({ categories, hidden, onChange }: CategoryVisibilityToggleProps) {
  const [expanded, setExpanded] = useState(false)

  if (categories.length === 0) return null

  function toggle(name: string) {
    const next = new Set(hidden)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    onChange(next)
  }

  function showAll() { onChange(new Set()) }

  const hiddenCount = categories.filter((c) => hidden.has(c.name)).length

  return (
    <div className="cat-visibility">
      <button
        className="cat-visibility__toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span>Filter categories</span>
        {hiddenCount > 0 && (
          <span className="cat-visibility__badge">{hiddenCount} hidden</span>
        )}
        <span className="cat-visibility__chevron">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="cat-visibility__panel">
          {categories.map((c) => (
            <label key={c.name} className={`cat-visibility__item ${hidden.has(c.name) ? 'cat-visibility__item--hidden' : ''}`}>
              <input
                type="checkbox"
                checked={!hidden.has(c.name)}
                onChange={() => toggle(c.name)}
              />
              <span className="cat-visibility__name">{c.name}</span>
              <span className="cat-visibility__amount">${c.amount.toFixed(0)}</span>
            </label>
          ))}
          {hiddenCount > 0 && (
            <button className="cat-visibility__show-all" onClick={showAll}>
              Show all
            </button>
          )}
        </div>
      )}
    </div>
  )
}
