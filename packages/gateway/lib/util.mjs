import { propertyValue } from '@m-ld/m-ld';
import jsonwebtoken from 'jsonwebtoken';

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
 * Promisified version of jsonwebtoken.verify
 * @param {string} token
 * @param {(header: import('jsonwebtoken').JwtHeader) => Promise<string>} getSecret
 * @returns {Promise<import('jsonwebtoken').JwtPayload>}
 */
export function verify(token, getSecret) {
  return new Promise((resolve, reject) =>
    jsonwebtoken.verify(token, (header, cb) => {
      getSecret(header).then(secret => cb(null, secret), err => cb(err));
    }, (err, payload) => {
      if (err) reject(err);
      else resolve(payload);
    }));
}