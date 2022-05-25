import { fetchJson } from '@m-ld/io-web-runtime/dist/server/fetch';
import { signJwt } from '@m-ld/io-web-runtime/dist/server/auth';
import validator from 'validator';
import Cryptr from 'cryptr';

export default class GatewayClient {
  /**
   * @param {string} domain
   */
  constructor(domain) {
    this.domain = domain;
    this.fetchJson = /**@type {typeof fetchJson}*/((path, params, options) =>
      fetchJson(`https://${domain}/api/${path}`, params, options));
  }

  /**
   * @param {string} account
   * @param {string} timesheet initial timesheet requested
   * @param {string} email account email address
   * @param {() => Promise<string>} getCode callback to get activation code
   * @returns {string} JWT, encrypted with an activation code
   */
  async activate(account, timesheet, email, getCode) {
    if (!validator.isEmail(email))
      throw `"${email}" is not a valid email address`;
    const { jwe } = await this.fetchJson(`${account}/jwe`, { email });
    const code = await getCode();
    if (!validator.isInt(code, { min: 111111, max: 999999 }))
      throw `"${code}" is not a valid activation code`;
    const jwt = new Cryptr(code).decrypt(jwe);
    if (!validator.isJWT(jwt))
      throw 'Something has gone wrong, sorry.';
    const { key } = await this.fetchJson(`${account}/key`, { jwt, timesheet });
    return key;
  }

  /**
   * @param {string} account
   * @param {string} timesheet
   * @param {string} ablyKey
   * @returns {Promise<import('@m-ld/m-ld').MeldConfig>} configuration for
   * timesheet domain
   */
  async config(account, timesheet, ablyKey) {
    const [keyid, secret] = ablyKey.split(':');
    const jwt = await signJwt({}, secret, { expiresIn: '1m', keyid });
    return /**@type {Promise<import('@m-ld/m-ld').MeldConfig>}*/this.fetchJson(
      `${account}/tsh/${timesheet}/cfg`, { jwt });
  }
}