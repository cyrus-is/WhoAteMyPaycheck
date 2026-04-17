import { useState } from 'react'
import type { Budget, BudgetLine, BudgetLineType } from '../lib/budget-types'

interface BudgetTableProps {
  budget: Budget
  onUpdate: (updated: Budget) => void
}

const TYPE_LABELS: Record<BudgetLineType, string> = {
  'fixed': 'Fixed',
  'variable-predictable': 'Variable',
  'variable-discretionary': 'Discretionary',
  'one-time': 'One-time',
}

interface EditableAmountProps {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}

function EditableAmount({ value, onChange, disabled }: EditableAmountProps) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')

  if (disabled) {
    return <span className="budget-amount budget-amount--disabled">—</span>
  }

  if (editing) {
    return (
      <input
        className="budget-amount-input"
        type="number"
        min="0"
        step="0.01"
        value={raw}
        autoFocus
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => {
          const parsed = parseFloat(raw)
          if (!isNaN(parsed) && parsed >= 0) {
            onChange(Math.round(parsed * 100) / 100)
          }
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <button
      className="budget-amount"
      onClick={() => {
        setRaw(value.toFixed(2))
        setEditing(true)
      }}
      title="Click to edit"
    >
      ${value.toFixed(2)}
    </button>
  )
}

interface EditableNotesProps {
  value: string
  onChange: (value: string) => void
}

function EditableNotes({ value, onChange }: EditableNotesProps) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')

  if (editing) {
    return (
      <input
        className="budget-notes-input"
        type="text"
        value={raw}
        autoFocus
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => {
          onChange(raw.trim())
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <button
      className="budget-notes"
      onClick={() => {
        setRaw(value)
        setEditing(true)
      }}
      title="Click to edit notes"
    >
      {value || <span className="budget-notes--empty">add note…</span>}
    </button>
  )
}

function updateLine(lines: BudgetLine[], index: number, patch: Partial<BudgetLine>): BudgetLine[] {
  return lines.map((l, i) => (i === index ? { ...l, ...patch } : l))
}

export function BudgetTable({ budget, onUpdate }: BudgetTableProps) {
  function handleIncomeAmount(index: number, amount: number) {
    const income = updateLine(budget.income, index, { amount })
    const totalIncome = income.reduce((s, l) => s + l.amount, 0)
    onUpdate({ ...budget, income, totalIncome: Math.round(totalIncome * 100) / 100 })
  }

  function handleIncomeNotes(index: number, notes: string) {
    const income = updateLine(budget.income, index, { notes })
    onUpdate({ ...budget, income })
  }

  function handleExpenseAmount(index: number, amount: number) {
    const expenses = updateLine(budget.expenses, index, { amount })
    const totalExpenses = expenses
      .filter((l) => l.type !== 'one-time')
      .reduce((s, l) => s + l.amount, 0)
    onUpdate({ ...budget, expenses, totalExpenses: Math.round(totalExpenses * 100) / 100 })
  }

  function handleExpenseNotes(index: number, notes: string) {
    const expenses = updateLine(budget.expenses, index, { notes })
    onUpdate({ ...budget, expenses })
  }

  const totalIncome = budget.income.reduce((s, l) => s + l.amount, 0)
  const totalExpenses = budget.expenses
    .filter((l) => l.type !== 'one-time')
    .reduce((s, l) => s + l.amount, 0)
  const surplus = totalIncome - totalExpenses

  return (
    <div className="budget-table-wrap">
      <h3 className="budget-section-title">Income</h3>
      <table className="budget-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Type</th>
            <th>Monthly</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {budget.income.map((line, i) => (
            <tr key={`income-${i}`} className={`budget-row budget-row--${line.type}`}>
              <td>{line.category}</td>
              <td><span className="budget-type-badge">{TYPE_LABELS[line.type]}</span></td>
              <td><EditableAmount value={line.amount} onChange={(v) => handleIncomeAmount(i, v)} /></td>
              <td><EditableNotes value={line.notes} onChange={(v) => handleIncomeNotes(i, v)} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="budget-total-row">
            <td colSpan={2}><strong>Total Income</strong></td>
            <td><strong>${totalIncome.toFixed(2)}</strong></td>
            <td />
          </tr>
        </tfoot>
      </table>

      <h3 className="budget-section-title">Expenses</h3>
      <table className="budget-table">
        <thead>
          <tr>
            <th>Category / Merchant</th>
            <th>Type</th>
            <th>Monthly</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {budget.expenses.map((line, i) => (
            <tr key={`expense-${i}`} className={`budget-row budget-row--${line.type}`}>
              <td>{line.merchant ?? line.category}</td>
              <td><span className="budget-type-badge">{TYPE_LABELS[line.type]}</span></td>
              <td>
                <EditableAmount
                  value={line.amount}
                  onChange={(v) => handleExpenseAmount(i, v)}
                  disabled={line.type === 'one-time'}
                />
              </td>
              <td><EditableNotes value={line.notes} onChange={(v) => handleExpenseNotes(i, v)} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="budget-total-row">
            <td colSpan={2}><strong>Total Expenses</strong></td>
            <td><strong>${totalExpenses.toFixed(2)}</strong></td>
            <td />
          </tr>
          <tr className={`budget-surplus-row ${surplus >= 0 ? 'budget-surplus-row--positive' : 'budget-surplus-row--negative'}`}>
            <td colSpan={2}><strong>{surplus >= 0 ? 'Monthly Surplus' : 'Monthly Deficit'}</strong></td>
            <td><strong>{surplus >= 0 ? '+' : ''}${surplus.toFixed(2)}</strong></td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
