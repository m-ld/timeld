import { normaliseValue, Optional, propertyValue } from '@m-ld/m-ld';
import { sign, generateKeyPairSync, verify, createPrivateKey, createPublicKey } from 'crypto';
import AblyKey from '../lib/AblyKey.mjs';

/**
 * @typedef {object} UserKeyConfig
 * @property {string} ably.key
 * @property {string} key.public
 * @property {string} key.private
 */

export default class UserKey {
  /**
   * @param {import('@m-ld/m-ld').GraphSubject} src
   */
  static fromJSON(src) {
    // noinspection JSCheckFunctionSignatures
    return new UserKey({
      keyid: this.keyidFromRef(src),
      publicKey: propertyValue(src, 'public', Uint8Array),
      privateKey: propertyValue(src, 'private', Optional, Uint8Array)
    });
  }

  /**
   * @param {UserKeyConfig} config
   * @returns {UserKey}
   */
  static fromConfig(config) {
    return new UserKey({
      keyid: new AblyKey(config.ably.key).keyid,
      publicKey: Buffer.from(config.key.public, 'base64'),
      privateKey: Buffer.from(config.key.private, 'base64')
    });
  }

  /**
   * @param {import('@m-ld/m-ld').Reference} ref
   * @returns {string}
   * @throws {TypeError} if the reference is not to a user key
   */
  static keyidFromRef(ref) {
    // noinspection JSCheckFunctionSignatures
    if (!/^\.\w{5,}$/.test(ref['@id']))
      throw new TypeError(`Unexpected user key identity format "${ref['@id']}"`);
    return ref['@id'].slice(1);
  }

  /**
   * @param {string} keyid
   * @returns {import('@m-ld/m-ld').Reference}
   */
  static refFromKeyid(keyid) {
    return { '@id': `.${keyid}` };
  }

  /**
   * @param {Uint8Array} data
   * @returns {[string?, Uint8Array]} keyid and crypto signature
   */
  static splitSignature(data) {
    const buf = Buffer.from(data);
    const delim = buf.indexOf(':');
    if (delim < 6)
      return [undefined, data];
    return [buf.subarray(0, delim).toString(), buf.subarray(delim + 1)];
  }

  /**
   * @param {AblyKey | string} ablyKey
   */
  static generate(ablyKey) {
    if (typeof ablyKey == 'string')
      ablyKey = new AblyKey(ablyKey);
    // noinspection JSCheckFunctionSignatures
    return new UserKey({
      keyid: ablyKey.keyid,
      ...generateKeyPairSync('rsa', {
        modulusLength: 1024,
        publicKeyEncoding: this.encoding.public,
        privateKeyEncoding: this.encoding.private(ablyKey)
      })
    });
  }

  static encoding = {
    public: { type: 'spki', format: 'der' },
    /** @param {AblyKey} ablyKey */
    private: ablyKey => ({
      type: 'pkcs8',
      format: 'der',
      cipher: 'aes-256-cbc',
      passphrase: ablyKey.secret
    })
  };

  /**
   * @param {string} keyid
   * @param {Uint8Array} publicKey
   * @param {Uint8Array} [privateKey]
   */
  constructor({ keyid, publicKey, privateKey }) {
    this.keyid = keyid;
    this.publicKey = Buffer.from(publicKey);
    this.privateKey = privateKey ? Buffer.from(privateKey) : undefined;
  }

  /**
   * @param {Uint8Array} data
   * @param {AblyKey} ablyKey
   * @return {Buffer}
   */
  sign(data, ablyKey) {
    // noinspection JSCheckFunctionSignatures
    return Buffer.concat([
      Buffer.from(`${this.keyid}:`),
      sign('RSA-SHA256', data, createPrivateKey({
        key: this.privateKey, ...UserKey.encoding.private(ablyKey)
      }))
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
    return verify('RSA-SHA256', data, createPublicKey({
      key: this.publicKey, ...UserKey.encoding.public
    }), cryptoSig);
  }

  /**
   * @param {boolean} excludePrivate `true` to exclude the private key
   * @returns {import('@m-ld/m-ld').GraphSubject}
   */
  toJSON(excludePrivate = false) {
    // noinspection JSValidateTypes
    return {
      ...UserKey.refFromKeyid(this.keyid),
      '@type': 'UserKey',
      public: normaliseValue(this.publicKey),
      private: excludePrivate ? undefined : normaliseValue(this.privateKey)
    };
  }

  /**
   * Note this is only a partial inverse of {@link fromConfig} if the Ably key
   * is not passed.
   * @param {string} [ablyKey]
   * @returns {UserKeyConfig}
   */
  toConfig(ablyKey) {
    return Object.assign(ablyKey ? { ably: { key: ablyKey } } : {}, {
      key: {
        public: this.publicKey.toString('base64'),
        private: this.privateKey?.toString('base64')
      }
    });
  }
}