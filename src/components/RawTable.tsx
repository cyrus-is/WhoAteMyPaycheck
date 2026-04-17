import type { LoadedFile } from '../lib/types'

interface RawTableProps {
  files: LoadedFile[]
  onRemove: (id: string) => void
}

export function RawTable({ files, onRemove }: RawTableProps) {
  // Only show files that have raw rows (parse failed) or have been successfully parsed
  const visible = files.filter((f) => (f.rawRows?.length ?? 0) > 0 || f.transactions.length > 0)
  if (visible.length === 0) return null

  return (
    <div className="raw-table-section">
      {visible.map((file) => {
        const rows = file.rawRows ?? []
        return (
          <div key={file.id} className="raw-table-card">
            <div className="raw-table-card__header">
              <div>
                <span className="raw-table-card__name">{file.name}</span>
                {file.transactions.length > 0 ? (
                  <span className="raw-table-card__count">{file.transactions.length} transactions parsed</span>
                ) : (
                  <span className="raw-table-card__count raw-table-card__count--warn">
                    {rows.length} rows — format not detected
                  </span>
                )}
              </div>
              <button
                className="raw-table-card__remove"
                onClick={() => onRemove(file.id)}
                aria-label={`Remove ${file.name}`}
              >
                ✕
              </button>
            </div>
            {rows.length > 0 && (
              <div className="raw-table-scroll">
                <table className="raw-table">
                  <thead>
                    <tr>
                      {file.rawHeaders.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((row, i) => (
                      <tr key={i}>
                        {file.rawHeaders.map((h) => (
                          <td key={h}>{row[h] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 10 && (
                  <p className="raw-table__more">… and {rows.length - 10} more rows</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
