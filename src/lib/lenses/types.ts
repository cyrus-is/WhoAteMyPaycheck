export type LensId = 'spending' | 'tax-us' | 'essentials'

export type TaxArea =
  | 'schedule-a'
  | 'schedule-c'
  | 'schedule-se'
  | 'form-2441'
  | 'hsa-medical'
  | 'non-deductible'

export interface TaxAreaDef {
  id: TaxArea
  /** Friendly purpose-based label shown in the UI */
  label: string
  /** IRS form reference — used in CPA CSV export */
  irsRef: string
  color: string
  /** Short description of what belongs here */
  description: string
  /** Comma-separated examples */
  examples: string
}

export const TAX_AREAS: TaxAreaDef[] = [
  {
    id: 'schedule-a',
    label: 'Itemized Deductions',
    irsRef: 'Schedule A',
    color: '#90cdf4',
    description: 'Personal deductions you can itemize instead of taking the standard deduction',
    examples: 'Mortgage interest, property tax, charitable donations, large medical bills',
  },
  {
    id: 'schedule-c',
    label: 'Business Expenses',
    irsRef: 'Schedule C',
    color: '#b794f4',
    description: 'Deductible expenses for self-employment, freelance, or gig work',
    examples: 'Home office, business travel, client meals (50%), professional software, tools',
  },
  {
    id: 'schedule-se',
    label: 'Self-Employment Income',
    irsRef: 'Schedule SE',
    color: '#68d391',
    description: 'Income from freelance, consulting, or contract work (1099 income)',
    examples: 'Freelance payments, consulting fees, gig platform deposits',
  },
  {
    id: 'form-2441',
    label: 'Dependent Care',
    irsRef: 'Form 2441',
    color: '#fbb6ce',
    description: 'Childcare expenses for kids under 13 — may qualify for a tax credit',
    examples: 'Daycare centers, after-school programs, summer day camps, nanny payments',
  },
  {
    id: 'hsa-medical',
    label: 'Medical / HSA',
    irsRef: 'HSA / Out-of-Pocket',
    color: '#fc8181',
    description: 'Out-of-pocket medical expenses not reimbursed by insurance',
    examples: 'Doctor visits, dentist, prescriptions, vision care, orthodontist',
  },
  {
    id: 'non-deductible',
    label: 'Personal',
    irsRef: 'Non-Deductible',
    color: '#4a5568',
    description: 'Personal spending with no tax benefit',
    examples: 'Groceries, dining, entertainment, personal shopping, gym memberships',
  },
]

export interface TaxResult {
  id: string
  taxArea: TaxArea
  /** Claude flagged this as ambiguous — could plausibly belong to multiple tax areas */
  ambiguous: boolean
}

export type EssentialsBucket = 'fixed-essential' | 'variable-essential' | 'easy-cut' | 'discretionary'

export const ESSENTIALS_BUCKETS: { id: EssentialsBucket; label: string; color: string }[] = [
  { id: 'fixed-essential',    label: 'Fixed Essential',    color: '#90cdf4' },
  { id: 'variable-essential', label: 'Variable Essential', color: '#68d391' },
  { id: 'easy-cut',           label: 'Easy Cut',           color: '#f6ad55' },
  { id: 'discretionary',      label: 'Discretionary',      color: '#b794f4' },
]
