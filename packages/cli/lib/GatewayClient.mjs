import { fetchJson } from '@m-ld/io-web-runtime/dist/server/fetch';
import { signJwt } from '@m-ld/io-web-runtime/dist/server/auth';
import isFQDN from 'validator/lib/isFQDN.js';
import isEmail from 'validator/lib/isEmail.js';
import isInt from 'validator/lib/isInt.js';
import isJWT from 'validator/lib/isJWT.js';
import Cryptr from 'cryptr';
import dns from 'dns/promises';
import { AblyKey } from 'timeld-common';

export default class GatewayClient {
  /**
   * @param {string} address
   */
  constructor(address) {
    const { apiRoot, domain } = this.resolveApiRoot(address);
    this.domain = domain;
    this.fetchApiJson = /**@type {typeof fetchJson}*/(async (path, params, options) =>
      fetchJson(`${await apiRoot}/${path}`, params, options));
  }

  /**
   * @param {string} address
   * @returns {{ apiRoot: string | Promise<string>, domain: string }}
   * @private
   */
  resolveApiRoot(address) {
    if (isFQDN(address)) {
      return { apiRoot: `https://${address}/api`, domain: address };
    } else {
      const url = new URL('/api', address);
      const domain = url.hostname;
      if (domain.endsWith('.local')) {
        return {
          apiRoot: dns.lookup(domain).then(a => {
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
   * Resolve the user name against the gateway to get the canonical user URI.
   * Gateway-based URIs use HTTP by default (see also {@link TimesheetId}).
   * @param {string} user
   * @returns {string}
   */
  principalId(user) {
    // This leaves an absolute URI alone
    return new URL(user, `http://${this.domain}`).toString();
  }

  /**
   * @param {string} user user account name
   * @param {string} email account email address
   * @param {() => Promise<string>} getCode callback to get activation code
   * @returns {AblyKey} Ably key
   */
  async activate(user, email, getCode) {
    if (!isEmail(email))
      throw `"${email}" is not a valid email address`;
    const { jwe } = await this.fetchApiJson(`${user}/jwe`, { email });
    const code = await getCode();
    if (!isInt(code, { min: 111111, max: 999999 }))
      throw `"${code}" is not a valid activation code`;
    const jwt = new Cryptr(code).decrypt(jwe);
    if (!isJWT(jwt))
      throw 'Something has gone wrong, sorry.';
    const { key } = await this.fetchApiJson(`${user}/key`, { jwt });
    return new AblyKey(key);
  }

  /**
   * @param {string} user account associated with given Ably key
   * @param {string} account to which the timesheet belongs
   * @param {string} timesheet the timesheet name
   * @param {AblyKey} ablyKey
   * @returns {Promise<import('@m-ld/m-ld').MeldConfig>} configuration for
   * timesheet domain
   */
  async config(user, account, timesheet, ablyKey) {
    const jwt = await this.userJwt(user, ablyKey);
    return /**@type {Promise<import('@m-ld/m-ld').MeldConfig>}*/this.fetchApiJson(
      `${account}/tsh/${timesheet}/cfg`, { user, jwt });
  }

  /**
   * User JWT suitable for authenticating to the gateway
   * @param {string} user account associated with given Ably key
   * @param {AblyKey} ablyKey
   * @returns {Promise<string>} JWT
   */
  async userJwt(user, ablyKey) {
    const { secret, keyid } = ablyKey;
    return await signJwt({}, secret, {
      subject: user, keyid, expiresIn: '1m'
    });
  }
}