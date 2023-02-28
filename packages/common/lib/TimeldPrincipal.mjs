import Principal from '../data/Principal.mjs';
import UserKey from '../data/UserKey.mjs';
import AuthKey from './AuthKey.mjs';

/**
 * @implements AppPrincipal
 */
export default class TimeldPrincipal extends Principal {
  /**
   * @param {string} id absolute principal IRI
   * @param {UserKeyConfig} config
   * @param {boolean} [isGateway] default `false` for Account
   */
  constructor(id, config, isGateway = false) {
    super({
      id, type: isGateway ? 'Gateway' : 'Account', key: UserKey.fromConfig(config)
    });
    this.authKey = AuthKey.fromString(config.auth.key);
  }

  /** Disambiguation from auth key */
  get userKey() {
    return this.key;
  }

  toConfig() {
    return this.userKey.toConfig(this.authKey);
  }

  /**
   * @param {Buffer} data
   * @returns {Buffer}
   */
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