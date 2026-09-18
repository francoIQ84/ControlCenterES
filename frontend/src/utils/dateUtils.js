/**
 * Date and Time utilities enforcing America/Argentina/Buenos_Aires timezone (UTC-3)
 * across all ControlCenter UI components and tables.
 */

export const ARGENTINA_TIMEZONE = 'America/Argentina/Buenos_Aires';

/**
 * Parses a date value into a valid Date object.
 * If the input is a naive ISO or datetime string without timezone (e.g. '2026-09-18 14:30:00' or '2026-09-18T14:30:00'),
 * it treats the string as already representing Argentina local time (-03:00) so no unexpected
 * browser shifts occur.
 */
export function parseToDate(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? null : dateVal;

  let str = String(dateVal).trim();
  if (!str) return null;

  // If naive datetime string (YYYY-MM-DD or YYYY-MM-DD HH:mm:ss without timezone offset or Z)
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(str)) {
    // Standardize separator to T and append Argentina UTC-3 offset
    str = str.replace(' ', 'T') + '-03:00';
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    str = str + 'T12:00:00-03:00';
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format a date/time into Argentine format: DD/MM/YYYY, HH:mm[:ss]
 * e.g. "18/9/2026, 14:30:00"
 */
export function formatDateTimeAR(dateVal, options = {}) {
  const d = parseToDate(dateVal);
  if (!d) return typeof dateVal === 'string' ? dateVal : '';

  try {
    return d.toLocaleString('es-AR', {
      timeZone: ARGENTINA_TIMEZONE,
      ...options
    });
  } catch (e) {
    return d.toLocaleString('es-AR', options);
  }
}

/**
 * Format a date into Argentine format: DD/MM/YYYY
 * e.g. "18/9/2026"
 */
export function formatDateAR(dateVal, options = {}) {
  const d = parseToDate(dateVal);
  if (!d) return typeof dateVal === 'string' ? dateVal : '';

  try {
    return d.toLocaleDateString('es-AR', {
      timeZone: ARGENTINA_TIMEZONE,
      ...options
    });
  } catch (e) {
    return d.toLocaleDateString('es-AR', options);
  }
}

/**
 * Format a time into Argentine format: HH:mm[:ss]
 * e.g. "14:30"
 */
export function formatTimeAR(dateVal, options = { hour: '2-digit', minute: '2-digit' }) {
  const d = parseToDate(dateVal);
  if (!d) return typeof dateVal === 'string' ? dateVal : '';

  try {
    return d.toLocaleTimeString('es-AR', {
      timeZone: ARGENTINA_TIMEZONE,
      ...options
    });
  } catch (e) {
    return d.toLocaleTimeString('es-AR', options);
  }
}
