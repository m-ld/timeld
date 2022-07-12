import { fetchJson } from '@m-ld/io-web-runtime/dist/server/fetch';

/**
 * @typedef {object} AblyKeyDetail
 * @property {string} id The key ID.
 * @property {string} name The name for your API key. This is a friendly name for your reference.
 * @property {0|1} status The status of the key. 0 is enabled, 1 is revoked.
 * @property {string} key The complete API key including API secret.
 * @property {object} capability The capabilities that this key has.
 */

export default class AblyApi {
  /**
   * @param {string} key Ably key for the app
   * @param {string} apiKey Control API access token
   * @see https://ably.com/docs/api/control-api#section/Authentication/bearer_auth
   */
  constructor({ key, apiKey }) {
    const [appId] = key.split('.');
    this.fetchJson = /**@type {typeof fetchJson}*/((path, params, options) => fetchJson(
      `https://control.ably.net/v1/apps/${appId}/${path}`, params, {
        headers: { Authorization: `Bearer ${apiKey}` },
        ...options
      }));
  }

  /**
   * @param {string} name
   * @param {object} capability
   * @returns {Promise<AblyKeyDetail>}
   * @see https://ably.com/docs/api/control-api#tag/keys/paths/~1apps~1{app_id}~1keys/post
   */
  createAppKey({ name, capability }) {
    return this.fetchJson('keys', {}, {
      method: 'POST', body: { name, capability }
    });
  }

  /**
   * Note: this call works even if both name and capability are missing; and can
   * therefore be used to check if a keyid exists
   *
   * @param {string} keyid
   * @param {string} [name]
   * @param {object} [capability]
   * @returns {Promise<AblyKeyDetail>}
   * @see https://ably.com/docs/api/control-api#tag/keys/paths/~1apps~1{app_id}~1keys/post
   */
  updateAppKey(keyid, { name, capability }) {
    return this.fetchJson(`keys/${keyid}`, {}, {
      method: 'PATCH', body: { name, capability }
    });
  }
}