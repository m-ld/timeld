import _humanizeDuration from 'humanize-duration';
import _parseDuration from 'parse-duration';
import { parseDate as _parseDate } from 'chrono-node';

/**
 * @param {Date} date
 * @returns {{'@value': string, '@type': string}}
 * @todo replace with normaliseValue in m-ld-js v0.9
 */
export function dateJsonLd(date) {
  return {
    '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
    '@value': date.toISOString()
  };
}

/**
 * @param {number} duration in fractional minutes
 * @returns formatted duration as a string
 */
export function formatDuration(duration) {
  return _humanizeDuration(duration * 60000);
}

export { format as formatTimeAgo } from 'timeago.js';

/**
 * @param {string} durationStr human duration
 * @return {number} duration in fractional minutes
 */
export function parseDuration(durationStr) {
  return _parseDuration(durationStr, 'm');
}

/**
 * @param {string | string[]} dateStr human date, can be an array of words
 * @returns {Date}
 */
export function parseDate(dateStr) {
  return _parseDate(Array.isArray(dateStr) ? dateStr.join(' ') : dateStr);
}

/**
 * @param {Date} date
 * @returns {string} locale-formatted date
 */
export function formatDate(date) {
  return date.toLocaleString();
}