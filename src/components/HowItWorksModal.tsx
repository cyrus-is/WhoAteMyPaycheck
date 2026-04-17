import { useEffect, useState } from 'react'
import { markHowItWorksSeen } from '../lib/howItWorksSeen'

const SLIDES = [
  {
    src: '/images/imported-transactions.png',
    title: 'See where your money flows',
    desc: 'A Sankey diagram turns your CSV exports into an instant picture of income sources vs. spending categories.',
  },
  {
    src: '/images/auto-categorize.png',
    title: 'Auto-categorize in seconds',
    desc: "Claude reads your merchant names and assigns categories — no rules to write, no manual tagging.",
  },
  {
    src: '/images/auto-budget.png',
    title: 'Build a budget from reality',
    desc: 'Generate a monthly budget from your actual spending patterns, then track against it next month.',
  },
  {
    src: '/images/us-tax-view.png',
    title: 'Tax deduction lens',
    desc: 'Switch to the tax view to spot deductible expenses and export a CPA-ready CSV in one click.',
  },
  {
    src: '/images/essentials-view.png',
    title: 'Needs vs. wants',
    desc: 'The essentials lens separates fixed commitments from variable and discretionary spending.',
  },
]

interface HowItWorksModalProps {
  open: boolean
  onClose: () => void
}

export function HowItWorksModal({ open, onClose }: HowItWorksModalProps) {
  const [slide, setSlide] = useState(0)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Reset carousel when modal reopens
  useEffect(() => { if (open) setSlide(0) }, [open])

  if (!open) return null

  const prev = () => setSlide((s) => (s - 1 + SLIDES.length) % SLIDES.length)
  const next = () => setSlide((s) => (s + 1) % SLIDES.length)

  const handleClose = () => {
    markHowItWorksSeen()
    onClose()
  }

  return (
    <div className="hiw-backdrop" onClick={handleClose} role="dialog" aria-modal="true" aria-label="How WhoAteMyPaycheck works">
      <div className="hiw-modal" onClick={(e) => e.stopPropagation()}>
        <button className="hiw-close" onClick={handleClose} aria-label="Close">✕</button>

        {/* Screenshot carousel */}
        <div className="hiw-carousel">
          <div className="hiw-carousel__img-wrap">
            <img
              key={slide}
              src={SLIDES[slide].src}
              alt={SLIDES[slide].title}
              className="hiw-carousel__img"
            />
            <button className="hiw-carousel__arrow hiw-carousel__arrow--prev" onClick={prev} aria-label="Previous">‹</button>
            <button className="hiw-carousel__arrow hiw-carousel__arrow--next" onClick={next} aria-label="Next">›</button>
          </div>
          <div className="hiw-carousel__caption">
            <strong className="hiw-carousel__caption-title">{SLIDES[slide].title}</strong>
            <span className="hiw-carousel__caption-desc">{SLIDES[slide].desc}</span>
          </div>
          <div className="hiw-carousel__dots">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                className={`hiw-carousel__dot${i === slide ? ' hiw-carousel__dot--active' : ''}`}
                onClick={() => setSlide(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>

        <h2 className="hiw-title">We care about your privacy</h2>

        <section className="hiw-section">
          <h3 className="hiw-section-title">Your data never leaves your browser</h3>
          <p>
            This is a fully client-side app. Your CSV files are parsed locally in your browser — no
            upload, no server, no account. The only outbound request is to Anthropic's Claude API
            for categorization, and even then we only send merchant names and amounts (never account
            numbers, balances, or personal details).
          </p>
        </section>

        <section className="hiw-section">
          <h3 className="hiw-section-title">Getting an Anthropic API key</h3>
          <ol className="hiw-steps">
            <li>Go to <strong>console.anthropic.com</strong> and create a free account.</li>
            <li>In the sidebar, click <strong>API Keys</strong> → <strong>Create Key</strong>.</li>
            <li>Copy the key (it starts with <code>sk-ant-</code>) and paste it into the API key field at the top of this page.</li>
            <li>The key is stored only in your browser's session memory — it disappears when you close the tab.</li>
            <li>Save it somewhere you can find it later.</li>
          </ol>
          <p className="hiw-note">
            Categorizing a month of transactions typically costs a few cents. You only pay for what you use.
          </p>
        </section>

        <section className="hiw-section">
          <h3 className="hiw-section-title">How categorization works</h3>
          <p>
            When you click <em>Categorize with Claude</em>, the app sends batches of merchant names
            and amounts directly from your browser to Claude. Claude assigns each transaction a
            category and subcategory. Results are cached in your session so re-categorizing is
            instant for anything already seen.
          </p>
        </section>

        <section className="hiw-section">
          <h3 className="hiw-section-title">What we don't do</h3>
          <ul className="hiw-list">
            <li>No analytics or tracking — there is no telemetry.</li>
            <li>No login or account required.</li>
            <li>No data stored on any server we control.</li>
            <li>No bank credentials — you export CSVs yourself.</li>
          </ul>
        </section>

        <section className="hiw-section">
          <h3 className="hiw-section-title">Open source &amp; self-hosting</h3>
          <p>
            WhoAteMyPaycheck is fully open source under the{' '}
            <a
              href="https://github.com/cyrus-is/WhoAteMyPaycheck"
              target="_blank"
              rel="noopener noreferrer"
              className="hiw-link"
            >
              cyrus-is/WhoAteMyPaycheck
            </a>{' '}
            repository on GitHub. Because it's a static site with no backend, you can self-host
            your own instance in minutes:
          </p>
          <ol className="hiw-steps">
            <li>Clone the repo and run <code>npm install && npm run build</code>.</li>
            <li>Deploy the <code>dist/</code> folder to any static host — S3, Vercel, Cloudflare Pages, etc.</li>
            <li>Your instance only ever calls the Anthropic API with the key you provide.</li>
          </ol>
        </section>

        <button className="hiw-cta" onClick={handleClose}>Got it</button>
      </div>
    </div>
  )
}
