import { signJwt } from '@m-ld/io-web-runtime/dist/server/auth';
import isFQDN from 'validator/lib/isFQDN.js';
import isEmail from 'validator/lib/isEmail.js';
import isInt from 'validator/lib/isInt.js';
import isJWT from 'validator/lib/isJWT.js';
import Cryptr from 'cryptr';
import dns from 'dns/promises';
import { AblyKey, BaseGateway } from 'timeld-common';
import { consume } from 'rx-flowable/consume';
import { flatMap } from 'rx-flowable/operators';
import setupFetch from '@zeit/fetch';
import ndjson from 'ndjson';

export default class GatewayClient extends BaseGateway {
  /**
   * @param {string} gateway
   * @param {string} user
   * @param {object} ably
   * @param {string} [ably.key] available Ably key, if missing, {@link activate}
   * must be called before other methods
   * @param {UserKeyConfig['key']} [key] public/private key pair
   * @param {import('@zeit/fetch').Fetch} fetch injected fetch
   */
  constructor({
    gateway,
    user,
    ably,
    key
  }, fetch = setupFetch()) {
    const { apiRoot, domainName } = GatewayClient.resolveApiRoot(gateway);
    super(domainName);
    this.user = user;
    this.ablyKey = ably?.key != null ? new AblyKey(ably.key) : null;
    // We don't hydrate the user key here
    this.userKeyConfig = key ?? null;
    this.apiRoot = apiRoot;
    /**
     * Resolve our username against the gateway to get the canonical user URI.
     * Gateway-based URIs use HTTP by default (see also {@link AccountOwnedId}).
     */
    this.principalId = this.absoluteId(this.user);
    this.fetch = fetch;
  }

  /**
   * @param {string} path path after `api` to fetch
   * @param {import('@zeit/fetch').FetchOptions} options fetch options
   * @param {false} [options.user] turn off user parameter
   * @param {string|false} [options.jwt] provide or turn off JWT bearer auth
   * @param {object} [options.params] query parameters
   * @param {*} [options.json] JSON body (default POST)
   * @returns {Promise<import('@zeit/fetch').Response>}
   */
  async fetchApi(path, options = {}) {
    // Add the given JWT or a user JWT, unless disabled
    if (options.jwt !== false)
      (options.headers ||= {}).Authorization =
        `Bearer ${options.jwt || await this.userJwt()}`;
    // Add the user as a query parameter, unless disabled
    if (options.user !== false)
      (options.params ||= {}).user = this.user;
    // noinspection JSCheckFunctionSignatures
    const url = new URL(path, await this.apiRoot);
    // Add the query parameters to the URL
    if (options.params != null)
      Object.entries(options.params).forEach(([name, value]) =>
        url.searchParams.append(name, `${value}`));
    // Posting JSON
    if (options.json != null) {
      options.method ||= 'POST';
      (options.headers ||= {})['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.json);
    }
    return this.fetch(url.toString(), options);
  }

  /**
   * @param {string} address
   * @returns {{ apiRoot: URL | Promise<URL>, domainName: string }}
   */
  static resolveApiRoot(address) {
    if (isFQDN(address)) {
      return { apiRoot: new URL(`https://${address}/api/`), domainName: address };
    } else {
      const url = new URL('/api/', address);
      const domainName = url.hostname;
      if (domainName.endsWith('.local')) {
        return {
          apiRoot: dns.lookup(domainName).then(a => {
            url.hostname = a.address;
            return url;
          }),
          domainName
        };
      } else {
        return { apiRoot: url, domainName };
      }
    }
  }

  /**
   * @param {(question: string) => Promise<string>} ask
   */
  async activate(ask) {
    if (this.ablyKey == null) {
      const email = await ask(
        'Please enter your email address to register this device: ');
      if (!isEmail(email))
        throw `"${email}" is not a valid email address`;
      const { jwe } = await this.fetchApi(`jwe/${this.user}`,
        { params: { email }, jwt: false, user: false })
        .then(checkSuccessRes).then(resJson);
      const code = await ask(
        'Please enter the activation code we sent you: ');
      if (!isInt(code, { min: 111111, max: 999999 }))
        throw `"${code}" is not a valid activation code`;
      const jwt = new Cryptr(code).decrypt(jwe);
      if (!isJWT(jwt))
        throw 'Sorry, that code was incorrect, please start again.';
      const keys = /**@type UserKeyConfig*/ await this
        .fetchApi(`key/${this.user}`, { jwt, user: false })
        .then(checkSuccessRes).then(resJson);
      this.ablyKey = new AblyKey(keys.ably.key);
      this.userKeyConfig = keys.key;
    }
  }

  /**
   * @returns {UserKeyConfig}
   */
  get accessConfig() {
    return { ably: { key: this.ablyKey.toString() }, key: this.userKeyConfig };
  }

  /**
   * @param {string} account to which the timesheet belongs
   * @param {string} timesheet the timesheet name
   * @returns {Promise<import('@m-ld/m-ld').MeldConfig>} configuration for
   * timesheet domain
   */
  async config(account, timesheet) {
    return this.fetchApi(`cfg/${account}/tsh/${timesheet}`)
      .then(checkSuccessRes).then(resJson);
  }

  /**
   * @param {import('@m-ld/m-ld').Read} pattern
   * @returns {Results} results
   */
  read(pattern) {
    return consume(this.fetchApi('read', { json: pattern }).then(checkSuccessRes))
      .pipe(flatMap(res => consume(res.body.pipe(ndjson.parse()))));
  }

  /**
   * @param {import('@m-ld/m-ld').Write} pattern
   */
  async write(pattern) {
    checkSuccessRes(await this.fetchApi('write', { json: pattern }));
  }

  /**
   * Reports on the given timesheet OR project with the given ID.
   *
   * @param {string} account to which the project or timesheet belongs
   * @param {string} owned project or timesheet ID
   * @returns {Results} results subjects
   * @see Gateway#report
   */
  report(account, owned) {
    return consume(this.fetchApi(`rpt/${account}/own/${owned}`).then(checkSuccessRes))
      .pipe(flatMap(res => consume(res.body.pipe(ndjson.parse()))));
  }

  /**
   * User JWT suitable for authenticating to the gateway
   * @returns {Promise<string>} JWT
   */
  async userJwt() {
    const { secret, keyid } = this.ablyKey;
    return await signJwt({}, secret, {
      subject: this.user, keyid, expiresIn: '1m'
    });
  }
}

/**
 * @param {import('@zeit/fetch').Response} res
 * @returns {import('@zeit/fetch').Response}
 */
const checkSuccessRes = res => {
  if (res.ok)
    return res;
  else
    throw `Fetch from ${res.url} failed with ${res.status}: ${res.statusText}`;
};

/**
 * @param {import('@zeit/fetch').Response} res
 * @returns {Promise<*>}
 */
const resJson = async res => {
  const json = await res.json();
  if (json == null)
    throw `No JSON returned from ${res.url}`;
  return json;
};
