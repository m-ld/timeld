import { fetchJson } from '@m-ld/io-web-runtime/dist/server/fetch';
import { AuthKey } from '../../index.mjs';

/**
 * @implements AuthKeyStore
 */
export default class AblyKeyStore {
  /**
   * @param {string} domainName
   * @param {string} key Ably key for the app
   * @param {string} apiKey Control API access token
   * @see https://ably.com/docs/api/control-api#section/Authentication/bearer_auth
   */
  constructor({ '@domain': domainName, ably: { key, apiKey } }) {
    const [appId] = key.split('.');
    this.fetchJson = /**@type {typeof fetchJson}*/((path, params, options) => fetchJson(
      `https://control.ably.net/v1/apps/${appId}/${path}`, params, {
        headers: { Authorization: `Bearer ${apiKey}` },
        ...options
      }));
    this.domainName = domainName;
  }

  /**
   * @see https://ably.com/docs/api/control-api#tag/keys/paths/~1apps~1{app_id}~1keys/post
   */
  async mintKey(name) {
    return this.ablyToAuthDetail(await this.fetchJson('keys', {}, {
      method: 'POST', body: { name, capability: this.keyCapability() }
    }));
  }

  /**
   * Note: this call works even if both name and capability are missing; and can
   * therefore be used to check if a keyid exists
   *
   * @see https://ably.com/docs/api/control-api#tag/keys/paths/~1apps~1{app_id}~1keys/post
   */
  async pingKey(keyid, getAuthorisedTsIds) {
    return this.ablyToAuthDetail(await this.fetchJson(`keys/${keyid}`, {}, {
      method: 'PATCH', body: { capability: this.keyCapability(...await getAuthorisedTsIds()) }
    }));
  }

  /**
   * @param {string} key The complete authorisation key including secret
   * @param {string} name Friendly name for reference
   * @param {0|1} status The revocation status of the key, 1 = revoked
   * @returns {AuthKeyDetail}}
   */
  ablyToAuthDetail({ key, name, status }) {
    return { key: AuthKey.fromString(key), name, revoked: status === 1 };
  }

  /**
   * @param {AccountOwnedId} tsIds
   * @returns {object}
   */
  keyCapability(...tsIds) {
    return Object.assign({
      // Ably keys must have a capability. Assign a notification channels as a minimum.
      [`${this.domainName}:notify`]: ['subscribe']
    }, ...tsIds.map(tsId => ({
      [`${tsId.toDomain()}:*`]: ['publish', 'subscribe', 'presence']
    })));
  }
}