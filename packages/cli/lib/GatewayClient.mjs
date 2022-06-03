import { fetchJson } from '@m-ld/io-web-runtime/dist/server/fetch';
import { signJwt } from '@m-ld/io-web-runtime/dist/server/auth';
import validator from 'validator';
import Cryptr from 'cryptr';
import dns from 'dns';
import { AblyKey } from 'timeld-common';

export default class GatewayClient {
  /**
   * @param {string} address
   */
  constructor(address) {
    const { apiRoot, domain } = this.resolveApiRoot(address);
    this.domain = domain;
    this.fetchJson = /**@type {typeof fetchJson}*/(async (path, params, options) =>
      fetchJson(`${await apiRoot}/${path}`, params, options));
  }

  /**
   * @param {string} address
   * @returns {{ apiRoot: string | Promise<string>, domain: string }}
   * @private
   */
  resolveApiRoot(address) {
    if (validator.isFQDN(address)) {
      return { apiRoot: `https://${address}/api`, domain: address };
    } else {
      const url = new URL('/api', address);
      const domain = url.hostname;
      if (domain.endsWith('.local')) {
        return {
          apiRoot: dns.promises.lookup(domain).then(a => {
            url.hostname = a.address;
            return url.toString();
          }),
          domain
        };
      } else {
        return { apiRoot: url.toString(), domain };
      }
    }
  }

  /**
   * @param {string} account
   * @param {string} timesheet initial timesheet requested
   * @param {string} email account email address
   * @param {() => Promise<string>} getCode callback to get activation code
   * @returns {AblyKey} Ably key
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
    return new AblyKey(key);
  }

  /**
   * @param {string} account
   * @param {string} timesheet
   * @param {AblyKey} ablyKey
   * @returns {Promise<import('@m-ld/m-ld').MeldConfig>} configuration for
   * timesheet domain
   */
  async config(account, timesheet, ablyKey) {
    const { secret, keyid } = ablyKey;
    const jwt = await signJwt({}, secret, { keyid, expiresIn: '1m' });
    return /**@type {Promise<import('@m-ld/m-ld').MeldConfig>}*/this.fetchJson(
      `${account}/tsh/${timesheet}/cfg`, { jwt });
  }
}