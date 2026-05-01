import { useEffect, useMemo, useRef, useState } from 'react'

function normalizeValue(value) {
  return String(value ?? '').trim().toLowerCase()
}

function formatCount(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return '0'
  return numeric.toLocaleString('en-US')
}

function GenreName({ label, count }) {
  return (
    <span className="genre-picker-name">
      <span>{label}</span>
      <sub className="genre-picker-count">{formatCount(count)}</sub>
    </span>
  )
}

function GenreDropdown({
  label = 'Genre',
  value = 'all',
  options = [],
  totalCount = 0,
  onChange,
  align = 'left',
  className = '',
  style,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef(null)

  const normalizedValue = normalizeValue(value)
  const selectedOption = useMemo(
    () => options.find((option) => normalizeValue(option.value) === normalizedValue),
    [normalizedValue, options],
  )
  const selectedLabel = normalizedValue === 'all'
    ? 'All Genres'
    : selectedOption?.label || selectedOption?.value || value
  const selectedCount = normalizedValue === 'all' ? totalCount : selectedOption?.count || 0

  useEffect(() => {
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  function selectGenre(nextValue) {
    onChange?.(nextValue)
    setIsOpen(false)
  }

  return (
    <div ref={rootRef} className={`genre-picker space-y-1 ${className}`} style={style}>
      <span className="muted-label">{label}</span>
      <button
        type="button"
        className="genre-picker-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <GenreName label={selectedLabel} count={selectedCount} />
        <span className="genre-picker-caret" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          className={`genre-picker-menu ${align === 'right' ? 'genre-picker-menu-right' : ''}`}
          role="listbox"
          aria-label={label}
        >
          <div className="genre-picker-grid">
            <button
              type="button"
              role="option"
              aria-selected={normalizedValue === 'all'}
              className={`genre-picker-option ${normalizedValue === 'all' ? 'genre-picker-option-active' : ''}`}
              onClick={() => selectGenre('all')}
            >
              <GenreName label="All Genres" count={totalCount} />
            </button>

            {options.map((option) => {
              const active = normalizeValue(option.value) === normalizedValue

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`genre-picker-option ${active ? 'genre-picker-option-active' : ''}`}
                  onClick={() => selectGenre(option.value)}
                >
                  <GenreName label={option.label || option.value} count={option.count || 0} />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default GenreDropdown
