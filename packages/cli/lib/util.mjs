import _humanizeDuration from 'humanize-duration';
import _parseDuration from 'parse-duration';
import { parseDate as _parseDate } from 'chrono-node';
import isURL from 'validator/lib/isURL.js';
import { AccountOwnedId } from 'timeld-common';

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
  // Capture an unqualified number to mean minutes
  // noinspection JSCheckFunctionSignatures isNaN does accept strings
  if (!isNaN(durationStr))
    return Number(durationStr);
  // Otherwise interpret as minutes
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

/**
 * Convert just about any JSON value into a duration
 * @param {*} value
 * @returns {number}
 * @throws {RangeError} if not interpretable
 */
export function toDuration(value) {
  if (typeof value == 'string')
    value = parseDuration(value);
  if (typeof value != 'number' || isNaN(value))
    throw new RangeError(`Cannot interpret ${value} as a duration`);
  return value;
}

/**
 * Convert just about any JSON value into an IRI string
 * @param {*} id
 * @returns {string|null}
 * @throws {RangeError} if not interpretable
 */
export function toIri(id) {
  if (typeof id == 'object' && id?.['@id'] != null)
    return id['@id'];
  if (id != null) {
    if (typeof id != 'string' ||
      !(isURL(id) || AccountOwnedId.isComponentId(id)))
      throw new RangeError('ID must be a URL or an identifier');
  }
  return id ?? null;
}

/**
 * Convert just about any JSON value into a Date
 * @param {*} value
 * @returns {Date}
 * @throws {RangeError} if not interpretable
 */
export function toDate(value) {
  if (value instanceof Date)
    return value;
  else if (typeof value == 'string')
    return toDate(parseDate(value)); // Parse may return null
  else if (value != null && typeof value == 'object')
    return toDate(parseDate(value['@value'])); // Parse may return null
  else
    throw new RangeError(`Cannot interpret ${value} as a Date`);
}