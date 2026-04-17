import { useCallback, useRef, useState } from 'react'
import type { DragEvent, ChangeEvent } from 'react'

interface DropZoneProps {
  onFiles: (files: File[]) => void
  disabled?: boolean
}

export function DropZone({ onFiles, disabled }: DropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragging(false)
      if (disabled) return
      const files = Array.from(e.dataTransfer.files).filter(
        (f) => f.name.endsWith('.csv') || f.type === 'text/csv',
      )
      if (files.length > 0) onFiles(files)
    },
    [onFiles, disabled],
  )

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragging(false)
  }, [])

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      if (files.length > 0) onFiles(files)
      // reset so same file can be re-added
      if (inputRef.current) inputRef.current.value = ''
    },
    [onFiles],
  )

  return (
    <div
      className={`drop-zone ${dragging ? 'drop-zone--dragging' : ''} ${disabled ? 'drop-zone--disabled' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
      aria-label="Drop CSV files here or click to browse"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        multiple
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />
      <div className="drop-zone__icon">📂</div>
      <p className="drop-zone__title">Drop your bank CSVs here</p>
      <p className="drop-zone__subtitle">
        Chase, BofA, Amex, Ally — any bank CSV works. Multiple files at once.
      </p>
      <button className="drop-zone__btn" tabIndex={-1} disabled={disabled}>
        Browse files
      </button>
    </div>
  )
}
