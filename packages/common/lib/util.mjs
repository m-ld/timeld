import { propertyValue } from '@m-ld/m-ld';
import dns from 'dns/promises';
import isFQDN from 'validator/lib/isFQDN.js';

/**
 * @param {import('@m-ld/m-ld').Reference[]} refs
 * @returns {Set<string>}
 */
export function idSet(refs) {
  return new Set(refs.map(ref => ref['@id']));
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

/**
 * Shorthand for description metadata
 * @param {string} doc
 * @returns {{ metadata: { description: string } }}
 */
export const withDoc = doc => ({
  metadata: { description: doc }
});

// noinspection HttpUrlsUsage
/**
 * Leaves an already-absolute URI alone
 * @param {string} iri
 * @param {string} domainName
 * @returns {string}
 */
export const domainRelativeIri = (iri, domainName) =>
  new URL(iri, `http://${domainName}`).toString();

/**
 * @param {string} pathname
 * @returns {string}
 */
export function lastPathComponent(pathname) {
  return pathname.substring(pathname.lastIndexOf('/') + 1);
}

/**
 * @param {string} address
 * @returns {{ root: URL | Promise<URL>, domainName: string }}
 */
export function resolveGateway(address) {
  if (isFQDN(address)) {
    return { root: new URL(`https://${address}/`), domainName: address };
  } else {
    const url = new URL('/', address);
    const domainName = url.hostname;
    if (domainName.endsWith('.local')) {
      return {
        root: dns.lookup(domainName).then(a => {
          url.hostname = a.address;
          return url;
        }),
        domainName
      };
    } else {
      return { root: url, domainName };
    }
  }
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