import type { ChangeEvent } from 'react'

export interface DateRange {
  start: string  // YYYY-MM-DD
  end: string    // YYYY-MM-DD
}

interface DateFilterProps {
  range: DateRange
  minDate: string
  maxDate: string
  onChange: (range: DateRange) => void
}

/** Format a local Date as YYYY-MM-DD without UTC conversion */
function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Return the last day of the most-recent COMPLETE calendar month relative to maxDate.
 * A month is "complete" if maxDate falls on its last day; otherwise the previous month is used.
 * This keeps presets anchored to the data rather than today's date, so historical
 * datasets always produce useful ranges instead of an empty Sankey.
 */
function lastCompleteMonthEnd(maxDate: string): Date {
  const d = new Date(maxDate + 'T12:00:00')
  const lastOfSameMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  if (d.getDate() >= lastOfSameMonth.getDate()) {
    // maxDate is the last day of its month → that month is complete
    return lastOfSameMonth
  }
  // maxDate is mid-month → last complete month is the one before
  return new Date(d.getFullYear(), d.getMonth(), 0)
}

export function DateFilter({ range, minDate, maxDate, onChange }: DateFilterProps) {
  const handleStart = (e: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...range, start: e.target.value })

  const handleEnd = (e: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...range, end: e.target.value })

  // All presets anchor to the data's last complete month so they work with
  // any dataset period, not just current-day uploads.
  const setLastMonth = () => {
    const end = lastCompleteMonthEnd(maxDate)
    const start = new Date(end.getFullYear(), end.getMonth(), 1)
    onChange({ start: fmt(start), end: fmt(end) })
  }

  const setLast3Months = () => {
    const end = lastCompleteMonthEnd(maxDate)
    // Start: first day of the month that is 2 months before end's month
    const start = new Date(end.getFullYear(), end.getMonth() - 2, 1)
    onChange({ start: fmt(start), end: fmt(end) })
  }

  const setLastYear = () => {
    const end = lastCompleteMonthEnd(maxDate)
    // 12 complete months: start is the first day of end's month one year prior
    const start = new Date(end.getFullYear() - 1, end.getMonth(), 1)
    onChange({ start: fmt(start), end: fmt(end) })
  }

  const setAllTime = () => onChange({ start: minDate, end: maxDate })

  // Detect which preset is active (if any)
  const lastMonthEnd = lastCompleteMonthEnd(maxDate)
  const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1)
  const last3End = lastMonthEnd
  const last3Start = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth() - 2, 1)
  const lastYearEnd = lastMonthEnd
  const lastYearStart = new Date(lastMonthEnd.getFullYear() - 1, lastMonthEnd.getMonth(), 1)

  const active =
    range.start === minDate && range.end === maxDate ? 'all' :
    range.start === fmt(lastYearStart) && range.end === fmt(lastYearEnd) ? 'year' :
    range.start === fmt(last3Start) && range.end === fmt(last3End) ? '3mo' :
    range.start === fmt(lastMonthStart) && range.end === fmt(lastMonthEnd) ? '1mo' :
    null

  return (
    <div className="date-filter">
      <div className="date-filter__inputs">
        <label>
          <span className="date-filter__label">From</span>
          <input
            type="date"
            value={range.start}
            min={minDate}
            max={range.end || maxDate}
            onChange={handleStart}
            className="date-filter__input"
          />
        </label>
        <span className="date-filter__sep">–</span>
        <label>
          <span className="date-filter__label">To</span>
          <input
            type="date"
            value={range.end}
            min={range.start || minDate}
            max={maxDate}
            onChange={handleEnd}
            className="date-filter__input"
          />
        </label>
      </div>
      <div className="date-filter__shortcuts">
        <button
          className={`date-filter__btn${active === 'all' ? ' date-filter__btn--active' : ''}`}
          onClick={setAllTime}
        >All time</button>
        <button
          className={`date-filter__btn${active === 'year' ? ' date-filter__btn--active' : ''}`}
          onClick={setLastYear}
        >Last year</button>
        <button
          className={`date-filter__btn${active === '3mo' ? ' date-filter__btn--active' : ''}`}
          onClick={setLast3Months}
        >Last 3 months</button>
        <button
          className={`date-filter__btn${active === '1mo' ? ' date-filter__btn--active' : ''}`}
          onClick={setLastMonth}
        >Last month</button>
      </div>
    </div>
  )
}
