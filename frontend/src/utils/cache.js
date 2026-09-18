/**
 * Client-Side In-Memory & Session Cache for ControlCenter
 * 
 * Provides instantaneous (0ms) perceived navigation between tabs (Ventas, Inventario, Presupuestos)
 * even over high-latency transatlantic connections (200-400ms).
 * Follows the Stale-While-Revalidate paradigm: render cached data immediately,
 * then seamlessly refresh in the background.
 */

const memoryCache = new Map()

export const CacheKeys = {
  INVENTORY: 'cc_cache_inventory',
  INVENTORY_SUMMARY: 'cc_cache_inventory_summary',
  SALES: 'cc_cache_sales',
  QUOTES: 'cc_cache_quotes'
}

const DEFAULT_TTL_MS = 3 * 60 * 1000 // 3 minutes fresh window

/**
 * Retrieve cached data if present and not expired.
 * Returns null if no valid cache exists.
 */
export const getCachedData = (key, maxAgeMs = DEFAULT_TTL_MS) => {
  try {
    const mem = memoryCache.get(key)
    if (mem && (Date.now() - mem.timestamp < maxAgeMs)) {
      return mem.data
    }

    const stored = sessionStorage.getItem(key)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed && (Date.now() - parsed.timestamp < maxAgeMs)) {
        memoryCache.set(key, parsed)
        return parsed.data
      }
    }
  } catch (e) {
    console.warn("[Cache] Read error for key:", key, e)
  }
  return null
}

/**
 * Store data in memory and sessionStorage.
 */
export const setCachedData = (key, data) => {
  try {
    const entry = { data, timestamp: Date.now() }
    memoryCache.set(key, entry)
    try {
      sessionStorage.setItem(key, JSON.stringify(entry))
    } catch (storageErr) {
      // If sessionStorage quota exceeded, memoryCache remains operational
      console.warn("[Cache] SessionStorage quota exceeded, using memory only for:", key)
    }
  } catch (e) {
    console.warn("[Cache] Write error for key:", key, e)
  }
}

/**
 * Invalidate cache entries matching a prefix or pattern.
 * E.g. invalidateCache('inventory') invalidates both full and summary inventory.
 */
export const invalidateCache = (pattern) => {
  try {
    if (!pattern) {
      memoryCache.clear()
      sessionStorage.clear()
      return
    }

    for (const key of memoryCache.keys()) {
      if (key.includes(pattern)) {
        memoryCache.delete(key)
      }
    }

    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i)
      if (key && key.includes(pattern)) {
        sessionStorage.removeItem(key)
      }
    }
  } catch (e) {
    console.warn("[Cache] Invalidate error:", e)
  }
}
