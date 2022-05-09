import { fetchJson } from '@m-ld/io-web-runtime/dist/server/fetch';

export default class Gateway {
  /**
   * @param {string} domain
   */
  constructor(domain) {
    this.domain = domain;
    this.root = `https://${domain}/api`;
  }

  /**
   * @param {string} account
   * @param {string} timesheet
   */
  config(account, timesheet) {
    return /**@type {Promise<import('@m-ld/m-ld').MeldConfig>}*/fetchJson(
      `${this.root}/${account}/${timesheet}/config`);
  }
}