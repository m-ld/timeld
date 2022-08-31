import { fetchJson } from '@m-ld/io-web-runtime/dist/server/fetch';

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
  mintKey(name) {
    return this.fetchJson('keys', {}, {
      method: 'POST', body: { name, capability: this.keyCapability() }
    });
  }

  /**
   * Note: this call works even if both name and capability are missing; and can
   * therefore be used to check if a keyid exists
   *
   * @see https://ably.com/docs/api/control-api#tag/keys/paths/~1apps~1{app_id}~1keys/post
   */
  async pingKey(keyid, getAuthorisedTsIds) {
    return this.fetchJson(`keys/${keyid}`, {}, {
      method: 'PATCH', body: { capability: this.keyCapability(...await getAuthorisedTsIds()) }
    });
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