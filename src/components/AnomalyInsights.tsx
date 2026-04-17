import type { AnomalyResult } from '../lib/anomaly'

interface AnomalyInsightsProps {
  anomalies: AnomalyResult[]
}

export function AnomalyInsights({ anomalies }: AnomalyInsightsProps) {
  if (anomalies.length === 0) return null

  return (
    <div className="anomaly-insights">
      <span className="anomaly-insights__label">Spending insights</span>
      <ul className="anomaly-insights__list">
        {anomalies.map((a) => (
          <li key={a.category} className={`anomaly-item anomaly-item--${a.direction}`}>
            <span className="anomaly-item__arrow">{a.direction === 'above' ? '↑' : '↓'}</span>
            <span className="anomaly-item__category">{a.category}</span>
            <span className="anomaly-item__pct">{a.percentChange}%</span>
            <span className="anomaly-item__context">
              {a.direction === 'above' ? 'above' : 'below'} avg
              <span className="anomaly-item__detail">
                (${a.currentPerMonth.toFixed(0)}/mo vs avg ${a.historicalAvg.toFixed(0)}/mo)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
