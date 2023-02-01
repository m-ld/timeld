import { ClassicLevel } from 'classic-level';
import { clone as meldClone } from '@m-ld/m-ld';
import { AuthKey, UserKey } from '../index.mjs';
import { TimeldApp } from './TimeldApp.mjs';

/**
 * @abstract
 */
export class CloneFactory {
  /**
   * @param {TimeldConfig} config
   * @param {string} dataDir
   * @param {TimeldPrincipal} [principal]
   * @returns {Promise<MeldClone>}
   */
  async clone(config, dataDir, principal) {
    // noinspection JSCheckFunctionSignatures
    return meldClone(
      new ClassicLevel(dataDir),
      await this.remotes(config),
      config,
      new TimeldApp(config['@domain'], principal));
  }

  /**
   * @param {MeldConfig} config
   * @returns {ConstructRemotes | Promise<ConstructRemotes>}
   */
  remotes(config) {
    throw undefined;
  }

  /**
   * @param {MeldConfig} config
   * @returns {Partial<MeldConfig>} the subset of configuration that can be
   * re-used by other engines cloning the same domains
   */
  reusableConfig(config) {
    const { networkTimeout, maxOperationSize, logLevel } = config;
    return { networkTimeout, maxOperationSize, logLevel };
  }
}

/**
 * @implements AppPrincipal
 */
export class TimeldPrincipal {
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

  /**
   * We do not implement sign, it's delegated to the userKey
   * @type {*}
   */
  sign = undefined;

  /**
   * @param {Buffer} data
   * @returns {Buffer}
   */
  signData(data) {
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

