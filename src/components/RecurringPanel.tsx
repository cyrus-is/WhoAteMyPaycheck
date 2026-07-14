import type { RecurringMerchant } from '../lib/budget-types'

interface RecurringPanelProps {
  merchants: RecurringMerchant[]
}

const CADENCE_LABELS: Record<RecurringMerchant['cadence'], string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
}

/** Amount a merchant would cost per month if its cadence were normalized to monthly */
function monthlyEquivalent(merchant: RecurringMerchant): number {
  return (
    merchant.cadence === 'weekly'    ? merchant.averageAmount * 4.33 :
    merchant.cadence === 'quarterly' ? merchant.averageAmount / 3    :
    merchant.averageAmount  // monthly
  )
}

/** Drift threshold above which the last payment is visually flagged vs. the average */
const DRIFT_THRESHOLD = 0.05

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function RecurringPanel({ merchants }: RecurringPanelProps) {
  if (merchants.length === 0) return null

  const monthlyTotal = merchants.reduce((sum, m) => sum + monthlyEquivalent(m), 0)
  const sorted = [...merchants].sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a))

  return (
    <section className="recurring-panel">
      <div className="recurring-panel__header">
        <h2 className="recurring-panel__title">Recurring subscriptions</h2>
        <span className="recurring-panel__total">
          {formatCurrency(monthlyTotal)}
          <span className="recurring-panel__total-unit">/mo</span>
        </span>
      </div>

      <table className="recurring-table">
        <thead>
          <tr>
            <th>Merchant</th>
            <th>Cadence</th>
            <th>Average</th>
            <th>Last</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => {
            const drift = m.averageAmount > 0 ? (m.lastAmount - m.averageAmount) / m.averageAmount : 0
            const drifted = Math.abs(drift) > DRIFT_THRESHOLD
            return (
              <tr key={m.merchant} className={`recurring-row${drifted ? ' recurring-row--drift' : ''}`}>
                <td>
                  <span className="recurring-row__merchant">{m.merchant}</span>
                  <span className="recurring-row__category">{m.category}</span>
                </td>
                <td>{CADENCE_LABELS[m.cadence]}</td>
                <td>{formatCurrency(m.averageAmount)}</td>
                <td>
                  {formatCurrency(m.lastAmount)}
                  {drifted && (
                    <span
                      className="recurring-row__drift-flag"
                      title={`${drift > 0 ? '+' : ''}${(drift * 100).toFixed(1)}% vs average`}
                    >
                      {drift > 0 ? '▲' : '▼'} {Math.abs(drift * 100).toFixed(0)}%
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
