import { describe, it, expect } from 'vitest'
import {
  classifyByMerchant,
  stripProcessorPrefix,
  isKnownMerchant,
  ALL_RULES,
  PROCESSOR_PREFIXES,
} from './merchantLookup'

// ---------------------------------------------------------------------------
// Processor prefix stripping
// ---------------------------------------------------------------------------

describe('stripProcessorPrefix', () => {
  it('strips Square prefix', () => {
    expect(stripProcessorPrefix('SQ *BLUE BOTTLE COFFEE')).toBe('BLUE BOTTLE COFFEE')
  })

  it('strips Toast prefix', () => {
    expect(stripProcessorPrefix('TST* SWEETGREEN #1234')).toBe('SWEETGREEN #1234')
    expect(stripProcessorPrefix('TST *SWEETGREEN #1234')).toBe('SWEETGREEN #1234')
  })

  it('strips PayPal prefix', () => {
    expect(stripProcessorPrefix('PAYPAL *ETSY')).toBe('ETSY')
  })

  it('strips Apple prefix', () => {
    expect(stripProcessorPrefix('APL* ITUNES.COM/BILL')).toBe('ITUNES.COM/BILL')
  })

  it('strips Shopify prefix', () => {
    expect(stripProcessorPrefix('SP *MYSTORE')).toBe('MYSTORE')
  })

  it('strips Google prefix', () => {
    expect(stripProcessorPrefix('GOOGLE *YOUTUBE PREMIUM')).toBe('YOUTUBE PREMIUM')
  })

  it('strips DoorDash prefix', () => {
    expect(stripProcessorPrefix('DD *DOORDASH DASHPASS')).toBe('DOORDASH DASHPASS')
  })

  it('leaves unknown prefixes alone', () => {
    expect(stripProcessorPrefix('RANDOM MERCHANT')).toBe('RANDOM MERCHANT')
  })
})

// ---------------------------------------------------------------------------
// Real-world bank statement descriptions
// ---------------------------------------------------------------------------

describe('classifyByMerchant — real-world bank statement strings', () => {
  // --- Groceries ---
  const groceryTests: [string, string, string][] = [
    ['WAL-MART #1234 AUSTIN TX', 'Groceries', 'Supermarket'],
    ['WALMART SUPERCENTER #5678', 'Groceries', 'Supermarket'],
    ['KROGER #12345 COLUMBUS OH', 'Groceries', 'Supermarket'],
    ['SAFEWAY #0123 SAN FRANC', 'Groceries', 'Supermarket'],
    ['ALBERTSONS #4321', 'Groceries', 'Supermarket'],
    ['PUBLIX #1200 ATLANTA GA', 'Groceries', 'Supermarket'],
    ['H-E-B #456 AUSTIN TX', 'Groceries', 'Supermarket'],
    ['ALDI 68012 CHICAGO IL', 'Groceries', 'Supermarket'],
    ['TRADER JOE\'S #100 SF CA', 'Groceries', 'Specialty Food'],
    ['WHOLEFDS MKT 10234', 'Groceries', 'Specialty Food'],
    ['WHOLE FOODS MARKET #100', 'Groceries', 'Specialty Food'],
    ['SPROUTS FARMERS MARKET', 'Groceries', 'Specialty Food'],
    ['COSTCO WHSE #1234', 'Groceries', 'Warehouse Club'],
    ['SAM\'S CLUB #6789', 'Groceries', 'Warehouse Club'],
    ['BJ\'S WHOLESALE #123', 'Groceries', 'Warehouse Club'],
    ['INSTACART', 'Groceries', 'Grocery Delivery'],
    ['AMZN FRESH US', 'Groceries', 'Grocery Delivery'],
    ['TESCO STORES 1234', 'Groceries', 'Supermarket'],
    ['SAINSBURY\'S S/MKT', 'Groceries', 'Supermarket'],
    ['ASDA STORES', 'Groceries', 'Supermarket'],
    ['WAITROSE & PARTNERS', 'Groceries', 'Specialty Food'],
    ['M&S SIMPLY FOOD', 'Groceries', 'Specialty Food'],
    ['OCADO.COM', 'Groceries', 'Grocery Delivery'],
  ]

  it.each(groceryTests)('"%s" → %s / %s', (desc, category, subcategory) => {
    const result = classifyByMerchant(desc)
    expect(result).not.toBeNull()
    expect(result!.category).toBe(category)
    expect(result!.subcategory).toBe(subcategory)
  })

  // --- Dining ---
  const diningTests: [string, string, string][] = [
    ['STARBUCKS #12345', 'Dining', 'Coffee Shop'],
    ['DUNKIN #345678 NEW YORK', 'Dining', 'Coffee Shop'],
    ['PEET\'S COFFEE & TEA', 'Dining', 'Coffee Shop'],
    ['BLUE BOTTLE COFFEE', 'Dining', 'Coffee Shop'],
    ['COSTA COFFEE LTD', 'Dining', 'Coffee Shop'],
    ['PRET A MANGER LONDON', 'Dining', 'Coffee Shop'],
    ['MCDONALD\'S F12345', 'Dining', 'Fast Food'],
    ['CHICK-FIL-A #01234', 'Dining', 'Fast Food'],
    ['CHIPOTLE 1234', 'Dining', 'Fast Food'],
    ['TACO BELL #01234', 'Dining', 'Fast Food'],
    ['WENDY\'S #1234', 'Dining', 'Fast Food'],
    ['BURGER KING #9876', 'Dining', 'Fast Food'],
    ['SUBWAY 12345', 'Dining', 'Fast Food'],
    ['PANERA BREAD #1234', 'Dining', 'Fast Food'],
    ['SWEETGREEN TRIBECA', 'Dining', 'Fast Food'],
    ['FIVE GUYS 1234', 'Dining', 'Fast Food'],
    ['IN-N-OUT BURGER #12', 'Dining', 'Fast Food'],
    ['SHAKE SHACK #123', 'Dining', 'Fast Food'],
    ['GREGGS PLC', 'Dining', 'Fast Food'],
    ['OLIVE GARDEN #1234', 'Dining', 'Restaurant'],
    ['DOORDASH*DASHPASS', 'Dining', 'Food Delivery'],
    ['GRUBHUB ORDER #1234', 'Dining', 'Food Delivery'],
    ['UBER EATS PENDING', 'Dining', 'Food Delivery'],
    ['DELIVEROO.COM', 'Dining', 'Food Delivery'],
    ['JUST EAT', 'Dining', 'Food Delivery'],
    ['DOMINO\'S PIZZA #1234', 'Dining', 'Fast Food'],
  ]

  it.each(diningTests)('"%s" → %s / %s', (desc, category, subcategory) => {
    const result = classifyByMerchant(desc)
    expect(result).not.toBeNull()
    expect(result!.category).toBe(category)
    expect(result!.subcategory).toBe(subcategory)
  })

  // --- Transport ---
  const transportTests: [string, string, string][] = [
    ['SHELL OIL 57442345123', 'Transport', 'Gas Station'],
    ['CHEVRON 0012345', 'Transport', 'Gas Station'],
    ['EXXON MOBIL 12345', 'Transport', 'Gas Station'],
    ['BP#1234567 HOUSTON TX', 'Transport', 'Gas Station'],
    ['COSTCO GAS #1234', 'Transport', 'Gas Station'],
    ['SPEEDWAY 01234', 'Transport', 'Gas Station'],
    ['WAWA 0123', 'Transport', 'Gas Station'],
    ['UBER *TRIP HELP.UBER.C', 'Transport', 'Rideshare'],
    ['UBER BV AMSTERDAM', 'Transport', 'Rideshare'],
    ['LYFT *RIDE 123456', 'Transport', 'Rideshare'],
    ['TFL.GOV.UK/CP', 'Transport', 'Public Transit'],
    ['CONTACTLESS TFL', 'Transport', 'Public Transit'],
    ['GEICO *AUTO', 'Transport', 'Auto Insurance'],
    ['STATE FARM INSURANCE', 'Transport', 'Auto Insurance'],
    ['PROGRESSIVE INS', 'Transport', 'Auto Insurance'],
    ['PARKMOBILE *PARKING', 'Transport', 'Parking'],
    ['CHARGEPOINT STATION', 'Transport', 'Gas Station'],
  ]

  it.each(transportTests)('"%s" → %s / %s', (desc, category, subcategory) => {
    const result = classifyByMerchant(desc)
    expect(result).not.toBeNull()
    expect(result!.category).toBe(category)
    expect(result!.subcategory).toBe(subcategory)
  })

  // --- Shopping ---
  const shoppingTests: [string, string, string][] = [
    ['AMZN MKTP US*2K7LQ8PK5', 'Shopping', 'Online Retail'],
    ['AMAZON.COM*AB12CD34E', 'Shopping', 'Online Retail'],
    ['TARGET #1234', 'Shopping', 'Department Store'],
    ['BEST BUY #1234', 'Shopping', 'Electronics'],
    ['HOME DEPOT #1234', 'Shopping', 'Department Store'],
    ['LOWES #1234', 'Shopping', 'Department Store'],
    ['MACY\'S EAST #1234', 'Shopping', 'Department Store'],
    ['NORDSTROM #123', 'Shopping', 'Department Store'],
    ['TJ MAXX #1234', 'Shopping', 'Clothing'],
    ['MARSHALLS #1234', 'Shopping', 'Clothing'],
    ['ROSS STORES #1234', 'Shopping', 'Clothing'],
    ['IKEA EAST PALO ALTO', 'Shopping', 'Department Store'],
    ['SEPHORA #1234', 'Shopping', 'Department Store'],
    ['TEMU.COM', 'Shopping', 'Online Retail'],
    ['JOHN LEWIS LONDON', 'Shopping', 'Department Store'],
    ['CURRYS PC WORLD', 'Shopping', 'Electronics'],
  ]

  it.each(shoppingTests)('"%s" → %s / %s', (desc, category, subcategory) => {
    const result = classifyByMerchant(desc)
    expect(result).not.toBeNull()
    expect(result!.category).toBe(category)
    expect(result!.subcategory).toBe(subcategory)
  })

  // --- Subscriptions ---
  const subscriptionTests: [string, string, string][] = [
    ['NETFLIX.COM', 'Subscriptions', 'Streaming'],
    ['SPOTIFY USA', 'Subscriptions', 'Streaming'],
    ['HULU 123456789', 'Subscriptions', 'Streaming'],
    ['DISNEY PLUS', 'Subscriptions', 'Streaming'],
    ['HBO MAX', 'Subscriptions', 'Streaming'],
    ['APL* ITUNES.COM/BILL', 'Subscriptions', 'Software/SaaS'],
    ['APPLE.COM/BILL', 'Subscriptions', 'Software/SaaS'],
    ['ADOBE *CREATIVE CLD', 'Subscriptions', 'Software/SaaS'],
    ['MICROSOFT *OFFICE 365', 'Subscriptions', 'Software/SaaS'],
    ['ZOOM.US 888-799-9666', 'Subscriptions', 'Software/SaaS'],
    ['NYTIMES*DIGITAL', 'Subscriptions', 'News/Media'],
    ['GOOGLE ONE', 'Subscriptions', 'Cloud Storage'],
    ['AMZN PRIME US', 'Subscriptions', 'Streaming'],
    ['DROPBOX*PLUS', 'Subscriptions', 'Cloud Storage'],
    ['OPENAI *CHATGPT PLUS', 'Subscriptions', 'Software/SaaS'],
    ['ANTHROPIC API', 'Subscriptions', 'Software/SaaS'],
    ['YOUTUBE PREMIUM', 'Subscriptions', 'Streaming'],
    ['PATREON* MEMBERSHIP', 'Subscriptions', 'News/Media'],
  ]

  it.each(subscriptionTests)('"%s" → %s / %s', (desc, category, subcategory) => {
    const result = classifyByMerchant(desc)
    expect(result).not.toBeNull()
    expect(result!.category).toBe(category)
    expect(result!.subcategory).toBe(subcategory)
  })

  // --- Entertainment ---
  const entertainmentTests: [string, string, string][] = [
    ['AMC THEATRES #123', 'Entertainment', 'Movies/Theater'],
    ['TICKETMASTER', 'Entertainment', 'Concert/Event'],
    ['STEAM PURCHASE', 'Entertainment', 'Gaming'],
    ['PLAYSTATION NETWORK', 'Entertainment', 'Gaming'],
    ['TOTAL WINE & MORE #1234', 'Entertainment', 'Nightlife'],
  ]

  it.each(entertainmentTests)('"%s" → %s / %s', (desc, category, subcategory) => {
    const result = classifyByMerchant(desc)
    expect(result).not.toBeNull()
    expect(result!.category).toBe(category)
    expect(result!.subcategory).toBe(subcategory)
  })

  // --- Health ---
  const healthTests: [string, string, string][] = [
    ['CVS/PHARMACY #1234', 'Health', 'Pharmacy'],
    ['WALGREENS #12345', 'Health', 'Pharmacy'],
    ['RITE AID #1234', 'Health', 'Pharmacy'],
    ['EQUINOX #1234', 'Health', 'Gym'],
    ['PLANET FITNESS #1234', 'Health', 'Gym'],
    ['ORANGETHEORY FITNESS', 'Health', 'Gym'],
    ['CROSSFIT GYM', 'Health', 'Gym'],
    ['PELOTON *SUBSCRIPTION', 'Health', 'Gym'],
    ['BOOTS UK LTD', 'Health', 'Pharmacy'],
    ['PUREGYM LTD', 'Health', 'Gym'],
  ]

  it.each(healthTests)('"%s" → %s / %s', (desc, category, subcategory) => {
    const result = classifyByMerchant(desc)
    expect(result).not.toBeNull()
    expect(result!.category).toBe(category)
    expect(result!.subcategory).toBe(subcategory)
  })

  // --- Travel ---
  const travelTests: [string, string, string][] = [
    ['DELTA AIR LINES', 'Travel', 'Flight'],
    ['AMERICAN AIRLINES', 'Travel', 'Flight'],
    ['UNITED AIRLINES', 'Travel', 'Flight'],
    ['SOUTHWEST AIR', 'Travel', 'Flight'],
    ['MARRIOTT HOTEL #1234', 'Travel', 'Hotel'],
    ['HILTON GARDEN INN', 'Travel', 'Hotel'],
    ['AIRBNB *HM1234567', 'Travel', 'Vacation Rental'],
    ['BOOKING.COM', 'Travel', 'Hotel'],
    ['HERTZ RENT A CAR', 'Travel', 'Car Rental'],
    ['TURO TRIP', 'Travel', 'Car Rental'],
    ['RYANAIR', 'Travel', 'Flight'],
    ['EASYJET', 'Travel', 'Flight'],
    ['PREMIER INN', 'Travel', 'Hotel'],
    ['TRAVELODGE HOTELS', 'Travel', 'Hotel'],
  ]

  it.each(travelTests)('"%s" → %s / %s', (desc, category, subcategory) => {
    const result = classifyByMerchant(desc)
    expect(result).not.toBeNull()
    expect(result!.category).toBe(category)
    expect(result!.subcategory).toBe(subcategory)
  })

  // --- Housing ---
  const housingTests: [string, string, string][] = [
    ['PG&E DES:UTIL PMT', 'Housing', 'Utilities'],
    ['CON EDISON CO OF NY', 'Housing', 'Utilities'],
    ['COMCAST CABLE COMM', 'Housing', 'Internet/Cable'],
    ['XFINITY MOBILE', 'Housing', 'Internet/Cable'],
    ['SPECTRUM 877-7488496', 'Housing', 'Internet/Cable'],
    ['T-MOBILE PAYMENT', 'Housing', 'Phone Bill'],
    ['VERIZON WIRELESS', 'Housing', 'Phone Bill'],
    ['BRITISH GAS', 'Housing', 'Utilities'],
    ['OCTOPUS ENERGY', 'Housing', 'Utilities'],
    ['VIRGIN MEDIA', 'Housing', 'Internet/Cable'],
    ['SKY UK LTD SUBS', 'Housing', 'Internet/Cable'],
    ['VODAFONE UK', 'Housing', 'Phone Bill'],
  ]

  it.each(housingTests)('"%s" → %s / %s', (desc, category, subcategory) => {
    const result = classifyByMerchant(desc)
    expect(result).not.toBeNull()
    expect(result!.category).toBe(category)
    expect(result!.subcategory).toBe(subcategory)
  })

  // --- Transfer ---
  const transferTests: [string, string, string][] = [
    ['VENMO PAYMENT', 'Transfer', 'Transfer'],
    ['ZELLE TO JOHN DOE', 'Transfer', 'Transfer'],
    ['CASH APP*JOHN', 'Transfer', 'Transfer'],
  ]

  it.each(transferTests)('"%s" → %s / %s', (desc, category, subcategory) => {
    const result = classifyByMerchant(desc)
    expect(result).not.toBeNull()
    expect(result!.category).toBe(category)
    expect(result!.subcategory).toBe(subcategory)
  })

  // --- Income ---
  const incomeTests: [string, string, string][] = [
    ['DIRECT DEPOSIT ACME CORP', 'Income', 'Payroll'],
    ['ADP PAYROLL', 'Income', 'Payroll'],
    ['GUSTO PAYROLL', 'Income', 'Payroll'],
    ['INTEREST PAYMENT', 'Income', 'Interest'],
    ['IRS TREAS 310 TAX REF', 'Income', 'Tax Refund'],
  ]

  it.each(incomeTests)('"%s" → %s / %s', (desc, category, subcategory) => {
    const result = classifyByMerchant(desc)
    expect(result).not.toBeNull()
    expect(result!.category).toBe(category)
    expect(result!.subcategory).toBe(subcategory)
  })
})

// ---------------------------------------------------------------------------
// Processor prefix + merchant match (two-step matching)
// ---------------------------------------------------------------------------

describe('classifyByMerchant — processor prefix stripping', () => {
  it('matches Square + merchant', () => {
    const result = classifyByMerchant('SQ *BLUE BOTTLE COFFEE SF')
    expect(result).not.toBeNull()
    expect(result!.category).toBe('Dining')
    expect(result!.subcategory).toBe('Coffee Shop')
  })

  it('matches Toast + merchant', () => {
    const result = classifyByMerchant('TST* SWEETGREEN #1234')
    expect(result).not.toBeNull()
    expect(result!.category).toBe('Dining')
    expect(result!.subcategory).toBe('Fast Food')
  })

  it('matches PayPal + merchant', () => {
    const result = classifyByMerchant('PAYPAL *SPOTIFY')
    expect(result).not.toBeNull()
    expect(result!.category).toBe('Subscriptions')
    expect(result!.subcategory).toBe('Streaming')
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('classifyByMerchant — edge cases', () => {
  it('returns null for empty string', () => {
    expect(classifyByMerchant('')).toBeNull()
  })

  it('returns null for unrecognized merchant', () => {
    expect(classifyByMerchant('XYZZY UNKNOWN MERCHANT 12345')).toBeNull()
  })

  it('is case-insensitive', () => {
    const lower = classifyByMerchant('netflix.com')
    const upper = classifyByMerchant('NETFLIX.COM')
    const mixed = classifyByMerchant('Netflix.Com')
    expect(lower).toEqual(upper)
    expect(lower).toEqual(mixed)
  })

  it('handles extra whitespace', () => {
    const result = classifyByMerchant('  STARBUCKS #12345  ')
    expect(result).not.toBeNull()
    expect(result!.category).toBe('Dining')
  })
})

// ---------------------------------------------------------------------------
// isKnownMerchant
// ---------------------------------------------------------------------------

describe('isKnownMerchant', () => {
  it('returns true for known merchants', () => {
    expect(isKnownMerchant('NETFLIX.COM')).toBe(true)
    expect(isKnownMerchant('WALMART #1234')).toBe(true)
  })

  it('returns false for unknown merchants', () => {
    expect(isKnownMerchant('TOTALLY UNKNOWN BUSINESS')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Rule coverage sanity check
// ---------------------------------------------------------------------------

describe('rule coverage', () => {
  it('has at least 200 merchant rules', () => {
    expect(ALL_RULES.length).toBeGreaterThanOrEqual(200)
  })

  it('has processor prefix patterns', () => {
    expect(PROCESSOR_PREFIXES.length).toBeGreaterThanOrEqual(10)
  })

  it('classifies childcare chain daycare centers', () => {
    expect(classifyByMerchant('BRIGHT HORIZONS CHILDCARE')?.category).toBe('Childcare')
    expect(classifyByMerchant('KINDERCARE LEARNING CTR')?.category).toBe('Childcare')
    expect(classifyByMerchant('THE GODDARD SCHOOL #123')?.category).toBe('Childcare')
    expect(classifyByMerchant('PRIMROSE SCHOOL OF OAK')?.category).toBe('Childcare')
    expect(classifyByMerchant('LA PETITE ACADEMY')?.category).toBe('Childcare')
    expect(classifyByMerchant('KIDDIE ACADEMY #456')?.category).toBe('Childcare')
  })

  it('classifies generic childcare descriptions', () => {
    expect(classifyByMerchant('SUNSHINE DAYCARE')?.category).toBe('Childcare')
    expect(classifyByMerchant('ABC CHILD CARE CENTER')?.category).toBe('Childcare')
    expect(classifyByMerchant('LITTLE STARS PRESCHOOL')?.category).toBe('Childcare')
    expect(classifyByMerchant('SUMMER CAMP REGISTRATION')?.category).toBe('Childcare')
    expect(classifyByMerchant('AFTER SCHOOL PROGRAM')?.category).toBe('Childcare')
    expect(classifyByMerchant('MONTESSORI ACADEMY')?.category).toBe('Childcare')
  })

  it('classifies education merchants', () => {
    expect(classifyByMerchant('NAVIENT STUDENT LOAN')?.category).toBe('Education')
    expect(classifyByMerchant('NELNET PAYMENT')?.category).toBe('Education')
    expect(classifyByMerchant('KUMON MATH CENTER')?.category).toBe('Education')
    expect(classifyByMerchant('COURSERA INC')?.category).toBe('Education')
    expect(classifyByMerchant('UDEMY ONLINE COURSE')?.category).toBe('Education')
    expect(classifyByMerchant('KAPLAN TEST PREP')?.category).toBe('Education')
    expect(classifyByMerchant('COLLEGE BOARD SAT')?.category).toBe('Education')
    expect(classifyByMerchant('TUITION PAYMENT')?.category).toBe('Education')
    expect(classifyByMerchant('PRINCETON REVIEW')?.category).toBe('Education')
    expect(classifyByMerchant('MOHELA STUDENT')?.category).toBe('Education')
  })

  it('all rules have valid categories', () => {
    const validCategories = new Set([
      'Income', 'Housing', 'Childcare', 'Education', 'Groceries', 'Dining', 'Transport', 'Travel',
      'Shopping', 'Entertainment', 'Health', 'Subscriptions', 'Transfer', 'Other',
    ])
    for (const rule of ALL_RULES) {
      expect(validCategories.has(rule.category)).toBe(true)
    }
  })
})
