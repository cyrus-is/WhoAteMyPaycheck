import { useState } from 'react'
import type { FormEvent } from 'react'
import { storeApiKey, isKeyRemembered } from '../lib/apiKey'

interface ApiKeyEntryProps {
  onKey: (key: string) => void
  hasKey: boolean
}

export function ApiKeyEntry({ onKey, hasKey }: ApiKeyEntryProps) {
  const [input, setInput] = useState('')
  const [visible, setVisible] = useState(false)
  const [remember, setRemember] = useState(isKeyRemembered)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    storeApiKey(trimmed, remember)
    onKey(trimmed)
    setInput('')
  }

  const handleClear = () => {
    storeApiKey('', false)
    onKey('')
  }

  if (hasKey) {
    return (
      <div className="api-key-status">
        <span className="api-key-status__dot" />
        <span className="api-key-status__text">Claude API key set</span>
        <button className="api-key-status__clear" onClick={handleClear}>
          Clear
        </button>
      </div>
    )
  }

  return (
    <form className="api-key-form" onSubmit={handleSubmit}>
      <label htmlFor="api-key-input" className="api-key-form__label">
        Claude API key{' '}
        <span className="api-key-form__hint">
          (never sent to our servers — your browser calls Claude directly)
        </span>
      </label>
      <div className="api-key-form__row">
        <input
          id="api-key-input"
          type={visible ? 'text' : 'password'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="sk-ant-api03-…"
          className="api-key-form__input"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="api-key-form__toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide key' : 'Show key'}
        >
          {visible ? '🙈' : '👁'}
        </button>
        <button type="submit" className="api-key-form__submit">
          Save
        </button>
      </div>
      <label className="api-key-form__remember">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        Remember my key
      </label>
    </form>
  )
}
