import { AuthKey } from '../../index.mjs';
import { randomBytes } from 'crypto';
import { shortId } from '@m-ld/m-ld';

/**
 * A key store that persists to a m-ld domain
 * @implements AuthKeyStore
 */
export default class DomainKeyStore {
  /**
   * @param {MeldConfig} config
   */
  constructor(config) {
    this.appId = shortId(config['@domain']);
  }

  async mintKey(name) {
    const material = randomBytes(40).toString('base64');
    return {
      key: new AuthKey({
        appId: this.appId,
        keyid: material.slice(0, 6),
        secret: material.slice(6)
      }),
      name,
      revoked: false
    };
  }

  async pingKey(_keyid, _getAuthorisedTsIds) {
    return false; // No revocation status stored, assume not revoked
  }
}
