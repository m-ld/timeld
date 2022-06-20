import { propertyValue } from '@m-ld/m-ld';

/**
 * @param {import('@m-ld/m-ld').Subject} subject may contain the property
 * @param {string} property property in the subject
 * @returns {import('@m-ld/m-ld').Reference[]}
 */
export function safeRefsIn(subject, property) {
  try {
    // TODO: Use Array of Reference in m-ld-js v0.9
    return propertyValue(subject, property, Array, Object)
      .filter(ref => ref['@id'] != null);
  } catch (e) {
    return [];
  }
}