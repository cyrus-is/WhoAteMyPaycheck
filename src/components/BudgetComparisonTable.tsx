import type { BudgetComparisonResult, BudgetComparison } from '../lib/budget-types'

interface BudgetComparisonTableProps {
  result: BudgetComparisonResult
}

function formatDiff(diff: number): string {
  const sign = diff > 0 ? '+' : ''
  return `${sign}$${Math.abs(diff).toFixed(2)}`
}

function percentLabel(pct: number): string {
  if (!isFinite(pct)) return '—'
  return `${pct}%`
}

/** Arrow + class for an expense row: positive diff = under budget = good */
function expenseSentiment(line: BudgetComparison): { arrow: string; cls: string } | null {
  if (line.budgeted === 0) return null
  const pct = Math.abs((line.actual - line.budgeted) / line.budgeted)
  if (pct < 0.05) return null  // neutral within ±5%
  return line.actual > line.budgeted
    ? { arrow: '↑', cls: 'sentiment--over' }
    : { arrow: '↓', cls: 'sentiment--under' }
}

/** Arrow + class for an income row: positive diff = above budget = good */
function incomeSentiment(line: BudgetComparison): { arrow: string; cls: string } | null {
  if (line.budgeted === 0) return null
  const pct = Math.abs((line.actual - line.budgeted) / line.budgeted)
  if (pct < 0.05) return null
  return line.actual >= line.budgeted
    ? { arrow: '↑', cls: 'sentiment--good' }
    : { arrow: '↓', cls: 'sentiment--bad' }
}

export function BudgetComparisonTable({ result }: BudgetComparisonTableProps) {
  const incomeLines = result.lines.filter((l) => l.section === 'income')
  const expenseLines = result.lines.filter((l) => l.section === 'expenses')
  const hasAvg = result.lines.some((l) => l.avgPerMonth !== undefined)

  return (
    <div className="comparison-table-wrap">
      <h3 className="budget-section-title">Income vs Budget</h3>
      <table className="comparison-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Budgeted</th>
            <th>Actual</th>
            {hasAvg && <th>Avg/Mo</th>}
            <th>Difference</th>
            <th>% of Budget</th>
          </tr>
        </thead>
        <tbody>
          {incomeLines.map((line, i) => {
            const sentiment = incomeSentiment(line)
            return (
              <tr key={i} className={`comparison-row ${line.actual > line.budgeted ? 'comparison-row--over-income' : ''}`}>
                <td>{line.category}</td>
                <td>${line.budgeted.toFixed(2)}</td>
                <td>${line.actual.toFixed(2)}</td>
                {hasAvg && <td className="comparison-avg">{line.avgPerMonth !== undefined ? `$${line.avgPerMonth.toFixed(0)}` : '—'}</td>}
                <td>
                  <span className={`comparison-diff ${sentiment ? sentiment.cls : ''}`}>
                    {sentiment && <span className="sentiment-arrow">{sentiment.arrow}</span>}
                    {formatDiff(line.difference)}
                  </span>
                </td>
                <td>{percentLabel(line.percentUsed)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="comparison-total-row">
            <td><strong>Total</strong></td>
            <td><strong>${result.totalBudgetedIncome.toFixed(2)}</strong></td>
            <td><strong>${result.totalActualIncome.toFixed(2)}</strong></td>
            {hasAvg && <td />}
            <td className={result.totalActualIncome >= result.totalBudgetedIncome ? 'sentiment--good' : 'sentiment--bad'}>
              <strong>{result.totalActualIncome >= result.totalBudgetedIncome ? '+' : ''}${(result.totalActualIncome - result.totalBudgetedIncome).toFixed(2)}</strong>
            </td>
            <td />
          </tr>
        </tfoot>
      </table>

      <h3 className="budget-section-title">Expenses vs Budget</h3>
      <table className="comparison-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Budgeted</th>
            <th>Actual</th>
            {hasAvg && <th>Avg/Mo</th>}
            <th>Difference</th>
            <th>% of Budget</th>
          </tr>
        </thead>
        <tbody>
          {expenseLines.map((line, i) => {
            const overBudget = line.budgeted > 0 && line.actual > line.budgeted
            const noBudget = line.budgeted === 0
            const sentiment = expenseSentiment(line)
            return (
              <tr key={i} className={`comparison-row ${overBudget ? 'comparison-row--over-budget' : ''} ${noBudget ? 'comparison-row--unbudgeted' : ''}`}>
                <td>{line.category}</td>
                <td>{line.budgeted > 0 ? `$${line.budgeted.toFixed(2)}` : '—'}</td>
                <td>${line.actual.toFixed(2)}</td>
                {hasAvg && <td className="comparison-avg">{line.avgPerMonth !== undefined ? `$${line.avgPerMonth.toFixed(0)}` : '—'}</td>}
                <td>
                  {line.budgeted > 0 ? (
                    <span className={`comparison-diff ${sentiment ? sentiment.cls : ''}`}>
                      {sentiment && <span className="sentiment-arrow">{sentiment.arrow}</span>}
                      {formatDiff(line.difference)}
                    </span>
                  ) : '—'}
                </td>
                <td>{line.budgeted > 0 ? percentLabel(line.percentUsed) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="comparison-total-row">
            <td><strong>Total</strong></td>
            <td><strong>${result.totalBudgetedExpenses.toFixed(2)}</strong></td>
            <td><strong>${result.totalActualExpenses.toFixed(2)}</strong></td>
            {hasAvg && <td />}
            <td className={result.totalActualExpenses <= result.totalBudgetedExpenses ? 'sentiment--good' : 'sentiment--bad'}>
              <strong>{result.totalBudgetedExpenses >= result.totalActualExpenses ? '+' : ''}${(result.totalBudgetedExpenses - result.totalActualExpenses).toFixed(2)}</strong>
            </td>
            <td />
          </tr>
        </tfoot>
      </table>

      <div className="comparison-net">
        <div className={`comparison-net-item ${result.netActual >= result.netBudgeted ? 'comparison-net-item--good' : 'comparison-net-item--warn'}`}>
          <span className="comparison-net-label">Actual Net</span>
          <span className="comparison-net-value">{result.netActual >= 0 ? '+' : ''}${result.netActual.toFixed(2)}</span>
        </div>
        <div className="comparison-net-item">
          <span className="comparison-net-label">Budgeted Net</span>
          <span className="comparison-net-value">{result.netBudgeted >= 0 ? '+' : ''}${result.netBudgeted.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}
