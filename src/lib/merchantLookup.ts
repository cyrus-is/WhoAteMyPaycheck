/**
 * Static merchant pre-classification lookup table.
 *
 * Matches ~50-60% of common US (and some UK) transactions without an API call.
 * Each entry has a regex pattern tested against the raw bank-statement description,
 * plus the canonical category / subcategory from our taxonomy.
 *
 * Usage:
 *   import { classifyByMerchant } from './merchantLookup'
 *   const result = classifyByMerchant(description)
 *   if (result) { /* skip API call *\/ }
 */

import type { Category } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MerchantRule {
  /** Human-readable merchant / pattern name */
  name: string
  /** Regex tested against UPPERCASED description (case-insensitive flag also set) */
  pattern: RegExp
  category: Category
  subcategory: string
}

export interface ClassificationResult {
  category: Category
  subcategory: string
  merchant: string
}

// ---------------------------------------------------------------------------
// Payment-processor prefixes
// ---------------------------------------------------------------------------

/** Known payment-processor prefixes that appear before the real merchant name.
 *  We strip these before merchant matching so "SQ *BLUE BOTTLE" matches "BLUE BOTTLE". */
export const PROCESSOR_PREFIXES: { pattern: RegExp; processor: string }[] = [
  { pattern: /^SQ \*\s*/i,                    processor: 'Square' },
  { pattern: /^SQC\*\s*/i,                    processor: 'Square Capital' },
  { pattern: /^TST\*\s*/i,                    processor: 'Toast' },
  { pattern: /^TST \*\s*/i,                   processor: 'Toast' },
  { pattern: /^TOAST?\s*\*?\s*/i,             processor: 'Toast' },
  { pattern: /^PAYPAL \*/i,                   processor: 'PayPal' },
  { pattern: /^PP\*/i,                        processor: 'PayPal' },
  { pattern: /^CLOVER\*\s*/i,                 processor: 'Clover' },
  { pattern: /^CLV\*\s*/i,                    processor: 'Clover' },
  { pattern: /^STRIPE\s*\*?\s*/i,             processor: 'Stripe' },
  { pattern: /^SP \*\s*/i,                    processor: 'Shopify' },
  { pattern: /^SHOPPAY \*/i,                  processor: 'Shop Pay' },
  { pattern: /^APL\*\s*/i,                    processor: 'Apple' },
  { pattern: /^APPLE\.COM\/BILL/i,            processor: 'Apple' },
  { pattern: /^GOOGLE \*/i,                   processor: 'Google' },
  { pattern: /^GOOG\*\s*/i,                   processor: 'Google' },
  { pattern: /^DD \*/i,                       processor: 'DoorDash' },
  { pattern: /^DD\*/i,                        processor: 'DoorDash' },
  { pattern: /^GITHUB\s*/i,                   processor: 'GitHub' },
  { pattern: /^GODADDY\s*/i,                  processor: 'GoDaddy' },
  { pattern: /^WPY\*\s*/i,                    processor: 'WorldPay' },
  { pattern: /^CKE\*\s*/i,                    processor: 'Cake (POS)' },
  { pattern: /^POS DEBIT\s*/i,                processor: 'POS' },
  { pattern: /^POS PURCHASE\s*/i,             processor: 'POS' },
  { pattern: /^DEBIT CARD PURCHASE\s*/i,      processor: 'Debit Card' },
  { pattern: /^RECURRING PAYMENT\s*/i,        processor: 'Recurring' },
  { pattern: /^CHECKCARD\s*/i,                processor: 'Check Card' },
]

/** Strip a known processor prefix from a description. Returns the cleaned string. */
export function stripProcessorPrefix(desc: string): string {
  for (const { pattern } of PROCESSOR_PREFIXES) {
    if (pattern.test(desc)) {
      return desc.replace(pattern, '').trim()
    }
  }
  return desc
}

// ---------------------------------------------------------------------------
// Merchant rules — grouped by category
// ---------------------------------------------------------------------------

// NOTE ON PATTERNS:
// - All patterns use the 'i' flag (case-insensitive).
// - Patterns are designed to match the messy, truncated descriptions from real
//   bank statements (e.g. "AMZN MKTP US*2K7", "WHOLEFDS MKT 10234").
// - We anchor with \b where possible to avoid false positives.
// - Trailing store numbers, transaction IDs, and city names are ignored.

const GROCERIES: MerchantRule[] = [
  // --- US Supermarkets ---
  { name: 'Walmart Grocery',      pattern: /WAL[-\s]?MART|WALMART/i,                        category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Kroger',               pattern: /\bKROGER\b/i,                                   category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Safeway',              pattern: /\bSAFEWAY\b/i,                                  category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Albertsons',           pattern: /\bALBERTSONS?\b/i,                               category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Publix',               pattern: /\bPUBLIX\b/i,                                   category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'HEB',                  pattern: /\bH[-\s]?E[-\s]?B\b/i,                          category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Aldi',                 pattern: /\bALDI\b/i,                                     category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Lidl',                 pattern: /\bLIDL\b/i,                                     category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Trader Joe\'s',        pattern: /TRADER\s*JOE|TRADER\s*J/i,                      category: 'Groceries', subcategory: 'Specialty Food' },
  { name: 'Whole Foods',          pattern: /WHOLE\s*F(?:OO)?DS|WHOLEFDS|WFM\b/i,            category: 'Groceries', subcategory: 'Specialty Food' },
  { name: 'Sprouts',              pattern: /\bSPROUTS\b/i,                                  category: 'Groceries', subcategory: 'Specialty Food' },
  { name: 'Wegmans',              pattern: /\bWEGMANS?\b/i,                                 category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Meijer',               pattern: /\bMEIJER\b/i,                                   category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'WinCo',                pattern: /\bWINCO\b/i,                                    category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Food Lion',            pattern: /FOOD\s*LION/i,                                   category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Giant Food',           pattern: /\bGIANT\b.*(?:FOOD|MKT|MARKET)/i,               category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Stop & Shop',          pattern: /STOP\s*(?:&|AND)?\s*SHOP/i,                     category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'ShopRite',             pattern: /\bSHOPRITE\b/i,                                 category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Piggly Wiggly',        pattern: /PIGGLY\s*WIGGLY/i,                              category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Harris Teeter',        pattern: /HARRIS\s*TEETER/i,                              category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Fred Meyer',           pattern: /FRED\s*MEYER/i,                                 category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Raley\'s',             pattern: /\bRALEY'?S\b/i,                                 category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Vons',                 pattern: /\bVONS\b/i,                                     category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Hannaford',            pattern: /\bHANNAFORD\b/i,                                category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Market Basket',        pattern: /MARKET\s*BASKET/i,                              category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Stater Bros',          pattern: /STATER\s*BRO/i,                                 category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Smart & Final',        pattern: /SMART\s*(?:&|AND)?\s*FINAL/i,                   category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Winn-Dixie',           pattern: /WINN[\s-]*DIXIE/i,                              category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Bi-Lo',                pattern: /\bBI[\s-]*LO\b/i,                               category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Ingles',               pattern: /\bINGLES\b/i,                                   category: 'Groceries', subcategory: 'Supermarket' },

  // --- Warehouse Clubs ---
  { name: 'Costco',               pattern: /\bCOSTCO\b(?!.*GAS)/i,                          category: 'Groceries', subcategory: 'Warehouse Club' },
  { name: 'Sam\'s Club',          pattern: /SAM'?S\s*CLUB/i,                                category: 'Groceries', subcategory: 'Warehouse Club' },
  { name: 'BJ\'s Wholesale',      pattern: /\bBJ'?S\b.*(?:WHOLE|CLUB|WHSL)?/i,             category: 'Groceries', subcategory: 'Warehouse Club' },

  // --- Grocery Delivery ---
  { name: 'Instacart',            pattern: /\bINSTACART\b/i,                                category: 'Groceries', subcategory: 'Grocery Delivery' },
  { name: 'FreshDirect',          pattern: /FRESH\s*DIRECT/i,                               category: 'Groceries', subcategory: 'Grocery Delivery' },
  { name: 'Amazon Fresh',         pattern: /AMZN\s*FRESH|AMAZON\s*FRESH/i,                  category: 'Groceries', subcategory: 'Grocery Delivery' },
  { name: 'Thrive Market',        pattern: /THRIVE\s*MARKET|THRIVEMARKET/i,                 category: 'Groceries', subcategory: 'Grocery Delivery' },
  { name: 'Imperfect Foods',      pattern: /IMPERFECT\s*FOODS?/i,                           category: 'Groceries', subcategory: 'Grocery Delivery' },
  { name: 'Gopuff',               pattern: /\bGOPUFF\b/i,                                   category: 'Groceries', subcategory: 'Grocery Delivery' },

  // --- UK Supermarkets ---
  { name: 'Tesco',                pattern: /\bTESCO\b/i,                                    category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Sainsbury\'s',         pattern: /SAINSBURY/i,                                     category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'ASDA',                 pattern: /\bASDA\b/i,                                     category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Waitrose',             pattern: /\bWAITROSE\b/i,                                 category: 'Groceries', subcategory: 'Specialty Food' },
  { name: 'Marks & Spencer Food', pattern: /M\s*&\s*S\s*(?:FOOD|SIMPLY)|MARKS\s*(?:&|AND)\s*SPENCER/i, category: 'Groceries', subcategory: 'Specialty Food' },
  { name: 'Morrisons',            pattern: /\bMORRISONS?\b/i,                               category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Co-op Food',           pattern: /\bCO[\s-]*OP\b/i,                               category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'Ocado',                pattern: /\bOCADO\b/i,                                    category: 'Groceries', subcategory: 'Grocery Delivery' },
  { name: 'Iceland',              pattern: /\bICELAND\b.*(?:FOOD|STORE)?/i,                 category: 'Groceries', subcategory: 'Supermarket' },
]

const DINING: MerchantRule[] = [
  // --- Coffee Shops ---
  { name: 'Starbucks',            pattern: /STARBUCKS/i,                                     category: 'Dining', subcategory: 'Coffee Shop' },
  { name: 'Dunkin\'',             pattern: /DUNKIN/i,                                        category: 'Dining', subcategory: 'Coffee Shop' },
  { name: 'Peet\'s Coffee',       pattern: /PEET'?S\s*COFFEE/i,                             category: 'Dining', subcategory: 'Coffee Shop' },
  { name: 'Blue Bottle',          pattern: /BLUE\s*BOTTLE/i,                                category: 'Dining', subcategory: 'Coffee Shop' },
  { name: 'Philz Coffee',         pattern: /\bPHILZ\b/i,                                   category: 'Dining', subcategory: 'Coffee Shop' },
  { name: 'Dutch Bros',           pattern: /DUTCH\s*BROS/i,                                 category: 'Dining', subcategory: 'Coffee Shop' },
  { name: 'Tim Hortons',          pattern: /TIM\s*HORTON/i,                                 category: 'Dining', subcategory: 'Coffee Shop' },
  { name: 'Costa Coffee',         pattern: /\bCOSTA\b.*COFFEE|COSTA\s*COFFEE/i,             category: 'Dining', subcategory: 'Coffee Shop' },
  { name: 'Pret A Manger',        pattern: /PRET\s*A?\s*MANGER|PRET\b/i,                   category: 'Dining', subcategory: 'Coffee Shop' },
  { name: 'Caffè Nero',           pattern: /CAFFE?\s*NERO/i,                                category: 'Dining', subcategory: 'Coffee Shop' },
  { name: 'Intelligentsia',       pattern: /INTELLIGENTSIA/i,                               category: 'Dining', subcategory: 'Coffee Shop' },
  { name: 'La Colombe',           pattern: /LA\s*COLOMBE/i,                                 category: 'Dining', subcategory: 'Coffee Shop' },

  // --- Fast Food / Fast Casual ---
  { name: 'McDonald\'s',          pattern: /MCDONALD|MCD'?S/i,                              category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Chick-fil-A',          pattern: /CHICK[\s-]*FIL[\s-]*A/i,                        category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Chipotle',             pattern: /CHIPOTLE/i,                                     category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Taco Bell',            pattern: /TACO\s*BELL/i,                                  category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Wendy\'s',             pattern: /WENDY'?S/i,                                     category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Burger King',          pattern: /BURGER\s*KING|BK\s*#/i,                         category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Subway',               pattern: /\bSUBWAY\b/i,                                  category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Panera',               pattern: /\bPANERA\b/i,                                  category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Sweetgreen',           pattern: /SWEETGREEN|SWEET\s*GREEN/i,                     category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Five Guys',            pattern: /FIVE\s*GUYS/i,                                  category: 'Dining', subcategory: 'Fast Food' },
  { name: 'In-N-Out',             pattern: /IN[\s-]*N[\s-]*OUT/i,                           category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Shake Shack',          pattern: /SHAKE\s*SHACK/i,                                category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Popeyes',              pattern: /\bPOPEYE'?S\b/i,                               category: 'Dining', subcategory: 'Fast Food' },
  { name: 'KFC',                  pattern: /\bKFC\b|KENTUCKY\s*FRIED/i,                     category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Arby\'s',              pattern: /\bARBY'?S\b/i,                                  category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Sonic Drive-In',       pattern: /\bSONIC\b.*DRIVE/i,                             category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Jack in the Box',      pattern: /JACK\s*IN\s*THE\s*BOX/i,                        category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Whataburger',          pattern: /WHATABURGER/i,                                  category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Raising Cane\'s',      pattern: /RAISING\s*CANE/i,                               category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Wingstop',             pattern: /\bWINGSTOP\b/i,                                 category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Panda Express',        pattern: /PANDA\s*EXPRESS/i,                              category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Chili\'s',             pattern: /\bCHILI'?S\b/i,                                category: 'Dining', subcategory: 'Restaurant' },
  { name: 'Applebee\'s',          pattern: /APPLEBEE/i,                                     category: 'Dining', subcategory: 'Restaurant' },
  { name: 'Olive Garden',         pattern: /OLIVE\s*GARDEN|DARDEN/i,                        category: 'Dining', subcategory: 'Restaurant' },
  { name: 'Texas Roadhouse',      pattern: /TEXAS\s*ROADHOUSE/i,                            category: 'Dining', subcategory: 'Restaurant' },
  { name: 'Outback Steakhouse',   pattern: /OUTBACK\s*STEAK/i,                              category: 'Dining', subcategory: 'Restaurant' },
  { name: 'Red Lobster',          pattern: /RED\s*LOBSTER/i,                                category: 'Dining', subcategory: 'Restaurant' },
  { name: 'Cracker Barrel',       pattern: /CRACKER\s*BARREL/i,                             category: 'Dining', subcategory: 'Restaurant' },
  { name: 'IHOP',                 pattern: /\bIHOP\b/i,                                     category: 'Dining', subcategory: 'Restaurant' },
  { name: 'Denny\'s',             pattern: /\bDENNY'?S\b/i,                                category: 'Dining', subcategory: 'Restaurant' },
  { name: 'Waffle House',         pattern: /WAFFLE\s*HOUSE/i,                               category: 'Dining', subcategory: 'Restaurant' },
  { name: 'Buffalo Wild Wings',   pattern: /BUFFALO\s*WILD|BWW\b/i,                         category: 'Dining', subcategory: 'Restaurant' },
  { name: 'The Cheesecake Factory', pattern: /CHEESECAKE\s*FACTORY/i,                       category: 'Dining', subcategory: 'Restaurant' },
  { name: 'Nando\'s',             pattern: /\bNANDO'?S\b/i,                                category: 'Dining', subcategory: 'Restaurant' },
  { name: 'Greggs',               pattern: /\bGREGGS\b/i,                                  category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Wetherspoon',          pattern: /WETHERSPOON|J\s*D\s*WETHERSPOON/i,              category: 'Dining', subcategory: 'Bar' },
  { name: 'Pizza Hut',            pattern: /PIZZA\s*HUT/i,                                  category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Domino\'s',            pattern: /DOMINO'?S/i,                                    category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Papa John\'s',         pattern: /PAPA\s*JOHN/i,                                  category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Little Caesars',       pattern: /LITTLE\s*CAES/i,                                category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Cava',                 pattern: /\bCAVA\b/i,                                     category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Noodles & Company',    pattern: /NOODLES\s*(?:&|AND)?\s*CO/i,                    category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Zaxby\'s',             pattern: /\bZAXBY/i,                                     category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Culver\'s',            pattern: /\bCULVER/i,                                    category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Jersey Mike\'s',       pattern: /JERSEY\s*MIKE/i,                                category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Jimmy John\'s',        pattern: /JIMMY\s*JOHN/i,                                 category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Firehouse Subs',       pattern: /FIREHOUSE\s*SUB/i,                              category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Waba Grill',           pattern: /\bWABA\b/i,                                    category: 'Dining', subcategory: 'Fast Food' },
  { name: 'El Pollo Loco',        pattern: /EL\s*POLLO\s*LOCO/i,                           category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Del Taco',             pattern: /DEL\s*TACO/i,                                  category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Qdoba',                pattern: /\bQDOBA\b/i,                                   category: 'Dining', subcategory: 'Fast Food' },
  { name: 'Moe\'s Southwest',     pattern: /\bMOE'?S\b.*(?:SW|SOUTHWEST)/i,                category: 'Dining', subcategory: 'Fast Food' },

  // --- Food Delivery ---
  { name: 'DoorDash',             pattern: /DOORDASH|DOOR\s*DASH/i,                         category: 'Dining', subcategory: 'Food Delivery' },
  { name: 'GrubHub',              pattern: /GRUBHUB|GRUB\s*HUB|SEAMLESS/i,                  category: 'Dining', subcategory: 'Food Delivery' },
  { name: 'Uber Eats',            pattern: /UBER\s*EAT|UBEREATS/i,                          category: 'Dining', subcategory: 'Food Delivery' },
  { name: 'Postmates',            pattern: /POSTMATES/i,                                    category: 'Dining', subcategory: 'Food Delivery' },
  { name: 'Deliveroo',            pattern: /\bDELIVEROO\b/i,                               category: 'Dining', subcategory: 'Food Delivery' },
  { name: 'Just Eat',             pattern: /JUST\s*EAT/i,                                  category: 'Dining', subcategory: 'Food Delivery' },
  { name: 'Caviar',               pattern: /\bCAVIAR\b/i,                                  category: 'Dining', subcategory: 'Food Delivery' },
]

const TRANSPORT: MerchantRule[] = [
  // --- Gas Stations ---
  { name: 'Shell',                pattern: /\bSHELL\b.*(?:OIL|SVC|SERVICE)?/i,              category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Chevron',              pattern: /\bCHEVRON\b/i,                                  category: 'Transport', subcategory: 'Gas Station' },
  { name: 'ExxonMobil',           pattern: /\bEXXON\b|\bMOBIL\b/i,                         category: 'Transport', subcategory: 'Gas Station' },
  { name: 'BP',                   pattern: /\bBP\b.*(?:AMOCO|PROD|#)?/i,                    category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Costco Gas',           pattern: /COSTCO\s*(?:GAS|FUEL|WHSE\s*GAS)/i,             category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Sam\'s Club Gas',      pattern: /SAM'?S\s*(?:CLUB)?\s*(?:GAS|FUEL)/i,            category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Sunoco',               pattern: /\bSUNOCO\b/i,                                   category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Marathon',             pattern: /\bMARATHON\b.*(?:PETRO)?/i,                     category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Citgo',                pattern: /\bCITGO\b/i,                                    category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Valero',               pattern: /\bVALERO\b/i,                                   category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Phillips 66',          pattern: /PHILLIPS\s*66/i,                                 category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Arco',                 pattern: /\bARCO\b/i,                                     category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Circle K',             pattern: /CIRCLE\s*K/i,                                   category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Speedway',             pattern: /\bSPEEDWAY\b/i,                                 category: 'Transport', subcategory: 'Gas Station' },
  { name: 'QuikTrip',             pattern: /QUIK\s*TRIP|QT\s*#/i,                           category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Wawa',                 pattern: /\bWAWA\b/i,                                     category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Sheetz',               pattern: /\bSHEETZ\b/i,                                   category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Casey\'s',             pattern: /\bCASEY'?S\b/i,                                category: 'Transport', subcategory: 'Gas Station' },
  { name: 'RaceTrac',             pattern: /RACETRAC/i,                                     category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Buc-ee\'s',            pattern: /BUC[\s-]*EE/i,                                  category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Kum & Go',             pattern: /KUM\s*(?:&|AND)\s*GO/i,                         category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Murphy USA',           pattern: /MURPHY\s*(?:USA|OIL)/i,                         category: 'Transport', subcategory: 'Gas Station' },
  { name: 'GetGo',                pattern: /\bGETGO\b/i,                                    category: 'Transport', subcategory: 'Gas Station' },
  { name: '7-Eleven Gas',         pattern: /7[\s-]*ELEVEN.*(?:GAS|FUEL)/i,                   category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Texaco',               pattern: /\bTEXACO\b/i,                                   category: 'Transport', subcategory: 'Gas Station' },

  // --- Rideshare ---
  { name: 'Uber (ride)',          pattern: /UBER\s*\*?\s*TRIP|UBER\s*(?:BV|RIDE)|UBER\s+HELP\.UBER/i, category: 'Transport', subcategory: 'Rideshare' },
  { name: 'Uber (generic)',       pattern: /\bUBER\b(?!.*EAT)/i,                            category: 'Transport', subcategory: 'Rideshare' },
  { name: 'Lyft',                 pattern: /\bLYFT\b/i,                                     category: 'Transport', subcategory: 'Rideshare' },

  // --- Public Transit ---
  { name: 'TfL (London)',         pattern: /\bTFL\b|TRANSPORT\s*FOR\s*LONDON|CONTACTLESS\s*TFL/i, category: 'Transport', subcategory: 'Public Transit' },
  { name: 'MTA (NYC)',            pattern: /\bMTA\b|METROPOLITAN\s*TRANS/i,                  category: 'Transport', subcategory: 'Public Transit' },
  { name: 'BART',                 pattern: /\bBART\b.*(?:QP|SFO)?/i,                        category: 'Transport', subcategory: 'Public Transit' },
  { name: 'WMATA (DC Metro)',     pattern: /\bWMATA\b|DC\s*METRO/i,                         category: 'Transport', subcategory: 'Public Transit' },
  { name: 'CTA (Chicago)',        pattern: /\bCTA\b.*(?:VENTRA)?/i,                         category: 'Transport', subcategory: 'Public Transit' },
  { name: 'MBTA (Boston)',        pattern: /\bMBTA\b/i,                                     category: 'Transport', subcategory: 'Public Transit' },

  // --- Parking ---
  { name: 'ParkMobile',           pattern: /PARKMOBILE/i,                                   category: 'Transport', subcategory: 'Parking' },
  { name: 'SpotHero',             pattern: /SPOTHERO/i,                                     category: 'Transport', subcategory: 'Parking' },
  { name: 'LAZ Parking',          pattern: /\bLAZ\s*PARKING/i,                              category: 'Transport', subcategory: 'Parking' },
  { name: 'SP+ Parking',          pattern: /\bSP\+?\s*PARK/i,                               category: 'Transport', subcategory: 'Parking' },

  // --- Auto Insurance ---
  { name: 'GEICO',                pattern: /\bGEICO\b/i,                                    category: 'Transport', subcategory: 'Auto Insurance' },
  { name: 'Progressive',          pattern: /\bPROGRESSIVE\b.*(?:INS)?/i,                    category: 'Transport', subcategory: 'Auto Insurance' },
  { name: 'State Farm',           pattern: /STATE\s*FARM/i,                                 category: 'Transport', subcategory: 'Auto Insurance' },
  { name: 'Allstate',             pattern: /\bALLSTATE\b/i,                                 category: 'Transport', subcategory: 'Auto Insurance' },
  { name: 'USAA Insurance',       pattern: /\bUSAA\b/i,                                     category: 'Transport', subcategory: 'Auto Insurance' },
  { name: 'Liberty Mutual',       pattern: /LIBERTY\s*MUTUAL/i,                             category: 'Transport', subcategory: 'Auto Insurance' },
  { name: 'Nationwide',           pattern: /\bNATIONWIDE\b.*(?:INS)?/i,                     category: 'Transport', subcategory: 'Auto Insurance' },
  { name: 'Farmers Insurance',    pattern: /\bFARMERS\b.*INS/i,                             category: 'Transport', subcategory: 'Auto Insurance' },
  { name: 'Root Insurance',       pattern: /\bROOT\b.*INS/i,                                category: 'Transport', subcategory: 'Auto Insurance' },

  // --- EV Charging ---
  { name: 'Tesla Supercharger',   pattern: /TESLA\s*(?:SUPER)?CHARG/i,                      category: 'Transport', subcategory: 'Gas Station' },
  { name: 'ChargePoint',          pattern: /CHARGEPOINT/i,                                  category: 'Transport', subcategory: 'Gas Station' },
  { name: 'Electrify America',    pattern: /ELECTRIFY\s*AMERICA/i,                          category: 'Transport', subcategory: 'Gas Station' },
  { name: 'EVgo',                 pattern: /\bEVGO\b/i,                                     category: 'Transport', subcategory: 'Gas Station' },
]

const SHOPPING: MerchantRule[] = [
  // --- Online Retail ---
  { name: 'Amazon',               pattern: /AMZN\s*MKTP|AMAZON\.COM|AMZN\.COM|AMAZON\s*MAR/i, category: 'Shopping', subcategory: 'Online Retail' },
  { name: 'Amazon Digital',       pattern: /AMZN\s*DIGITAL|AMAZON\s*DIGITAL|KINDLE/i,       category: 'Shopping', subcategory: 'Online Retail' },
  { name: 'Amazon Prime',         pattern: /AMZN\s*PRIME|AMAZON\s*PRIME/i,                  category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'eBay',                 pattern: /\bEBAY\b/i,                                     category: 'Shopping', subcategory: 'Online Retail' },
  { name: 'Etsy',                 pattern: /\bETSY\b/i,                                     category: 'Shopping', subcategory: 'Online Retail' },
  { name: 'Wish',                 pattern: /\bWISH\.COM\b|CONTEXTLOGIC/i,                   category: 'Shopping', subcategory: 'Online Retail' },
  { name: 'Temu',                 pattern: /\bTEMU\b/i,                                     category: 'Shopping', subcategory: 'Online Retail' },
  { name: 'Shein',                pattern: /\bSHEIN\b/i,                                    category: 'Shopping', subcategory: 'Online Retail' },

  // --- Big Box / General Retail ---
  { name: 'Target',               pattern: /\bTARGET\b/i,                                   category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Walmart (non-grocery)',pattern: /WALMART\.COM|WM\s*SUPERCENTER/i,                 category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Dollar General',       pattern: /DOLLAR\s*GENERAL|DG\s*#/i,                      category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Dollar Tree',          pattern: /DOLLAR\s*TREE/i,                                category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Five Below',           pattern: /FIVE\s*BELOW/i,                                 category: 'Shopping', subcategory: 'Department Store' },

  // --- Department Stores ---
  { name: 'Macy\'s',              pattern: /\bMACY'?S\b/i,                                  category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Nordstrom',            pattern: /NORDSTROM/i,                                     category: 'Shopping', subcategory: 'Department Store' },
  { name: 'JCPenney',             pattern: /J\s*C\s*PENNEY|JCPENNEY/i,                      category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Kohl\'s',              pattern: /\bKOHL'?S\b/i,                                  category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Dillard\'s',           pattern: /\bDILLARD/i,                                    category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Bloomingdale\'s',      pattern: /BLOOMINGDALE/i,                                  category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Neiman Marcus',        pattern: /NEIMAN\s*MARCUS/i,                              category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Saks Fifth Ave',       pattern: /SAKS\s*(?:FIFTH|5TH)/i,                        category: 'Shopping', subcategory: 'Department Store' },

  // --- Clothing ---
  { name: 'TJ Maxx',              pattern: /T\s*J\s*MAXX|TJMAXX/i,                          category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Marshalls',            pattern: /\bMARSHALL'?S\b/i,                              category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Ross',                 pattern: /ROSS\s*(?:STORES?|DRESS)/i,                     category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Burlington',           pattern: /\bBURLINGTON\b.*(?:COAT|STORE)?/i,              category: 'Shopping', subcategory: 'Clothing' },
  { name: 'H&M',                  pattern: /\bH\s*&\s*M\b|H\s*AND\s*M\b/i,                 category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Zara',                 pattern: /\bZARA\b/i,                                     category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Uniqlo',               pattern: /\bUNIQLO\b/i,                                   category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Gap',                  pattern: /\bGAP\b.*(?:STORE|#)?/i,                        category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Old Navy',             pattern: /OLD\s*NAVY/i,                                   category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Nike',                 pattern: /\bNIKE\b/i,                                     category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Adidas',               pattern: /\bADIDAS\b/i,                                   category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Lululemon',            pattern: /LULULEMON/i,                                     category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Primark',              pattern: /\bPRIMARK\b/i,                                  category: 'Shopping', subcategory: 'Clothing' },
  { name: 'ASOS',                 pattern: /\bASOS\b/i,                                     category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Anthropologie',        pattern: /ANTHROPOLOGIE/i,                                 category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Urban Outfitters',     pattern: /URBAN\s*OUTFIT/i,                               category: 'Shopping', subcategory: 'Clothing' },
  { name: 'J.Crew',               pattern: /J\.?\s*CREW/i,                                  category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Banana Republic',      pattern: /BANANA\s*REPUBLIC/i,                            category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Express',              pattern: /\bEXPRESS\b.*(?:#|STORE)/i,                     category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Forever 21',           pattern: /FOREVER\s*21/i,                                 category: 'Shopping', subcategory: 'Clothing' },

  // --- Electronics ---
  { name: 'Best Buy',             pattern: /BEST\s*BUY/i,                                   category: 'Shopping', subcategory: 'Electronics' },
  { name: 'Apple Store',          pattern: /APPLE\s*STORE|APPLE\.COM.*(?:ONE|STORE)/i,      category: 'Shopping', subcategory: 'Electronics' },
  { name: 'Micro Center',         pattern: /MICRO\s*CENTER/i,                               category: 'Shopping', subcategory: 'Electronics' },
  { name: 'Newegg',               pattern: /\bNEWEGG\b/i,                                   category: 'Shopping', subcategory: 'Electronics' },
  { name: 'B&H Photo',            pattern: /B\s*&?\s*H\s*PHOTO/i,                           category: 'Shopping', subcategory: 'Electronics' },
  { name: 'GameStop',             pattern: /GAMESTOP/i,                                      category: 'Shopping', subcategory: 'Electronics' },

  // --- Home / Furniture ---
  { name: 'IKEA',                 pattern: /\bIKEA\b/i,                                     category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Wayfair',              pattern: /\bWAYFAIR\b/i,                                  category: 'Shopping', subcategory: 'Online Retail' },
  { name: 'Pottery Barn',         pattern: /POTTERY\s*BARN/i,                               category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Crate & Barrel',       pattern: /CRATE\s*(?:&|AND)?\s*BARREL/i,                  category: 'Shopping', subcategory: 'Department Store' },
  { name: 'West Elm',             pattern: /WEST\s*ELM/i,                                   category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Bed Bath & Beyond',    pattern: /BED\s*BATH|BB&B/i,                              category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Williams-Sonoma',      pattern: /WILLIAMS[\s-]*SONOMA/i,                         category: 'Shopping', subcategory: 'Department Store' },

  // --- Pet ---
  { name: 'Petco',                pattern: /\bPETCO\b/i,                                    category: 'Shopping', subcategory: 'Online Retail' },
  { name: 'PetSmart',             pattern: /PETSMART/i,                                     category: 'Shopping', subcategory: 'Online Retail' },
  { name: 'Chewy',                pattern: /\bCHEWY\b/i,                                    category: 'Shopping', subcategory: 'Online Retail' },

  // --- Home Improvement ---
  { name: 'Home Depot',           pattern: /HOME\s*DEPOT|THE\s*HOME\s*DE/i,                 category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Lowe\'s',              pattern: /\bLOWE'?S\b/i,                                  category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Menards',              pattern: /\bMENARDS?\b/i,                                  category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Ace Hardware',         pattern: /ACE\s*HARDWARE/i,                               category: 'Shopping', subcategory: 'Department Store' },
  { name: 'True Value',           pattern: /TRUE\s*VALUE/i,                                 category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Harbor Freight',       pattern: /HARBOR\s*FREIGHT/i,                             category: 'Shopping', subcategory: 'Department Store' },

  // --- UK Retail ---
  { name: 'John Lewis',           pattern: /JOHN\s*LEWIS/i,                                 category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Argos',                pattern: /\bARGOS\b/i,                                    category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Boots',                pattern: /\bBOOTS\b/i,                                    category: 'Health', subcategory: 'Pharmacy' },
  { name: 'Currys',               pattern: /\bCURRYS\b/i,                                   category: 'Shopping', subcategory: 'Electronics' },
  { name: 'Debenhams',            pattern: /DEBENHAMS/i,                                     category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Next',                 pattern: /\bNEXT\b.*(?:PLC|RETAIL)/i,                     category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Sports Direct',        pattern: /SPORTS\s*DIRECT/i,                              category: 'Shopping', subcategory: 'Clothing' },
  { name: 'Halfords',             pattern: /\bHALFORDS\b/i,                                 category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Wilko',                pattern: /\bWILKO\b/i,                                    category: 'Shopping', subcategory: 'Department Store' },

  // --- Books / Office ---
  { name: 'Barnes & Noble',       pattern: /BARNES\s*(?:&|AND)?\s*NOBLE|B&N\b/i,            category: 'Shopping', subcategory: 'Online Retail' },
  { name: 'Staples',              pattern: /\bSTAPLES\b/i,                                   category: 'Shopping', subcategory: 'Online Retail' },
  { name: 'Office Depot',         pattern: /OFFICE\s*DEPOT|OFFICEDEPOT/i,                   category: 'Shopping', subcategory: 'Online Retail' },

  // --- Beauty ---
  { name: 'Sephora',              pattern: /\bSEPHORA\b/i,                                  category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Ulta Beauty',          pattern: /\bULTA\b/i,                                     category: 'Shopping', subcategory: 'Department Store' },
  { name: 'Bath & Body Works',    pattern: /BATH\s*(?:&|AND)?\s*BODY/i,                     category: 'Shopping', subcategory: 'Department Store' },
]

const SUBSCRIPTIONS: MerchantRule[] = [
  // --- Streaming ---
  { name: 'Netflix',              pattern: /\bNETFLIX\b/i,                                  category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'Spotify',              pattern: /\bSPOTIFY\b/i,                                  category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'Hulu',                 pattern: /\bHULU\b/i,                                     category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'Disney+',              pattern: /DISNEY\s*PLUS|DISNEYPLUS|DISNEY\+/i,            category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'HBO Max',              pattern: /HBO\s*MAX|HBO\.COM/i,                           category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'Apple TV+',            pattern: /APPLE\s*TV/i,                                   category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'YouTube Premium',      pattern: /YOUTUBE\s*PREM|YOUTUBE\.COM.*PREM/i,            category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'YouTube TV',           pattern: /YOUTUBE\s*TV/i,                                 category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'Peacock',              pattern: /\bPEACOCK\b.*(?:TV|PREM)?/i,                    category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'Paramount+',           pattern: /PARAMOUNT\s*PLUS|PARAMOUNT\+/i,                 category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'Max (Warner)',         pattern: /\bMAX\.COM\b/i,                                 category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'Crunchyroll',          pattern: /CRUNCHYROLL/i,                                  category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'Audible',              pattern: /\bAUDIBLE\b/i,                                  category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'SiriusXM',             pattern: /SIRIUS\s*XM|SIRIUSXM/i,                        category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'Pandora',              pattern: /\bPANDORA\b/i,                                  category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'Tidal',                pattern: /\bTIDAL\b/i,                                    category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'Apple Music',          pattern: /APPLE\s*MUSIC/i,                                category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'Deezer',               pattern: /\bDEEZER\b/i,                                   category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'Discovery+',           pattern: /DISCOVERY\s*PLUS|DISCOVERY\+/i,                 category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'ESPN+',                pattern: /ESPN\s*PLUS|ESPN\+/i,                           category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'Twitch',               pattern: /\bTWITCH\b/i,                                   category: 'Subscriptions', subcategory: 'Streaming' },

  // --- Apple / iTunes (catch-all for Apple subscriptions) ---
  { name: 'Apple iTunes',         pattern: /ITUNES\.COM|APPLE\.COM\/BILL|APL\*ITUNES/i,     category: 'Subscriptions', subcategory: 'Software/SaaS' },

  // --- Google subscriptions ---
  { name: 'Google One',           pattern: /GOOGLE\s*ONE|GOOGLE\s*STORAGE/i,                category: 'Subscriptions', subcategory: 'Cloud Storage' },
  { name: 'Google Workspace',     pattern: /GOOGLE\s*WORKSPACE|GSUITE/i,                    category: 'Subscriptions', subcategory: 'Software/SaaS' },

  // --- Software / SaaS ---
  { name: 'Adobe',                pattern: /\bADOBE\b/i,                                    category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Microsoft',            pattern: /MICROSOFT\s*\*|MSFT\s*\*/i,                     category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Microsoft 365',        pattern: /MICROSOFT\s*365|OFFICE\s*365/i,                 category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Zoom',                 pattern: /ZOOM\.US|ZOOM\s*VIDEO/i,                        category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Notion',               pattern: /\bNOTION\b.*(?:LABS)?/i,                        category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Slack',                pattern: /\bSLACK\b/i,                                    category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Dropbox',              pattern: /\bDROPBOX\b/i,                                  category: 'Subscriptions', subcategory: 'Cloud Storage' },
  { name: 'iCloud',               pattern: /\bICLOUD\b/i,                                   category: 'Subscriptions', subcategory: 'Cloud Storage' },
  { name: 'GitHub',               pattern: /\bGITHUB\b/i,                                   category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'ChatGPT / OpenAI',     pattern: /OPENAI|CHATGPT/i,                               category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Anthropic API',        pattern: /ANTHROPIC/i,                                     category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: '1Password',            pattern: /1PASSWORD|AGILEBITS/i,                          category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'LastPass',             pattern: /LASTPASS/i,                                      category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Bitwarden',            pattern: /BITWARDEN/i,                                     category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'NordVPN',              pattern: /NORDVPN/i,                                       category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'ExpressVPN',           pattern: /EXPRESSVPN/i,                                    category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Canva',                pattern: /\bCANVA\b/i,                                    category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Figma',                pattern: /\bFIGMA\b/i,                                    category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Grammarly',            pattern: /GRAMMARLY/i,                                     category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Evernote',             pattern: /EVERNOTE/i,                                      category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Trello',               pattern: /\bTRELLO\b/i,                                   category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Todoist',              pattern: /TODOIST/i,                                       category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Calendly',             pattern: /CALENDLY/i,                                      category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Squarespace',          pattern: /SQUARESPACE/i,                                   category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Wix',                  pattern: /\bWIX\b/i,                                      category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Shopify',              pattern: /\bSHOPIFY\b/i,                                  category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'GoDaddy',              pattern: /GODADDY/i,                                       category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'Namecheap',            pattern: /NAMECHEAP/i,                                     category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'AWS',                  pattern: /\bAWS\b|AMAZON\s*WEB\s*SER/i,                   category: 'Subscriptions', subcategory: 'Cloud Storage' },
  { name: 'Google Cloud',         pattern: /GOOGLE\s*CLOUD|GCP\b/i,                         category: 'Subscriptions', subcategory: 'Cloud Storage' },
  { name: 'DigitalOcean',         pattern: /DIGITALOCEAN/i,                                  category: 'Subscriptions', subcategory: 'Cloud Storage' },
  { name: 'Vercel',               pattern: /\bVERCEL\b/i,                                   category: 'Subscriptions', subcategory: 'Cloud Storage' },
  { name: 'Heroku',               pattern: /\bHEROKU\b/i,                                   category: 'Subscriptions', subcategory: 'Cloud Storage' },
  { name: 'Cloudflare',           pattern: /CLOUDFLARE/i,                                    category: 'Subscriptions', subcategory: 'Cloud Storage' },
  { name: 'Linear',               pattern: /\bLINEAR\b.*APP/i,                              category: 'Subscriptions', subcategory: 'Software/SaaS' },

  // --- News / Media ---
  { name: 'NY Times',             pattern: /NY\s*TIMES|NYTIMES|NEW\s*YORK\s*TIMES/i,        category: 'Subscriptions', subcategory: 'News/Media' },
  { name: 'Washington Post',      pattern: /WASHINGTON\s*POST|WASHPOST/i,                   category: 'Subscriptions', subcategory: 'News/Media' },
  { name: 'Wall Street Journal',  pattern: /WALL\s*ST.*JOURNAL|WSJ\b/i,                    category: 'Subscriptions', subcategory: 'News/Media' },
  { name: 'The Athletic',         pattern: /THE\s*ATHLETIC/i,                               category: 'Subscriptions', subcategory: 'News/Media' },
  { name: 'Substack',             pattern: /\bSUBSTACK\b/i,                                 category: 'Subscriptions', subcategory: 'News/Media' },
  { name: 'Medium',               pattern: /\bMEDIUM\.COM\b/i,                              category: 'Subscriptions', subcategory: 'News/Media' },
  { name: 'The Economist',        pattern: /THE\s*ECONOMIST/i,                              category: 'Subscriptions', subcategory: 'News/Media' },
  { name: 'Financial Times',      pattern: /FINANCIAL\s*TIMES|FT\.COM/i,                    category: 'Subscriptions', subcategory: 'News/Media' },
  { name: 'The Guardian',         pattern: /THE\s*GUARDIAN|GUARDIAN\s*NEWS/i,                category: 'Subscriptions', subcategory: 'News/Media' },
  { name: 'Patreon',              pattern: /\bPATREON\b/i,                                  category: 'Subscriptions', subcategory: 'News/Media' },
]

const ENTERTAINMENT: MerchantRule[] = [
  // --- Movies / Theater ---
  { name: 'AMC Theatres',         pattern: /\bAMC\b.*(?:THEAT|MOVIE|CINEMA|#)/i,           category: 'Entertainment', subcategory: 'Movies/Theater' },
  { name: 'Regal Cinemas',        pattern: /REGAL\s*(?:CINEMA|THEATER|MOVIE)/i,             category: 'Entertainment', subcategory: 'Movies/Theater' },
  { name: 'Cinemark',             pattern: /\bCINEMARK\b/i,                                 category: 'Entertainment', subcategory: 'Movies/Theater' },
  { name: 'Fandango',             pattern: /\bFANDANGO\b/i,                                 category: 'Entertainment', subcategory: 'Movies/Theater' },
  { name: 'Odeon',                pattern: /\bODEON\b/i,                                    category: 'Entertainment', subcategory: 'Movies/Theater' },
  { name: 'Vue Cinema',           pattern: /\bVUE\b.*CINEMA/i,                              category: 'Entertainment', subcategory: 'Movies/Theater' },

  // --- Events / Tickets ---
  { name: 'Ticketmaster',         pattern: /TICKETMASTER/i,                                  category: 'Entertainment', subcategory: 'Concert/Event' },
  { name: 'StubHub',              pattern: /STUBHUB/i,                                       category: 'Entertainment', subcategory: 'Concert/Event' },
  { name: 'SeatGeek',             pattern: /SEATGEEK/i,                                      category: 'Entertainment', subcategory: 'Concert/Event' },
  { name: 'Eventbrite',           pattern: /EVENTBRITE/i,                                    category: 'Entertainment', subcategory: 'Concert/Event' },
  { name: 'AXS',                  pattern: /\bAXS\b.*(?:TICKET)?/i,                         category: 'Entertainment', subcategory: 'Concert/Event' },
  { name: 'Live Nation',          pattern: /LIVE\s*NATION/i,                                 category: 'Entertainment', subcategory: 'Concert/Event' },

  // --- Gaming ---
  { name: 'Steam',                pattern: /\bSTEAM\b.*(?:GAMES|PURCHASE)?|STEAMPOWERED/i,  category: 'Entertainment', subcategory: 'Gaming' },
  { name: 'PlayStation',          pattern: /PLAYSTATION|SONY\s*NETWORK|PSN\b/i,             category: 'Entertainment', subcategory: 'Gaming' },
  { name: 'Xbox / Microsoft',     pattern: /\bXBOX\b|MICROSOFT\s*XBOX/i,                    category: 'Entertainment', subcategory: 'Gaming' },
  { name: 'Nintendo',             pattern: /\bNINTENDO\b/i,                                 category: 'Entertainment', subcategory: 'Gaming' },
  { name: 'Epic Games',           pattern: /EPIC\s*GAMES/i,                                 category: 'Entertainment', subcategory: 'Gaming' },
  { name: 'Blizzard',             pattern: /BLIZZARD|BATTLE\.NET/i,                         category: 'Entertainment', subcategory: 'Gaming' },

  // --- Nightlife / Alcohol ---
  { name: 'Total Wine',           pattern: /TOTAL\s*WINE/i,                                 category: 'Entertainment', subcategory: 'Nightlife' },
  { name: 'BevMo',                pattern: /\bBEVMO\b/i,                                    category: 'Entertainment', subcategory: 'Nightlife' },
  { name: 'Drizly',               pattern: /\bDRIZLY\b/i,                                   category: 'Entertainment', subcategory: 'Nightlife' },
  { name: 'Gopuff Alcohol',       pattern: /GOPUFF.*(?:ALCOHOL|WINE|BEER)/i,                category: 'Entertainment', subcategory: 'Nightlife' },
]

const HEALTH: MerchantRule[] = [
  // --- Pharmacies ---
  { name: 'CVS',                  pattern: /\bCVS\b/i,                                      category: 'Health', subcategory: 'Pharmacy' },
  { name: 'Walgreens',            pattern: /WALGREEN/i,                                      category: 'Health', subcategory: 'Pharmacy' },
  { name: 'Rite Aid',             pattern: /RITE\s*AID/i,                                   category: 'Health', subcategory: 'Pharmacy' },
  { name: 'Duane Reade',          pattern: /DUANE\s*READE/i,                                category: 'Health', subcategory: 'Pharmacy' },
  { name: 'Express Scripts',      pattern: /EXPRESS\s*SCRIPTS?/i,                           category: 'Health', subcategory: 'Pharmacy' },
  { name: 'OptumRx',              pattern: /OPTUMRX|OPTUM\s*RX/i,                           category: 'Health', subcategory: 'Pharmacy' },
  { name: 'Capsule',              pattern: /CAPSULE\s*PHARM/i,                              category: 'Health', subcategory: 'Pharmacy' },
  { name: 'Superdrug',            pattern: /\bSUPERDRUG\b/i,                                category: 'Health', subcategory: 'Pharmacy' },

  // --- Gyms ---
  { name: 'Equinox',              pattern: /\bEQUINOX\b/i,                                  category: 'Health', subcategory: 'Gym' },
  { name: 'Planet Fitness',       pattern: /PLANET\s*FIT/i,                                 category: 'Health', subcategory: 'Gym' },
  { name: 'LA Fitness',           pattern: /LA\s*FITNESS/i,                                 category: 'Health', subcategory: 'Gym' },
  { name: 'Orangetheory',         pattern: /ORANGETHEORY|ORANGE\s*THEORY/i,                 category: 'Health', subcategory: 'Gym' },
  { name: 'CrossFit',             pattern: /\bCROSSFIT\b/i,                                 category: 'Health', subcategory: 'Gym' },
  { name: 'SoulCycle',            pattern: /SOULCYCLE/i,                                     category: 'Health', subcategory: 'Gym' },
  { name: 'Barry\'s Bootcamp',    pattern: /BARRY'?S\s*BOOT/i,                              category: 'Health', subcategory: 'Gym' },
  { name: 'YMCA',                 pattern: /\bYMCA\b/i,                                     category: 'Health', subcategory: 'Gym' },
  { name: 'Gold\'s Gym',          pattern: /GOLD'?S\s*GYM/i,                                category: 'Health', subcategory: 'Gym' },
  { name: 'Anytime Fitness',      pattern: /ANYTIME\s*FIT/i,                                category: 'Health', subcategory: 'Gym' },
  { name: 'Crunch Fitness',       pattern: /CRUNCH\s*FIT/i,                                 category: 'Health', subcategory: 'Gym' },
  { name: 'F45',                  pattern: /\bF45\b/i,                                      category: 'Health', subcategory: 'Gym' },
  { name: 'Blink Fitness',        pattern: /BLINK\s*FIT/i,                                  category: 'Health', subcategory: 'Gym' },
  { name: 'Peloton',              pattern: /\bPELOTON\b/i,                                  category: 'Health', subcategory: 'Gym' },
  { name: 'ClassPass',            pattern: /CLASSPASS/i,                                     category: 'Health', subcategory: 'Gym' },
  { name: 'PureGym',              pattern: /PUREGYM/i,                                       category: 'Health', subcategory: 'Gym' },
  { name: 'David Lloyd',          pattern: /DAVID\s*LLOYD/i,                                category: 'Health', subcategory: 'Gym' },
  { name: 'The Gym Group',        pattern: /THE\s*GYM\s*GROUP/i,                            category: 'Health', subcategory: 'Gym' },
  { name: 'Virgin Active',        pattern: /VIRGIN\s*ACTIVE/i,                              category: 'Health', subcategory: 'Gym' },

  // --- Vision ---
  { name: 'LensCrafters',         pattern: /LENSCRAFTERS/i,                                  category: 'Health', subcategory: 'Vision' },
  { name: 'Warby Parker',         pattern: /WARBY\s*PARKER/i,                               category: 'Health', subcategory: 'Vision' },
  { name: 'Specsavers',           pattern: /SPECSAVERS/i,                                    category: 'Health', subcategory: 'Vision' },
  { name: 'Vision Express',       pattern: /VISION\s*EXPRESS/i,                             category: 'Health', subcategory: 'Vision' },

  // --- Doctor/Medical ---
  { name: 'One Medical',          pattern: /ONE\s*MEDICAL/i,                                category: 'Health', subcategory: 'Doctor/Medical' },
  { name: 'Kaiser Permanente',    pattern: /KAISER\s*PERM/i,                                category: 'Health', subcategory: 'Doctor/Medical' },
  { name: 'Cigna',                pattern: /\bCIGNA\b/i,                                    category: 'Health', subcategory: 'Doctor/Medical' },
  { name: 'UnitedHealthcare',     pattern: /UNITEDHEALTHCARE|UHC\b/i,                       category: 'Health', subcategory: 'Doctor/Medical' },
  { name: 'Aetna',                pattern: /\bAETNA\b/i,                                    category: 'Health', subcategory: 'Doctor/Medical' },
  { name: 'Blue Cross',           pattern: /BLUE\s*CROSS|BCBS\b/i,                          category: 'Health', subcategory: 'Doctor/Medical' },

  // --- Dentist ---
  { name: 'Aspen Dental',         pattern: /ASPEN\s*DENTAL/i,                               category: 'Health', subcategory: 'Dentist' },
  { name: 'SmileDirectClub',      pattern: /SMILE\s*DIRECT/i,                               category: 'Health', subcategory: 'Dentist' },
  { name: 'Invisalign',           pattern: /INVISALIGN/i,                                    category: 'Health', subcategory: 'Dentist' },
]

const TRAVEL: MerchantRule[] = [
  // --- Airlines ---
  { name: 'Delta',                pattern: /\bDELTA\s*AIR/i,                                category: 'Travel', subcategory: 'Flight' },
  { name: 'American Airlines',    pattern: /AMERICAN\s*AIR|AA\.COM/i,                       category: 'Travel', subcategory: 'Flight' },
  { name: 'United Airlines',      pattern: /UNITED\s*AIR/i,                                 category: 'Travel', subcategory: 'Flight' },
  { name: 'Southwest Airlines',   pattern: /SOUTHWEST\s*AIR/i,                              category: 'Travel', subcategory: 'Flight' },
  { name: 'JetBlue',              pattern: /\bJETBLUE\b/i,                                  category: 'Travel', subcategory: 'Flight' },
  { name: 'Alaska Airlines',      pattern: /ALASKA\s*AIR/i,                                 category: 'Travel', subcategory: 'Flight' },
  { name: 'Spirit Airlines',      pattern: /SPIRIT\s*AIR/i,                                 category: 'Travel', subcategory: 'Flight' },
  { name: 'Frontier Airlines',    pattern: /FRONTIER\s*AIR/i,                               category: 'Travel', subcategory: 'Flight' },
  { name: 'British Airways',      pattern: /BRITISH\s*AIR/i,                                category: 'Travel', subcategory: 'Flight' },
  { name: 'Ryanair',              pattern: /\bRYANAIR\b/i,                                  category: 'Travel', subcategory: 'Flight' },
  { name: 'EasyJet',              pattern: /EASYJET/i,                                       category: 'Travel', subcategory: 'Flight' },
  { name: 'Wizz Air',             pattern: /WIZZ\s*AIR/i,                                   category: 'Travel', subcategory: 'Flight' },
  { name: 'Virgin Atlantic',      pattern: /VIRGIN\s*ATLANTIC/i,                            category: 'Travel', subcategory: 'Flight' },
  { name: 'Norwegian Air',        pattern: /NORWEGIAN\s*AIR/i,                              category: 'Travel', subcategory: 'Flight' },

  // --- Hotels ---
  { name: 'Marriott',             pattern: /\bMARRIOTT\b/i,                                 category: 'Travel', subcategory: 'Hotel' },
  { name: 'Hilton',               pattern: /\bHILTON\b/i,                                   category: 'Travel', subcategory: 'Hotel' },
  { name: 'Hyatt',                pattern: /\bHYATT\b/i,                                    category: 'Travel', subcategory: 'Hotel' },
  { name: 'IHG',                  pattern: /\bIHG\b|INTERCONTINENTAL|HOLIDAY\s*INN/i,       category: 'Travel', subcategory: 'Hotel' },
  { name: 'Best Western',         pattern: /BEST\s*WESTERN/i,                               category: 'Travel', subcategory: 'Hotel' },
  { name: 'Wyndham',              pattern: /\bWYNDHAM\b/i,                                  category: 'Travel', subcategory: 'Hotel' },
  { name: 'Choice Hotels',        pattern: /CHOICE\s*HOTEL|COMFORT\s*(?:INN|SUITES)/i,      category: 'Travel', subcategory: 'Hotel' },
  { name: 'Radisson',             pattern: /\bRADISSON\b/i,                                  category: 'Travel', subcategory: 'Hotel' },
  { name: 'Four Seasons',         pattern: /FOUR\s*SEASONS/i,                               category: 'Travel', subcategory: 'Hotel' },
  { name: 'Accor Hotels',         pattern: /\bACCOR\b|NOVOTEL|IBIS\b|SOFITEL/i,             category: 'Travel', subcategory: 'Hotel' },
  { name: 'Travelodge',           pattern: /\bTRAVELODGE\b/i,                               category: 'Travel', subcategory: 'Hotel' },
  { name: 'Premier Inn',          pattern: /PREMIER\s*INN/i,                                category: 'Travel', subcategory: 'Hotel' },

  // --- Vacation Rental ---
  { name: 'Airbnb',               pattern: /\bAIRBNB\b/i,                                   category: 'Travel', subcategory: 'Vacation Rental' },
  { name: 'VRBO',                 pattern: /\bVRBO\b/i,                                     category: 'Travel', subcategory: 'Vacation Rental' },
  { name: 'Booking.com',          pattern: /BOOKING\.COM/i,                                  category: 'Travel', subcategory: 'Hotel' },
  { name: 'Expedia',              pattern: /\bEXPEDIA\b/i,                                  category: 'Travel', subcategory: 'Hotel' },
  { name: 'Hotels.com',           pattern: /HOTELS\.COM/i,                                   category: 'Travel', subcategory: 'Hotel' },
  { name: 'Priceline',            pattern: /\bPRICELINE\b/i,                                category: 'Travel', subcategory: 'Hotel' },
  { name: 'Kayak',                pattern: /\bKAYAK\b/i,                                    category: 'Travel', subcategory: 'Hotel' },

  // --- Car Rental ---
  { name: 'Enterprise',           pattern: /ENTERPRISE\s*(?:RENT|RAC)/i,                    category: 'Travel', subcategory: 'Car Rental' },
  { name: 'Hertz',                pattern: /\bHERTZ\b/i,                                    category: 'Travel', subcategory: 'Car Rental' },
  { name: 'Avis',                 pattern: /\bAVIS\b/i,                                     category: 'Travel', subcategory: 'Car Rental' },
  { name: 'Budget Rent-A-Car',    pattern: /BUDGET\s*RENT/i,                                category: 'Travel', subcategory: 'Car Rental' },
  { name: 'National Car',         pattern: /NATIONAL\s*CAR/i,                               category: 'Travel', subcategory: 'Car Rental' },
  { name: 'Sixt',                 pattern: /\bSIXT\b/i,                                     category: 'Travel', subcategory: 'Car Rental' },
  { name: 'Turo',                 pattern: /\bTURO\b/i,                                     category: 'Travel', subcategory: 'Car Rental' },
  { name: 'Zipcar',               pattern: /\bZIPCAR\b/i,                                   category: 'Travel', subcategory: 'Car Rental' },
]

const HOUSING: MerchantRule[] = [
  // --- Utilities ---
  { name: 'PG&E',                 pattern: /PG\s*&?\s*E\b|PACIFIC\s*GAS/i,                  category: 'Housing', subcategory: 'Utilities' },
  { name: 'ConEdison',            pattern: /CON\s*EDISON|CONED\b/i,                         category: 'Housing', subcategory: 'Utilities' },
  { name: 'SoCal Edison',         pattern: /SOCAL\s*EDISON|SO\s*CAL\s*ED|SCE\b/i,           category: 'Housing', subcategory: 'Utilities' },
  { name: 'National Grid',        pattern: /NATIONAL\s*GRID/i,                              category: 'Housing', subcategory: 'Utilities' },
  { name: 'Duke Energy',          pattern: /DUKE\s*ENERGY/i,                                category: 'Housing', subcategory: 'Utilities' },
  { name: 'Dominion Energy',      pattern: /DOMINION\s*ENERGY/i,                            category: 'Housing', subcategory: 'Utilities' },
  { name: 'FPL',                  pattern: /\bFPL\b|FLORIDA\s*POWER/i,                      category: 'Housing', subcategory: 'Utilities' },
  { name: 'ComEd',                pattern: /\bCOMED\b|COMMONWEALTH\s*EDISON/i,              category: 'Housing', subcategory: 'Utilities' },
  { name: 'Xcel Energy',          pattern: /XCEL\s*ENERGY/i,                                category: 'Housing', subcategory: 'Utilities' },
  { name: 'Eversource',           pattern: /EVERSOURCE/i,                                    category: 'Housing', subcategory: 'Utilities' },
  { name: 'AEP',                  pattern: /\bAEP\b|AMERICAN\s*ELECTRIC/i,                  category: 'Housing', subcategory: 'Utilities' },
  { name: 'British Gas',          pattern: /BRITISH\s*GAS/i,                                category: 'Housing', subcategory: 'Utilities' },
  { name: 'EDF Energy',           pattern: /EDF\s*ENERGY/i,                                 category: 'Housing', subcategory: 'Utilities' },
  { name: 'SSE',                  pattern: /\bSSE\b.*(?:ENERGY)?/i,                         category: 'Housing', subcategory: 'Utilities' },
  { name: 'Scottish Power',       pattern: /SCOTTISH\s*POWER/i,                             category: 'Housing', subcategory: 'Utilities' },
  { name: 'Octopus Energy',       pattern: /OCTOPUS\s*ENERGY/i,                             category: 'Housing', subcategory: 'Utilities' },
  { name: 'Thames Water',         pattern: /THAMES\s*WATER/i,                               category: 'Housing', subcategory: 'Utilities' },
  { name: 'Water Bill (generic)', pattern: /WATER\s*(?:BILL|DEPT|UTIL|AUTHORITY|DISTRICT)/i, category: 'Housing', subcategory: 'Utilities' },
  { name: 'Sewer Bill (generic)', pattern: /SEWER\s*(?:BILL|DEPT|UTIL|AUTHORITY)/i,          category: 'Housing', subcategory: 'Utilities' },

  // --- Internet / Cable ---
  { name: 'Comcast / Xfinity',    pattern: /COMCAST|XFINITY/i,                              category: 'Housing', subcategory: 'Internet/Cable' },
  { name: 'Spectrum / Charter',   pattern: /\bSPECTRUM\b|CHARTER\s*COMM/i,                  category: 'Housing', subcategory: 'Internet/Cable' },
  { name: 'AT&T Internet',        pattern: /AT\s*&?\s*T\b.*(?:INTERNET|UVERSE|U-?VERSE|FIBER)/i, category: 'Housing', subcategory: 'Internet/Cable' },
  { name: 'Verizon Fios',         pattern: /VERIZON\s*FIOS/i,                               category: 'Housing', subcategory: 'Internet/Cable' },
  { name: 'Cox Communications',   pattern: /\bCOX\b.*COMM/i,                                category: 'Housing', subcategory: 'Internet/Cable' },
  { name: 'CenturyLink / Lumen',  pattern: /CENTURYLINK|LUMEN\s*TECH/i,                    category: 'Housing', subcategory: 'Internet/Cable' },
  { name: 'Frontier Comm',        pattern: /FRONTIER\s*COMM/i,                              category: 'Housing', subcategory: 'Internet/Cable' },
  { name: 'Google Fiber',         pattern: /GOOGLE\s*FIBER/i,                               category: 'Housing', subcategory: 'Internet/Cable' },
  { name: 'Starlink',             pattern: /STARLINK/i,                                      category: 'Housing', subcategory: 'Internet/Cable' },
  { name: 'BT (UK)',              pattern: /\bBT\b.*(?:GROUP|BROADBAND|SPORT)/i,             category: 'Housing', subcategory: 'Internet/Cable' },
  { name: 'Sky (UK)',             pattern: /\bSKY\b.*(?:UK|SUBS|TV|BROADBAND)/i,            category: 'Housing', subcategory: 'Internet/Cable' },
  { name: 'Virgin Media',         pattern: /VIRGIN\s*MEDIA/i,                               category: 'Housing', subcategory: 'Internet/Cable' },
  { name: 'TalkTalk',             pattern: /TALKTALK/i,                                      category: 'Housing', subcategory: 'Internet/Cable' },

  // --- Phone Bill ---
  { name: 'AT&T Wireless',        pattern: /AT\s*&?\s*T\b.*(?:WIRELESS|MOBILITY|MOBILE)/i,  category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'AT&T (generic)',       pattern: /\bAT\s*&?\s*T\b/i,                              category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'Verizon Wireless',     pattern: /VERIZON\s*(?:WIRELESS|WL|MOBILE)/i,             category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'Verizon (generic)',    pattern: /\bVERIZON\b/i,                                  category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'T-Mobile',             pattern: /T[\s-]*MOBILE/i,                                category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'Sprint',               pattern: /\bSPRINT\b.*(?:WIRELESS|PCS)?/i,                category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'Mint Mobile',          pattern: /MINT\s*MOBILE/i,                                category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'Google Fi',            pattern: /GOOGLE\s*FI\b/i,                                category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'Visible',              pattern: /\bVISIBLE\b.*(?:WIRELESS|SERVICE)/i,            category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'Cricket Wireless',     pattern: /CRICKET\s*WIRELESS/i,                           category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'Boost Mobile',         pattern: /BOOST\s*MOBILE/i,                               category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'Metro by T-Mobile',    pattern: /METRO\s*(?:PCS|BY\s*T)/i,                       category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'O2',                   pattern: /\bO2\b/i,                                       category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'EE',                   pattern: /\bEE\b.*(?:LTD|LIMITED)/i,                      category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'Three (UK)',           pattern: /\bTHREE\b.*(?:UK|MOBILE)/i,                     category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'Vodafone',             pattern: /\bVODAFONE\b/i,                                 category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'GiffGaff',             pattern: /GIFFGAFF/i,                                      category: 'Housing', subcategory: 'Phone Bill' },

  // --- Insurance (Home/Renters) ---
  { name: 'Lemonade',             pattern: /\bLEMONADE\b.*(?:INS)?/i,                       category: 'Housing', subcategory: 'Insurance' },
  { name: 'Renters Insurance',    pattern: /RENTERS?\s*INS/i,                               category: 'Housing', subcategory: 'Insurance' },
  { name: 'Home Insurance',       pattern: /HOME\s*(?:OWNERS?)?\s*INS/i,                    category: 'Housing', subcategory: 'Insurance' },
]

const TRANSFER: MerchantRule[] = [
  { name: 'Venmo',                pattern: /\bVENMO\b/i,                                    category: 'Transfer', subcategory: 'Transfer' },
  { name: 'Zelle',                pattern: /\bZELLE\b/i,                                    category: 'Transfer', subcategory: 'Transfer' },
  { name: 'Cash App',             pattern: /CASH\s*APP|SQUARE\s*CASH/i,                     category: 'Transfer', subcategory: 'Transfer' },
  { name: 'PayPal Transfer',      pattern: /PAYPAL\s*(?:TRANSFER|INST\s*XFER)/i,            category: 'Transfer', subcategory: 'Transfer' },
  { name: 'Wise (TransferWise)',  pattern: /\bWISE\b.*(?:TRANSFER|PAYMENT)|TRANSFERWISE/i,  category: 'Transfer', subcategory: 'Transfer' },
  { name: 'Wire Transfer',        pattern: /WIRE\s*(?:TRANSFER|TRF|PAYMENT)/i,              category: 'Transfer', subcategory: 'Transfer' },
  { name: 'ACH Transfer',         pattern: /ACH\s*(?:TRANSFER|CREDIT|DEBIT|PMT)/i,          category: 'Transfer', subcategory: 'Transfer' },
]

const INCOME: MerchantRule[] = [
  { name: 'Direct Deposit',       pattern: /DIRECT\s*DEP|DIR\s*DEP/i,                       category: 'Income', subcategory: 'Payroll' },
  { name: 'Payroll',              pattern: /\bPAYROLL\b/i,                                  category: 'Income', subcategory: 'Payroll' },
  { name: 'ADP',                  pattern: /\bADP\b.*(?:PAYROLL|PAY)?/i,                    category: 'Income', subcategory: 'Payroll' },
  { name: 'Gusto',                pattern: /\bGUSTO\b/i,                                    category: 'Income', subcategory: 'Payroll' },
  { name: 'Rippling',             pattern: /\bRIPPLING\b/i,                                 category: 'Income', subcategory: 'Payroll' },
  { name: 'Interest Payment',     pattern: /INTEREST\s*(?:PAYMENT|EARNED|PAID|CREDIT)/i,    category: 'Income', subcategory: 'Interest' },
  { name: 'Tax Refund (IRS)',     pattern: /IRS\s*TREAS|TAX\s*REF/i,                        category: 'Income', subcategory: 'Tax Refund' },
  { name: 'HMRC',                 pattern: /\bHMRC\b/i,                                     category: 'Income', subcategory: 'Tax Refund' },
]

const CHILDCARE: MerchantRule[] = [
  // --- Chain daycare / preschool ---
  { name: 'Bright Horizons',       pattern: /BRIGHT\s*HORIZONS?/i,                            category: 'Childcare', subcategory: 'Daycare' },
  { name: 'KinderCare',            pattern: /KINDER\s*CARE|KINDERCARE/i,                       category: 'Childcare', subcategory: 'Daycare' },
  { name: 'Champions',             pattern: /\bCHAMPIONS\b.*(?:BEFORE|AFTER|SCHOOL)/i,        category: 'Childcare', subcategory: 'After School' },
  { name: 'The Goddard School',    pattern: /GODDARD\s*SCHOOL/i,                               category: 'Childcare', subcategory: 'Preschool' },
  { name: 'Primrose Schools',      pattern: /PRIMROSE\s*SCHOOL/i,                              category: 'Childcare', subcategory: 'Preschool' },
  { name: 'La Petite Academy',     pattern: /LA\s*PETITE\s*ACAD/i,                             category: 'Childcare', subcategory: 'Daycare' },
  { name: 'Childtime',             pattern: /\bCHILDTIME\b/i,                                 category: 'Childcare', subcategory: 'Daycare' },
  { name: 'Kiddie Academy',        pattern: /KIDDIE\s*ACADEMY/i,                               category: 'Childcare', subcategory: 'Daycare' },
  { name: 'The Learning Experience', pattern: /LEARNING\s*EXPERIENCE|TLE\s*SCHOOL/i,           category: 'Childcare', subcategory: 'Preschool' },
  { name: 'Kids R Kids',           pattern: /KIDS\s*R\s*KIDS/i,                                category: 'Childcare', subcategory: 'Daycare' },
  { name: 'Tutor Time',            pattern: /TUTOR\s*TIME/i,                                   category: 'Childcare', subcategory: 'Daycare' },
  { name: 'Crème de la Crème',     pattern: /CR[EÈ]ME\s*DE\s*LA|CREME\s*DE\s*LA/i,            category: 'Childcare', subcategory: 'Daycare' },
  { name: 'Cadence Education',     pattern: /CADENCE\s*EDUCATION/i,                            category: 'Childcare', subcategory: 'Daycare' },
  { name: 'Learning Care Group',   pattern: /LEARNING\s*CARE\s*GROUP/i,                        category: 'Childcare', subcategory: 'Daycare' },
  { name: 'Children of America',   pattern: /CHILDREN\s*OF\s*AMERICA/i,                        category: 'Childcare', subcategory: 'Daycare' },
  { name: 'Lightbridge Academy',   pattern: /LIGHTBRIDGE\s*ACAD/i,                             category: 'Childcare', subcategory: 'Daycare' },
  { name: 'Celebree School',       pattern: /CELEBREE/i,                                       category: 'Childcare', subcategory: 'Daycare' },
  { name: 'Busy Bees',             pattern: /BUSY\s*BEES/i,                                    category: 'Childcare', subcategory: 'Daycare' },
  { name: 'Montessori',            pattern: /\bMONTESSORI\b/i,                                 category: 'Childcare', subcategory: 'Preschool' },

  // --- UK childcare ---
  { name: 'Kidsunlimited',         pattern: /KIDSUNLIMITED|KIDS\s*UNLIMITED/i,                 category: 'Childcare', subcategory: 'Daycare' },
  { name: 'Bright Little Stars',   pattern: /BRIGHT\s*LITTLE\s*STARS/i,                        category: 'Childcare', subcategory: 'Daycare' },
  { name: 'N Family Club',         pattern: /N\s*FAMILY\s*CLUB/i,                              category: 'Childcare', subcategory: 'Daycare' },

  // --- Generic patterns ---
  { name: 'Daycare (generic)',     pattern: /\bDAYCARE\b|\bDAY\s*CARE\b/i,                     category: 'Childcare', subcategory: 'Daycare' },
  { name: 'Childcare (generic)',   pattern: /\bCHILD\s*CARE\b|\bCHILDCARE\b/i,                 category: 'Childcare', subcategory: 'Daycare' },
  { name: 'Preschool (generic)',   pattern: /\bPRESCHOOL\b|\bPRE[\s-]SCHOOL\b/i,               category: 'Childcare', subcategory: 'Preschool' },
  { name: 'After School (generic)', pattern: /\bAFTER\s*SCHOOL\b/i,                            category: 'Childcare', subcategory: 'After School' },
  { name: 'Summer Camp (generic)', pattern: /\bSUMMER\s*CAMP\b/i,                              category: 'Childcare', subcategory: 'Summer Camp' },
]

const EDUCATION: MerchantRule[] = [
  // --- Student Loans ---
  { name: 'Navient',               pattern: /\bNAVIENT\b/i,                                   category: 'Education', subcategory: 'Student Loan' },
  { name: 'Nelnet',                pattern: /\bNELNET\b/i,                                    category: 'Education', subcategory: 'Student Loan' },
  { name: 'Great Lakes',           pattern: /GREAT\s*LAKES.*(?:LOAN|EDUC)/i,                   category: 'Education', subcategory: 'Student Loan' },
  { name: 'FedLoan / MOHELA',     pattern: /\bFEDLOAN\b|\bMOHELA\b/i,                         category: 'Education', subcategory: 'Student Loan' },
  { name: 'SoFi Student Loan',    pattern: /SOFI.*(?:STUDENT|LOAN|EDU)/i,                      category: 'Education', subcategory: 'Student Loan' },
  { name: 'Student Loan (generic)', pattern: /STUDENT\s*LOAN/i,                                category: 'Education', subcategory: 'Student Loan' },

  // --- Tutoring ---
  { name: 'Kumon',                 pattern: /\bKUMON\b/i,                                     category: 'Education', subcategory: 'Tutoring' },
  { name: 'Sylvan Learning',      pattern: /SYLVAN\s*LEARN/i,                                  category: 'Education', subcategory: 'Tutoring' },
  { name: 'Mathnasium',           pattern: /\bMATHNASIUM\b/i,                                  category: 'Education', subcategory: 'Tutoring' },
  { name: 'Wyzant',               pattern: /\bWYZANT\b/i,                                     category: 'Education', subcategory: 'Tutoring' },
  { name: 'Varsity Tutors',       pattern: /VARSITY\s*TUTOR/i,                                 category: 'Education', subcategory: 'Tutoring' },

  // --- Online Learning ---
  { name: 'Coursera',             pattern: /\bCOURSERA\b/i,                                   category: 'Education', subcategory: 'Online Course' },
  { name: 'Udemy',                pattern: /\bUDEMY\b/i,                                      category: 'Education', subcategory: 'Online Course' },
  { name: 'Skillshare',           pattern: /\bSKILLSHARE\b/i,                                 category: 'Education', subcategory: 'Online Course' },
  { name: 'LinkedIn Learning',    pattern: /LINKEDIN\s*LEARN/i,                                category: 'Education', subcategory: 'Online Course' },
  { name: 'MasterClass',          pattern: /\bMASTERCLASS\b|MASTER\s*CLASS/i,                  category: 'Education', subcategory: 'Online Course' },
  { name: 'Brilliant',            pattern: /\bBRILLIANT\.ORG\b/i,                             category: 'Education', subcategory: 'Online Course' },
  { name: 'Khan Academy',         pattern: /KHAN\s*ACADEMY/i,                                  category: 'Education', subcategory: 'Online Course' },

  // --- Test Prep ---
  { name: 'Kaplan',               pattern: /\bKAPLAN\b.*(?:TEST|PREP|EDU)?/i,                  category: 'Education', subcategory: 'Test Prep' },
  { name: 'Princeton Review',     pattern: /PRINCETON\s*REVIEW/i,                              category: 'Education', subcategory: 'Test Prep' },
  { name: 'College Board',        pattern: /COLLEGE\s*BOARD|COLLEGEBOARD/i,                    category: 'Education', subcategory: 'Test Prep' },
  { name: 'ACT Inc',              pattern: /\bACT\s*INC\b/i,                                  category: 'Education', subcategory: 'Test Prep' },

  // --- Generic patterns ---
  { name: 'Tuition (generic)',    pattern: /\bTUITION\b/i,                                    category: 'Education', subcategory: 'Tuition' },
]

// ---------------------------------------------------------------------------
// Consolidated rule list — ORDER MATTERS (first match wins)
// ---------------------------------------------------------------------------

/** All merchant rules in matching priority order.
 *  More-specific patterns (e.g. "Costco Gas") should come before less-specific
 *  ones (e.g. "Costco"). The category arrays are ordered accordingly. */
export const ALL_RULES: MerchantRule[] = [
  // Income first — we want payroll to win before a generic pattern
  ...INCOME,
  // Transfer — Venmo/Zelle before generic patterns
  ...TRANSFER,
  // Subscriptions early — Apple/Google subs should win before "Apple Store"
  ...SUBSCRIPTIONS,
  // Transport (includes "Costco Gas" which must match before "Costco")
  ...TRANSPORT,
  // Groceries (includes "Costco" generic)
  ...GROCERIES,
  // Dining
  ...DINING,
  // Shopping
  ...SHOPPING,
  // Entertainment
  ...ENTERTAINMENT,
  // Childcare — specific chain names, won't conflict
  ...CHILDCARE,
  // Education — student loans, tutoring, online learning
  ...EDUCATION,
  // Health
  ...HEALTH,
  // Travel
  ...TRAVEL,
  // Housing — most generic patterns last
  ...HOUSING,
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to classify a bank-statement description using the static lookup table.
 * Returns null if no merchant pattern matches (caller should fall back to the API).
 *
 * @param rawDescription - The raw description from the bank CSV
 */
export function classifyByMerchant(rawDescription: string): ClassificationResult | null {
  const desc = rawDescription.trim().toUpperCase()
  if (!desc) return null

  // Try matching against raw description first
  for (const rule of ALL_RULES) {
    if (rule.pattern.test(desc)) {
      return {
        category: rule.category,
        subcategory: rule.subcategory,
        merchant: rule.name,
      }
    }
  }

  // If no match, try stripping processor prefix and re-matching
  const stripped = stripProcessorPrefix(desc)
  if (stripped !== desc) {
    for (const rule of ALL_RULES) {
      if (rule.pattern.test(stripped)) {
        return {
          category: rule.category,
          subcategory: rule.subcategory,
          merchant: rule.name,
        }
      }
    }
  }

  return null
}

/**
 * Convenience: returns true if the description matches any known merchant.
 */
export function isKnownMerchant(rawDescription: string): boolean {
  return classifyByMerchant(rawDescription) !== null
}
