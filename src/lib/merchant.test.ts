import { describe, it, expect } from 'vitest'
import { normalizeMerchant, stripProcessorPrefix, PROCESSOR_PREFIXES } from './merchant'

describe('normalizeMerchant', () => {
  it('uppercases the description', () => {
    expect(normalizeMerchant('starbucks').canonical).toBe('STARBUCKS')
  })

  it('strips a single processor prefix', () => {
    expect(normalizeMerchant('SQ *BLUE BOTTLE COFFEE').canonical).toBe('BLUE BOTTLE COFFEE')
  })

  it('strips stacked processor prefixes in one call', () => {
    // "POS DEBIT" then "SQ *" — the old single-pass stripProcessorPrefix needed two calls
    expect(normalizeMerchant('POS DEBIT SQ *BLUE BOTTLE').canonical).toBe('BLUE BOTTLE')
    expect(normalizeMerchant('RECURRING PAYMENT TST* CHICK-FIL-A').canonical).toBe('CHICK-FIL-A')
    expect(normalizeMerchant('CHECKCARD PAYPAL *DUNKIN').canonical).toBe('DUNKIN')
  })

  it('strips store numbers', () => {
    expect(normalizeMerchant('STARBUCKS #1024').canonical).toBe('STARBUCKS')
    expect(normalizeMerchant('CVS PHARMACY #00412').canonical).toBe('CVS PHARMACY')
  })

  it('strips trailing order ids containing digits', () => {
    expect(normalizeMerchant('SOME STORE *8N3LQ7PK5').canonical).toBe('SOME STORE')
    expect(normalizeMerchant('AIRBNB *HM1234567').canonical).toBe('AIRBNB')
  })

  it('does not strip a real trailing word mistaken for an order id', () => {
    // "RESY *RESTAURANT" — no digits in the trailing token, so it must survive intact
    expect(normalizeMerchant('RESY *RESTAURANT').canonical).toBe('RESY *RESTAURANT')
  })

  it('strips trailing city/state suffixes', () => {
    expect(normalizeMerchant('BLUE BOTTLE COFFEE AUSTIN TX').canonical).toBe('BLUE BOTTLE COFFEE AUSTIN')
    expect(normalizeMerchant('SHELL OIL 57442 SAN FRANCISCO CA').canonical).toBe('SHELL OIL 57442 SAN FRANCISCO')
  })

  it('does not strip a short brand abbreviation mistaken for a state code', () => {
    expect(normalizeMerchant('RIVERSIDE ELECTRIC CO-OP').canonical).toBe('RIVERSIDE ELECTRIC CO-OP')
    expect(normalizeMerchant('BP#1234567 HOUSTON TX').canonical).toBe('BP HOUSTON')
  })

  it('strips masked card / phone suffixes', () => {
    expect(normalizeMerchant('ONLINE TRANSFER TO SAV ...4821').canonical).toBe('ONLINE TRANSFER TO SAV')
    expect(normalizeMerchant('ZOOM.US 888-799-9666').canonical).toBe('ZOOM.US')
  })

  it('collapses whitespace produced by stripping', () => {
    expect(normalizeMerchant('BP#1234567 HOUSTON TX').canonical).not.toContain('  ')
  })

  it('returns an empty canonical/tokens for an empty description', () => {
    expect(normalizeMerchant('').canonical).toBe('')
    expect(normalizeMerchant('   ').tokens).toEqual([])
  })

  it('splits canonical into tokens', () => {
    expect(normalizeMerchant('BLUE BOTTLE COFFEE').tokens).toEqual(['BLUE', 'BOTTLE', 'COFFEE'])
  })
})

describe('stripProcessorPrefix (re-exported, single-pass helper)', () => {
  it('strips a known prefix', () => {
    expect(stripProcessorPrefix('SQ *BLUE BOTTLE COFFEE')).toBe('BLUE BOTTLE COFFEE')
  })

  it('leaves unknown prefixes alone', () => {
    expect(stripProcessorPrefix('RANDOM MERCHANT')).toBe('RANDOM MERCHANT')
  })
})

describe('PROCESSOR_PREFIXES', () => {
  it('is re-exported with its known set of patterns', () => {
    expect(PROCESSOR_PREFIXES.length).toBeGreaterThanOrEqual(10)
  })
})
