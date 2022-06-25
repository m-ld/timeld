import _humanizeDuration from 'humanize-duration';
import _parseDuration from 'parse-duration';
import { parseDate as _parseDate } from 'chrono-node';

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
 * @param {Date} start
 * @param {Date} end
 * @returns {number} duration in fractional minutes
 */
export function durationFromInterval(start, end) {
  // Round to the second then convert to minutes
  return Math.round((end.getTime() - start.getTime()) / 1000) / 60;
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