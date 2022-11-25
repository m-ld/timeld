import { ClassicLevel } from 'classic-level';
import { clone as meldClone, propertyValue } from '@m-ld/m-ld';
import { AuthKey, UserKey } from '../index.mjs';
import { timeldVocab } from '../data/index.mjs';

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
      { principal },
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

/**
 * @implements {InitialApp}
 */
export class TimeldApp {
  /**
   * @param {string} domain
   * @param {TimeldPrincipal} principal
   */
  constructor(domain, principal) {
    this.principal = principal;
    // noinspection JSUnusedGlobalSymbols
    this.transportSecurity = {
      wire: data => data, // We don't apply wire encryption, yet
      sign: this.sign,
      verify: TimeldApp.verify(domain)
    };
    // TODO: Security constraint: only gateway can add/remove users
  }

  /**
   * @param {Buffer} data
   * @returns {{sig: Buffer, pid: string}}
   */
  sign = data => ({
    sig: this.principal.signData(data),
    pid: this.principal['@id']
  });

  /**
   * @param {string} domain name
   * @returns import('@m-ld/m-ld').MeldTransportSecurity['verify']
   */
  static verify(domain) {
    return async (data, attr, state) => {
      // Load the declared user info from the data
      const [keyid] = UserKey.splitSignature(attr.sig);
      // Gotcha: verify is called without a context; all IRIs must be absolute
      const keyRef = UserKey.refFromKeyid(keyid, domain);
      const exists = await state.ask({
        '@where': { '@id': attr.pid, [timeldVocab('key')]: keyRef }
      });
      if (!exists)
        throw new Error(`Principal ${attr.pid} not found`);
      const keySrc = await state.get(keyRef['@id']);
      // noinspection JSCheckFunctionSignatures
      const userKey = new UserKey({
        keyid: UserKey.keyidFromRef(keySrc),
        publicKey: propertyValue(keySrc, timeldVocab('public'), Uint8Array)
      });
      if (!userKey.verify(attr.sig, data))
        throw new Error('Signature not valid');
    };
  }
}
