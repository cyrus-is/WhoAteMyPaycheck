import { describe, it, expect } from 'vitest'
import { mapToEssentialsBucket } from './essentials'
import { CATEGORIES } from '../types'

describe('mapToEssentialsBucket', () => {
  it('maps Housing to fixed-essential', () => {
    expect(mapToEssentialsBucket('Housing')).toBe('fixed-essential')
  })

  it('maps Health to fixed-essential', () => {
    expect(mapToEssentialsBucket('Health')).toBe('fixed-essential')
  })

  it('maps Groceries to variable-essential', () => {
    expect(mapToEssentialsBucket('Groceries')).toBe('variable-essential')
  })

  it('maps Transport to variable-essential', () => {
    expect(mapToEssentialsBucket('Transport')).toBe('variable-essential')
  })

  it('maps Subscriptions to easy-cut', () => {
    expect(mapToEssentialsBucket('Subscriptions')).toBe('easy-cut')
  })

  it('maps Dining to easy-cut', () => {
    expect(mapToEssentialsBucket('Dining')).toBe('easy-cut')
  })

  it('maps Entertainment to easy-cut', () => {
    expect(mapToEssentialsBucket('Entertainment')).toBe('easy-cut')
  })

  it('maps Shopping to discretionary', () => {
    expect(mapToEssentialsBucket('Shopping')).toBe('discretionary')
  })

  it('maps Travel to discretionary', () => {
    expect(mapToEssentialsBucket('Travel')).toBe('discretionary')
  })

  it('maps Other to discretionary', () => {
    expect(mapToEssentialsBucket('Other')).toBe('discretionary')
  })

  it('maps every known Category to exactly one bucket', () => {
    const buckets = new Set(['fixed-essential', 'variable-essential', 'easy-cut', 'discretionary'])
    for (const cat of CATEGORIES) {
      expect(buckets).toContain(mapToEssentialsBucket(cat))
    }
  })

  it('falls back to discretionary for unknown categories', () => {
    expect(mapToEssentialsBucket('SomeNewCategory')).toBe('discretionary')
  })
})
