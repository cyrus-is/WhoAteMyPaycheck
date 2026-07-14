import { describe, it, expect, beforeAll } from 'vitest'
import { classifyByDictionary, loadMerchantDict, isMerchantDictLoaded } from './merchantDict'
import { classifyByMerchant } from './merchantLookup'
import merchantDictJson from './merchantDict.generated.json'

describe('merchantDict', () => {
  it('returns null before the lazy chunk has loaded', () => {
    expect(isMerchantDictLoaded()).toBe(false)
    expect(classifyByDictionary('STARBUCKS #1024')).toBeNull()
  })

  describe('once loaded', () => {
    beforeAll(async () => {
      await loadMerchantDict()
    })

    it('is idempotent and reports loaded', async () => {
      expect(isMerchantDictLoaded()).toBe(true)
      await loadMerchantDict()
      expect(isMerchantDictLoaded()).toBe(true)
    })

    it('classifies a bare literal merchant regardless of trailing noise', () => {
      expect(classifyByDictionary('STARBUCKS #1024')).toEqual({ category: 'Dining', subcategory: 'Coffee Shop' })
      expect(classifyByDictionary('STARBUCKS SAN LUIS OBISPO CA')).toEqual({ category: 'Dining', subcategory: 'Coffee Shop' })
    })

    it('matches a multi-word phrase anywhere in the tokens, not just as a prefix', () => {
      // "PROPERTY TAX" sits mid-string, after "COUNTY" — the lookup scans every start
      // position, not just position 0 (see merchantDict.ts's docstring).
      expect(classifyByDictionary('COUNTY PROPERTY TAX PAYMENT')).toEqual({ category: 'Other', subcategory: 'Property Tax' })
    })

    it('prefers the longest matching entry at a position (Uber Eats over bare Uber)', () => {
      expect(classifyByDictionary('UBER EATS')).toEqual({ category: 'Dining', subcategory: 'Food Delivery' })
      expect(classifyByDictionary('UBER TRIP #5578')).toEqual({ category: 'Transport', subcategory: 'Rideshare' })
      expect(classifyByDictionary('UBER* PENDING')).toEqual({ category: 'Transport', subcategory: 'Rideshare' })
    })

    it('prefers the longer Amazon Prime override over the bare Amazon.com fallback', () => {
      expect(classifyByDictionary('AMAZON.COM PRIME MEMBERSHIP')).toEqual({ category: 'Subscriptions', subcategory: 'Streaming' })
      expect(classifyByDictionary('AMAZON.COM*9XM2K1PR')).toEqual({ category: 'Shopping', subcategory: 'Online Retail' })
    })

    it('prefers the longer Amazon/Costco overrides over their bare fallbacks (regression test — these used to be shadowed by the bare "AMAZON"/"AMZN"/"COSTCO WHSE" entries)', () => {
      expect(classifyByDictionary('AMAZON PRIME MEMBERSHIP')).toEqual({ category: 'Subscriptions', subcategory: 'Streaming' })
      expect(classifyByDictionary('AMZN PRIME*R12AB3CD4')).toEqual({ category: 'Subscriptions', subcategory: 'Streaming' })
      expect(classifyByDictionary('AMAZON WEB SERVICES AWS.AMAZON.COM')).toEqual({ category: 'Subscriptions', subcategory: 'Cloud Storage' })
      expect(classifyByDictionary('AMAZON FRESH #0221')).toEqual({ category: 'Groceries', subcategory: 'Grocery Delivery' })
      expect(classifyByDictionary('AMZN FRESH*2K7LM9')).toEqual({ category: 'Groceries', subcategory: 'Grocery Delivery' })
      expect(classifyByDictionary('COSTCO WHSE GAS #0552')).toEqual({ category: 'Transport', subcategory: 'Gas Station' })
    })

    it('strips a merchant-attached leading/trailing asterisk before matching', () => {
      expect(classifyByDictionary('UBER* TRIP')).toEqual({ category: 'Transport', subcategory: 'Rideshare' })
    })

    it('never fires on the §1.4a adversarial probes (bare ambiguous words are excluded)', () => {
      expect(classifyByDictionary('SHELL BEACH CAFE SAN LUIS OBISPO')).toBeNull()
      expect(classifyByDictionary('O2 ARENA LONDON EVENT')).toBeNull()
      expect(classifyByDictionary('PANDORA JEWELRY #442')).toBeNull()
      expect(classifyByDictionary('STEAM ROOM DAY SPA')).toBeNull()
      expect(classifyByDictionary('GAP INSURANCE PREMIUM AUTO')).toBeNull()
      expect(classifyByDictionary('RIVERSIDE ELECTRIC CO-OP')).toBeNull()
      expect(classifyByDictionary('BOOTS AND SADDLES WESTERN WEAR')).toBeNull()
      expect(classifyByDictionary('MARATHON SPORTS RUNNING SHOES')).toBeNull()
      expect(classifyByDictionary('USAA TRANSFER TO CHECKING')).toBeNull()
    })

    it('but still classifies the safe, qualified forms of those same brands', () => {
      expect(classifyByDictionary('SHELL OIL 57442 SAN FRANCISCO CA')).toEqual({ category: 'Transport', subcategory: 'Gas Station' })
      expect(classifyByDictionary('STEAM PURCHASE #7701')).toEqual({ category: 'Entertainment', subcategory: 'Gaming' })
    })

    it('returns null for an unknown merchant', () => {
      expect(classifyByDictionary('VALENTIN RESTAURANT')).toBeNull()
    })

    it('returns null for an empty or blank description', () => {
      expect(classifyByDictionary('')).toBeNull()
      expect(classifyByDictionary('   ')).toBeNull()
    })

    it('gates requiresCredit income entries so they never fire on a debit', () => {
      // "DIRECT DEPOSIT REVERSAL" is a debit clawing back a prior deposit, not incoming
      // payroll — without the requiresCredit gate this misclassified as Income/Payroll.
      expect(classifyByDictionary('DIRECT DEPOSIT REVERSAL', 'debit')).toBeNull()
      expect(classifyByDictionary('DIRECT DEPOSIT', 'credit')).toEqual({ category: 'Income', subcategory: 'Payroll' })
      expect(classifyByDictionary('DIRECT DEPOSIT')).toEqual({ category: 'Income', subcategory: 'Payroll' })
      expect(classifyByDictionary('STATE TAX REFUND', 'debit')).toBeNull()
      expect(classifyByDictionary('STATE TAX REFUND', 'credit')).toEqual({ category: 'Income', subcategory: 'Tax Refund' })
    })

    it('does not gate non-income entries by type', () => {
      expect(classifyByDictionary('STARBUCKS #1024', 'debit')).toEqual({ category: 'Dining', subcategory: 'Coffee Shop' })
      expect(classifyByDictionary('STARBUCKS #1024', 'credit')).toEqual({ category: 'Dining', subcategory: 'Coffee Shop' })
    })
  })

  describe('agreement with the regex merchant table', () => {
    beforeAll(async () => {
      await loadMerchantDict()
    })

    // Known, deliberate divergences between the dictionary and merchantLookup.ts's regex
    // table — the dictionary phrase is an intentional fix for a regex rule that's wrong (or
    // absent) for that exact literal, so silent disagreement here is expected, not a bug.
    // Keep this list short and documented; a new entry belongs here only with a comment
    // explaining which regex rule it's overriding and why (see build-merchant-dict.ts).
    const KNOWN_OVERRIDES = new Set<string>([
      'AMAZON.COM PRIME', // regex's bare "Amazon" rule (AMAZON\.COM) claims this first as
      // Shopping; the dictionary's longer, more specific phrase is the intentional fix.
    ])

    it('every dictionary entry either agrees with the regex table or is a documented override (guards against future §2.F drift — PR-7 review finding #1/#6)', () => {
      const mismatches: string[] = []
      const index = merchantDictJson.index as Record<
        string,
        { tokens: string[]; category: string; subcategory: string }[]
      >

      for (const bucket of Object.values(index)) {
        for (const entry of bucket) {
          const phrase = entry.tokens.join(' ')
          if (KNOWN_OVERRIDES.has(phrase)) continue

          const regexMatch = classifyByMerchant(phrase)
          if (regexMatch && regexMatch.category !== entry.category) {
            mismatches.push(
              `"${phrase}": dict=${entry.category}/${entry.subcategory} regex=${regexMatch.category}/${regexMatch.subcategory}`,
            )
          }
        }
      }

      expect(mismatches).toEqual([])
    })
  })
})
