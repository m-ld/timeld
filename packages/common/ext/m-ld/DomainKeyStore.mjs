import { propertyValue } from '@m-ld/m-ld';
import { AuthKey } from '../../index.mjs';
import { randomBytes } from 'crypto';

/**
 * A key store that persists to a m-ld domain
 * @implements AuthKeyStore
 */
export default class DomainKeyStore {
  /**
   * A writeable m-ld state; must be set prior to calling methods.
   * @type {MeldState}
   */
  state;

  /**
   * @param {string} appId
   */
  constructor({ appId }) {
    this.appId = appId;
  }

  async mintKey(name) {
    const material = randomBytes(40).toString('base64');
    const key = new KeySubject({
      key: new AuthKey({
        appId: this.appId,
        keyid: material.slice(0, 6),
        secret: material.slice(6)
      }),
      name, revoked: false
    });
    await this.state.write(key.toJSON());
    return key;
  }

  async pingKey(keyid, _getAuthorisedTsIds) {
    const src = await this.state.get(KeySubject.id(keyid));
    return KeySubject.fromJSON(src);
  }
}

/**
 * @implements AuthKeyDetail
 */
class KeySubject {
  static id(keyid) {
    return `.${keyid}`;
  }

  /**
   * @param {GraphSubject} src
   */
  static fromJSON(src) {
    // noinspection JSCheckFunctionSignatures
    return new KeySubject({
      key: AuthKey.fromString(propertyValue(src, 'key', String)),
      name: propertyValue(src, 'name', String),
      revoked: propertyValue(src, 'revoked', Boolean)
    });
  }

  /**
   * @param {AuthKey} key
   * @param {string} name
   * @param {boolean} revoked
   */
  constructor({ key, name, revoked }) {
    this.key = key;
    this.name = name;
    this.revoked = revoked;
  }

  toJSON() {
    return {
      '@id': KeySubject.id(this.key.keyid),
      '@type': 'Key',
      name: this.name,
      revoked: this.revoked,
      key: this.key.toString()
    };
  }
}