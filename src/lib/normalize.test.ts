import { describe, it, expect } from 'vitest'
import { normalizeVendorName, normalizeSource } from './normalize'

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
