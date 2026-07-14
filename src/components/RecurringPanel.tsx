import type { RecurringMerchant } from '../lib/budget-types'
import { monthlyEquivalent, DRIFT_THRESHOLD, driftFraction } from '../lib/recurring'

interface RecurringPanelProps {
  merchants: RecurringMerchant[]
}

const CADENCE_LABELS: Record<RecurringMerchant['cadence'], string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function RecurringPanel({ merchants }: RecurringPanelProps) {
  if (merchants.length === 0) return null

  // Total is built from averageAmount (not lastAmount) even for fixed merchants — intentionally
  // smooths one-off blips rather than jumping on a single payment; the per-row drift flag below
  // is what surfaces a sustained price change to the user.
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
            const drift = driftFraction(m)
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
