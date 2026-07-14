import { describe, it, expect, beforeAll } from 'vitest'
import { classifyByDictionary, loadMerchantDict, isMerchantDictLoaded } from './merchantDict'

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
  })
})
