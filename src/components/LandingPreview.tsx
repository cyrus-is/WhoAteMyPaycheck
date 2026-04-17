const SLIDES = [
  {
    src: '/images/auto-categorize.png',
    title: 'Auto-categorize in seconds',
    desc: 'Claude reads your merchant names and assigns categories — no rules to write.',
  },
  {
    src: '/images/imported-transactions.png',
    title: 'See where your money flows',
    desc: 'A Sankey diagram turns raw CSV data into an instant picture of income vs. spending.',
  },
  {
    src: '/images/auto-budget.png',
    title: 'Build a budget from reality',
    desc: 'Generate a monthly budget from your actual spending patterns, not guesswork.',
  },
  {
    src: '/images/us-tax-view.png',
    title: 'Tax deduction lens',
    desc: 'Switch to the tax view to spot deductible expenses and export a CPA-ready CSV.',
  },
  {
    src: '/images/essentials-view.png',
    title: 'Needs vs. wants',
    desc: 'The essentials lens separates fixed commitments from discretionary spending.',
  },
]

export function LandingPreview() {
  return (
    <div className="landing-preview">
      <p className="landing-preview__lead">
        Drag your bank's CSV export onto the drop zone above — no account login, no data upload.
        Everything runs in your browser.
      </p>

      <div className="landing-preview__grid">
        {SLIDES.map((s) => (
          <figure key={s.src} className="landing-card">
            <div className="landing-card__img-wrap">
              <img src={s.src} alt={s.title} className="landing-card__img" loading="lazy" />
            </div>
            <figcaption className="landing-card__caption">
              <strong className="landing-card__title">{s.title}</strong>
              <span className="landing-card__desc">{s.desc}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}
