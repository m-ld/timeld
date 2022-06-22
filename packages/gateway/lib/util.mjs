import jsonwebtoken from 'jsonwebtoken';

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