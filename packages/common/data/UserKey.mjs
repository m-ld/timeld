import { normaliseValue, Optional, propertyValue } from '@m-ld/m-ld';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'crypto';
import AuthKey from '../lib/AuthKey.mjs';
import { domainRelativeIri, signJwt, verifyJwt } from '../lib/util.mjs';

/**
 * @typedef {object} UserKeyConfig
 * @property {string} auth.key
 * @property {string} key.public
 * @property {string} key.private
 */

/**
 * User Key details, appears in:
 * 1. Gateway domain, with all details
 * 2. Timesheet domains, without private key (for sig verify)
 * 3. Client configuration, without revocation (assumed true)
 */
export default class UserKey {
  /**
   * From m-ld subject representation
   * @param {GraphSubject} src
   */
  static fromJSON(src) {
    // noinspection JSCheckFunctionSignatures
    return new UserKey({
      keyid: this.keyidFromRef(src),
      name: propertyValue(src, 'name', Optional, String),
      publicKey: propertyValue(src, 'public', Uint8Array),
      privateKey: propertyValue(src, 'private', Optional, Uint8Array),
      revoked: propertyValue(src, 'revoked', Optional, Boolean)
    });
  }

  /**
   * From client config – no name or revocation
   * @param {UserKeyConfig} config
   * @returns {UserKey}
   */
  static fromConfig(config) {
    return new UserKey({
      keyid: AuthKey.fromString(config.auth.key).keyid,
      publicKey: Buffer.from(config.key.public, 'base64'),
      privateKey: Buffer.from(config.key.private, 'base64')
    });
  }

  /**
   * @param {Reference} ref
   * @returns {string}
   * @throws {TypeError} if the reference is not to a user key
   */
  static keyidFromRef(ref) {
    // noinspection JSCheckFunctionSignatures
    const id = ref['@id'].includes('//') ?
      new URL(ref['@id']).pathname.slice(1) : ref['@id'];
    if (!/^\.\w{5,}$/.test(id))
      throw new TypeError(`Unexpected user key identity format "${id}"`);
    return id.slice(1);
  }

  /**
   * @param {string} keyid
   * @param {string} [domain] if passed, returns an absolute reference
   * @returns {Reference}
   */
  static refFromKeyid(keyid, domain) {
    const id = `.${keyid}`;
    return { '@id': domain ? domainRelativeIri(id, domain) : id };
  }

  /**
   * @param {Uint8Array} data
   * @returns {[string?, Uint8Array]} keyid and crypto signature
   */
  static splitSignature(data) {
    const buf = Buffer.from(data);
    const delim = buf.indexOf(':');
    if (delim < 5)
      return [undefined, data];
    return [buf.subarray(0, delim).toString(), buf.subarray(delim + 1)];
  }

  /**
   * @param {AuthKey | string} authKey
   */
  static generate(authKey) {
    if (typeof authKey == 'string')
      authKey = AuthKey.fromString(authKey);
    // noinspection JSCheckFunctionSignatures
    return new UserKey({
      keyid: authKey.keyid,
      ...generateKeyPairSync('rsa', {
        modulusLength: 1024,
        publicKeyEncoding: this.encoding.public,
        privateKeyEncoding: this.encoding.private(authKey)
      })
    });
  }

  static encoding = {
    public: { type: 'spki', format: 'der' },
    /** @param {AuthKey} authKey */
    private: authKey => ({
      type: 'pkcs8',
      format: 'der',
      cipher: 'aes-256-cbc',
      passphrase: authKey.secret
    })
  };

  /**
   * @param {string} keyid
   * @param {string} [name]
   * @param {Uint8Array} publicKey
   * @param {Uint8Array} [privateKey]
   * @param {boolean} [revoked]
   */
  constructor({
    keyid,
    name,
    publicKey,
    privateKey,
    revoked = false
  }) {
    this.keyid = keyid;
    this.name = name;
    this.publicKey = Buffer.from(publicKey);
    /**@private*/
    this.privateKey = privateKey && Buffer.from(privateKey);
    this.revoked = revoked;
  }

  /**
   * @param {AuthKey} authKey
   * @returns {boolean} `false` if the auth key does not correspond to this user key
   */
  matches(authKey) {
    if (authKey.keyid !== this.keyid)
      return false; // Shortcut
    try {
      return !!this.getCryptoPrivateKey(authKey);
    } catch (e) {
      // ERR_OSSL_EVP_BAD_DECRYPT if the secret is wrong
      return false;
    }
  }

  /**
   * @param {Uint8Array} data
   * @param {AuthKey} authKey
   * @return {Buffer}
   */
  sign(data, authKey) {
    return Buffer.concat([
      Buffer.from(`${this.keyid}:`),
      sign('RSA-SHA256', data, this.getCryptoPrivateKey(authKey))
    ]);
  }

  /**
   * @param {Uint8Array} sig
   * @param {Uint8Array} data
   */
  verify(sig, data) {
    const [keyid, cryptoSig] = UserKey.splitSignature(sig);
    if (keyid !== this.keyid)
      return false;
    return verify('RSA-SHA256', data, this.getCryptoPublicKey(), cryptoSig);
  }

  /**
   * @param {string | Buffer | object} payload
   * @param {AuthKey} authKey
   * @param {import('jsonwebtoken').SignOptions} [options]
   * @returns {Promise<string>} JWT
   */
  signJwt(payload, authKey, options) {
    // noinspection JSCheckFunctionSignatures
    return signJwt(payload, this.getCryptoPrivateKey(authKey), {
      ...options, algorithm: 'RS256', keyid: this.keyid
    });
  }

  /**
   * @param {string} jwt
   * @param {(header: import('jsonwebtoken').JwtHeader) => Promise<UserKey>} getUserKey
   */
  static verifyJwt(jwt, getUserKey) {
    return verifyJwt(jwt, async header =>
        (await getUserKey(header)).getCryptoPublicKey(),
      { algorithms: ['RS256'] });
  }

  /**
   * @param {AuthKey} authKey
   * @returns {[string, KeyObject]} Arguments for HTTP signing
   * @see https://httpwg.org/http-extensions/draft-ietf-httpbis-message-signatures.html
   */
  getSignHttpArgs(authKey) {
    return ['rsa-v1_5-sha256', this.getCryptoPrivateKey(authKey)];
  }

  /**
   * @param {AuthKey} authKey
   * @private
   */
  getCryptoPrivateKey(authKey) {
    // noinspection JSCheckFunctionSignatures
    return createPrivateKey({
      key: this.privateKey,
      ...UserKey.encoding.private(authKey)
    });
  }

  /** @public */
  getCryptoPublicKey() {
    return createPublicKey({
      key: this.publicKey,
      ...UserKey.encoding.public
    });
  }

  /**
   * @param {boolean} excludePrivate `true` to exclude the private key
   * @returns {GraphSubject}
   */
  toJSON(excludePrivate = false) {
    // noinspection JSValidateTypes
    return {
      ...UserKey.refFromKeyid(this.keyid),
      '@type': 'UserKey',
      name: this.name,
      public: normaliseValue(this.publicKey),
      private: excludePrivate ? undefined : normaliseValue(this.privateKey),
      revoked: this.revoked
    };
  }

  /**
   * Note this is only a partial inverse of {@link fromConfig}:
   * - the auth key is only included if provided
   * - the user and domain are not included
   * @param {AuthKey | undefined} [authKey]
   * @returns {Partial<UserKeyConfig>}
   */
  toConfig(authKey) {
    return Object.assign(authKey ? { auth: { key: authKey.toString() } } : {}, {
      key: {
        public: this.publicKey.toString('base64'),
        private: this.privateKey?.toString('base64')
        // revoked assumed false
      }
    });
  }
}