import { AuthKey, UserKey } from '../index.mjs';

/**
 * @implements AppPrincipal
 */
export default class TimeldPrincipal {
  /**
   * @param {string} id absolute principal IRI
   * @param {UserKeyConfig} config
   */
  constructor(id, config) {
    this['@id'] = id;
    this.authKey = AuthKey.fromString(config.auth.key);
    this.userKey = UserKey.fromConfig(config);
  }

  toConfig() {
    return this.userKey.toConfig(this.authKey);
  }

  sign(data) {
    return this.userKey.sign(data, this.authKey);
  }

  /**
   * @param {string | Buffer | object} payload
   * @param {import('jsonwebtoken').SignOptions} [options]
   * @returns {Promise<string>} JWT
   */
  signJwt(payload, options) {
    // noinspection JSCheckFunctionSignatures
    return this.userKey.signJwt(payload, this.authKey, options);
  }

  /**
   * @returns {[string, KeyObject]} Arguments for HTTP signing
   */
  getSignHttpArgs() {
    return this.userKey.getSignHttpArgs(this.authKey);
  }
}