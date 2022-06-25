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

/**
 * @param {import('@m-ld/m-ld').Reference[]} refs
 * @returns {Set<string>}
 */
export function idSet(refs) {
  return new Set(refs.map(ref => ref['@id']));
}

export function optionalPropertyValue(src, property, type) {
  // TODO: Array is the only way to do Optional fields until m-ld-js v0.9
  return propertyValue(src, property, Array, type)[0];
}

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
 * @param {string|number} value
 * @returns {import('jtd').Schema}
 */
export const mustBe = value => ({ enum: [value] });

/**
 * @type {import('jtd').Schema}
 */
export const isReference = { properties: { '@id': { type: 'string' } } };

/**
 * @type {import('jtd').Schema}
 */
export const isDate = {
  properties: {
    '@type': mustBe('http://www.w3.org/2001/XMLSchema#dateTime'),
    '@value': { type: 'timestamp' }
  }
};
