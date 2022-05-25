import { fetchJson } from '@m-ld/io-web-runtime/dist/server/fetch';

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
   * @returns {Promise<[{ id: string, name: string, key: string }]>}
   * @see https://ably.com/docs/api/control-api#tag/keys/paths/~1apps~1{app_id}~1keys/get
   */
  listAppKeys() {
    return this.fetchJson('keys');
  }

  /**
   * @param {string} name
   * @param {object} capability
   * @returns {Promise<{ id: string, key: string }>}
   * @see https://ably.com/docs/api/control-api#tag/keys/paths/~1apps~1{app_id}~1keys/post
   */
  createAppKey(name, capability) {
    return this.fetchJson('keys', {}, {
      method: 'POST', body: { name, capability }
    });
  }
}