import { describe, it, expect } from 'vitest'
import { normalizeVendorName, normalizeSource } from './normalize'
import { classifyByMerchant } from './merchantLookup'

describe('normalizeVendorName', () => {
  it('maps known merchants to canonical names', () => {
    expect(normalizeVendorName('NETFLIX.COM')).toBe('Netflix')
    expect(normalizeVendorName('STARBUCKS #12345')).toBe('Starbucks')
    expect(normalizeVendorName('WHOLEFDS MKT')).toBe('Whole Foods')
    expect(normalizeVendorName('TRADER JOES')).toBe("Trader Joe's")
    expect(normalizeVendorName('AMAZON.COM*2K7LQ')).toBe('Amazon')
    expect(normalizeVendorName('UBER * TRIP')).toBe('Uber')
    expect(normalizeVendorName('UBER EATS')).toBe('Uber Eats')
    expect(normalizeVendorName('SPOTIFY USA')).toBe('Spotify')
    expect(normalizeVendorName('DOORDASH*ORDER')).toBe('DoorDash')
    expect(normalizeVendorName('PG&E ELECTRIC')).toBe('PG&E')
  })

  it('strips trailing order IDs', () => {
    const result = normalizeVendorName('SOME STORE *8N3LQ7PK5')
    expect(result).not.toContain('8N3LQ7PK5')
  })

  it('strips store numbers', () => {
    const result = normalizeVendorName('CVS PHARMACY #00412')
    expect(result).toBe('CVS Pharmacy')
  })

  it('truncates descriptions longer than 28 characters', () => {
    const long = 'SOME VERY LONG UNKNOWN MERCHANT DESCRIPTION'
    const result = normalizeVendorName(long)
    expect(result.length).toBeLessThanOrEqual(31) // 28 + '…'
    expect(result).toContain('…')
  })

  it('returns short unknown descriptions unchanged', () => {
    expect(normalizeVendorName('SHORT DESC')).toBe('SHORT DESC')
  })

  it('collapses multiple spaces', () => {
    const result = normalizeVendorName('STORE   NAME')
    expect(result).toBe('STORE NAME')
  })
})

describe('normalizeVendorName agrees with classifyByMerchant on merchant identity', () => {
  // The two used to be backed by independent merchant knowledge bases (normalize.ts's own
  // 44-entry map vs. merchantLookup.ts's rule table) that could drift — e.g. classification
  // saying "Costco Gas" while the Sankey tooltip grouped it under a separate "Costco" bucket.
  // normalizeVendorName is now built directly on classifyByMerchant, so for any description
  // that resolves to a specific (non-generic) merchant rule, the display name must be that
  // same rule's name (modulo a "(...)" disambiguator meant only for developers, e.g.
  // "Uber (ride)" -> "Uber"). Generic keyword-rule matches are covered separately below —
  // they intentionally do NOT agree, since the rule name is a category signal, not an
  // identity (e.g. every restaurant matching "\bCAFE\b" is not "the same merchant").
  const descriptions = [
    'NETFLIX.COM',
    'STARBUCKS #12345',
    'WHOLEFDS MKT',
    "TRADER JOE'S #100 SF CA",
    'AMAZON.COM*2K7LQ',
    'UBER * TRIP',
    'UBER EATS',
    'SPOTIFY USA',
    'DOORDASH*ORDER',
    'PG&E ELECTRIC',
    'CVS PHARMACY #00412',
  ]

  it.each(descriptions)('"%s"', (description) => {
    const match = classifyByMerchant(description)
    expect(match).not.toBeNull()
    expect(match!.generic).toBe(false)
    const cleanedRuleName = match!.merchant.replace(/\s*\([^)]*\)\s*$/, '')
    expect(normalizeVendorName(description)).toBe(cleanedRuleName)
  })
})

describe('normalizeVendorName falls through to canonical text for generic keyword rules', () => {
  // Generic keyword rules (PR-2 §2.A — "Rent", "Medical Clinic", "Gym"…) are category
  // signals for classification, not merchant identities. Two different apartment
  // complexes or two different clinics must stay distinct vendors for recurring
  // detection (recurring.ts), one-time-merchant exclusion (budget.ts), and Sankey vendor
  // drill-downs — collapsing them into the rule name would merge unrelated merchants.
  it('does not use the generic rule name as the display label', () => {
    const rent = classifyByMerchant('RENT PAYMENT - OAKWOOD APTS')
    expect(rent?.generic).toBe(true)
    expect(normalizeVendorName('RENT PAYMENT - OAKWOOD APTS')).not.toBe('Rent')

    const gym = classifyByMerchant('GYM MEMBERSHIP')
    expect(gym?.generic).toBe(true)
    expect(normalizeVendorName('GYM MEMBERSHIP')).not.toBe('Gym')

    const clinic = classifyByMerchant('RIVERVIEW MEDICAL CLINIC #9012')
    expect(clinic?.generic).toBe(true)
    expect(normalizeVendorName('RIVERVIEW MEDICAL CLINIC #9012')).not.toBe('Medical Clinic')
  })

  it('keeps distinct merchants distinct even when they share a generic rule', () => {
    expect(normalizeVendorName('RENT PAYMENT - OAKWOOD APTS')).not.toBe(
      normalizeVendorName('RENT PAYMENT - MAPLE APTS'),
    )
    expect(normalizeVendorName('RIVERVIEW MEDICAL CLINIC #9012')).not.toBe(
      normalizeVendorName('DOCTORS MEDICAL GROUP'),
    )
  })
})

describe('normalizeSource', () => {
  it('identifies salary/payroll deposits', () => {
    expect(normalizeSource('ACME CORP PAYROLL')).toBe('Salary')
    expect(normalizeSource('DIRECT DEPOSIT - EMPLOYER')).toBe('Salary')
    expect(normalizeSource('ACH CREDIT SALARY')).toBe('Salary')
  })

  it('identifies interest income', () => {
    expect(normalizeSource('INTEREST PAYMENT')).toBe('Interest')
    expect(normalizeSource('SAVINGS INTEREST')).toBe('Interest')
  })

  it('identifies dividends', () => {
    expect(normalizeSource('DIVIDEND REINVESTMENT')).toBe('Dividends')
  })

  it('identifies peer transfers', () => {
    expect(normalizeSource('ZELLE FROM FRIEND')).toBe('Peer Transfer')
    expect(normalizeSource('VENMO PAYMENT')).toBe('Peer Transfer')
    expect(normalizeSource('PAYPAL TRANSFER')).toBe('Peer Transfer')
  })

  it('identifies refunds', () => {
    expect(normalizeSource('AMAZON REFUND')).toBe('Refunds')
    expect(normalizeSource('STORE RETURN')).toBe('Refunds')
  })

  it('truncates long unknown descriptions', () => {
    const long = 'SOME VERY LONG UNKNOWN INCOME SOURCE DESCRIPTION'
    const result = normalizeSource(long)
    expect(result.length).toBeLessThanOrEqual(33) // 30 + '…'
    expect(result).toContain('…')
  })

  it('returns short unknown descriptions unchanged', () => {
    expect(normalizeSource('MISC CREDIT')).toBe('MISC CREDIT')
  })
})
