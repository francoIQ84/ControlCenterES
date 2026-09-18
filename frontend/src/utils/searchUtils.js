/**
 * Search Utilities for ControlCenter
 * 
 * Provides robust, accent-insensitive, multi-word matching across fields
 * to eliminate search failures, rigid substring constraints, and typos with diacritics.
 */

/**
 * Normalizes a string by stripping accents/diacritics, lowercasing, and trimming.
 * e.g. "Conductímetro PH" -> "conductimetro ph"
 *      "Lana de Roca" -> "lana de roca"
 */
export const normalizeSearchText = (text) => {
  if (text === null || text === undefined) return ''
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Strips all non-digit characters from text.
 * Useful for matching formatted phone numbers or documents.
 * e.g. "+54 9 (341) 555-1234" -> "5493415551234"
 */
export const cleanDigits = (text) => {
  if (!text) return ''
  return String(text).replace(/\D/g, '')
}

/**
 * Checks whether the target text (or array of target texts) matches all space-separated
 * words in the search query.
 * 
 * - Accent-insensitive: "lana" matches "Lána", "hidroponia" matches "Hidroponía"
 * - Multi-word / unordered: "lana roca" matches "Kit Lana de Roca 50u"
 * - Substring matching for each token: all words must be found.
 * 
 * @param {string|number|(string|number)[]} targets - Target field or array of target fields
 * @param {string} query - The search query input
 * @returns {boolean} True if every token in query is found in the target fields
 */
export const matchesQuery = (targets, query) => {
  if (!query || typeof query !== 'string') return true
  const normQuery = normalizeSearchText(query)
  if (!normQuery) return true

  const tokens = normQuery.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true

  let combinedTarget = ''
  if (Array.isArray(targets)) {
    combinedTarget = targets
      .filter(t => t !== null && t !== undefined)
      .map(normalizeSearchText)
      .join(' ')
  } else {
    combinedTarget = normalizeSearchText(targets)
  }

  // Every token in the query must be present in the target
  return tokens.every(token => combinedTarget.includes(token))
}

/**
 * Matches phone numbers or identification documents flexibly:
 * Supports searching with or without spaces, country codes, dashes, dots.
 * 
 * @param {string|number} phoneOrDoc - The raw phone or document in data
 * @param {string} query - The user search input
 * @returns {boolean} True if query digits match target digits
 */
export const matchesPhoneOrDoc = (phoneOrDoc, query) => {
  if (!query || !phoneOrDoc) return false
  const rawTarget = cleanDigits(phoneOrDoc)
  const rawQuery = cleanDigits(query)
  if (rawQuery.length >= 3 && rawTarget.includes(rawQuery)) {
    return true
  }
  return false
}
