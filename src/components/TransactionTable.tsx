import type { Transaction } from '../lib/types'
import { CATEGORIES } from '../lib/types'

interface TransactionTableProps {
  transactions: Transaction[]
  overrides: Record<string, string>
  onOverride: (id: string, category: string) => void
}

function buildReportUrl(tx: Transaction, originalCategory: string, correctedCategory: string): string {
  const title = encodeURIComponent(`Misclassification: "${tx.description}" → ${correctedCategory}`)
  const body = encodeURIComponent(
    `**Description:** ${tx.description}\n` +
    `**Amount:** $${tx.amount.toFixed(2)}\n` +
    `**Type:** ${tx.type}\n` +
    `**Classified as:** ${originalCategory}${tx.subcategory ? ` / ${tx.subcategory}` : ''}\n` +
    `**Correct category:** ${correctedCategory}\n\n` +
    `---\n_Reported via the in-app misclassification tool. ` +
    `Do not include sensitive information — this becomes a public GitHub issue._`
  )
  return `https://github.com/cyrus-is/spending-sankey/issues/new?title=${title}&body=${body}&labels=misclassification`
}

export function TransactionTable({ transactions, overrides, onOverride }: TransactionTableProps) {
  if (transactions.length === 0) return null

  const sorted = [...transactions].sort((a, b) => b.date.getTime() - a.date.getTime())

  return (
    <div className="tx-table-wrap">
      <div className="tx-table-header">
        <h2>Transactions</h2>
        <span className="tx-table-count">{transactions.length} transactions</span>
      </div>
      <div className="tx-table-scroll">
        <table className="tx-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Type</th>
              <th>Category</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((tx) => {
              const cat = overrides[tx.id] ?? tx.category
              const isCorrected = !!overrides[tx.id] && overrides[tx.id] !== tx.category
              return (
                <tr key={tx.id} className={tx.type === 'credit' ? 'tx-row--credit' : ''}>
                  <td className="tx-date">{tx.date.toLocaleDateString()}</td>
                  <td className="tx-desc">{tx.description}</td>
                  <td className={`tx-amount tx-amount--${tx.type}`}>
                    {tx.type === 'credit' ? '+' : '-'}${tx.amount.toFixed(2)}
                  </td>
                  <td>{tx.type}</td>
                  <td>
                    <select
                      value={cat}
                      onChange={(e) => onOverride(tx.id, e.target.value)}
                      className="tx-category-select"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    {tx.subcategory && <span className="tx-subcategory"> · {tx.subcategory}</span>}
                    {isCorrected && (
                      <span className="tx-report-wrap">
                        <a
                          className="tx-report-link"
                          href={buildReportUrl(tx, tx.category, overrides[tx.id])}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Report this misclassification to help improve the classifier. Opens a public GitHub issue — don't click if the transaction details are private."
                        >
                          Report misclassification
                        </a>
                      </span>
                    )}
                  </td>
                  <td className="tx-source">{tx.sourceFile}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
