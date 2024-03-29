import isEmail from 'validator/lib/isEmail.js';
import isInt from 'validator/lib/isInt.js';
import isJWT from 'validator/lib/isJWT.js';
import Cryptr from 'cryptr';
import { BaseGateway, resolveGateway, TimeldPrincipal } from 'timeld-common';
import { consume } from 'rx-flowable/consume';
import { flatMap } from 'rx-flowable/operators';
import setupFetch from '@zeit/fetch';
import ndjson from 'ndjson';

export default class GatewayClient extends BaseGateway {
  /**
   * @param {TimeldCliConfig} config
   * @param {import('@zeit/fetch').Fetch} fetch injected fetch
   */
  constructor(config, fetch = setupFetch()) {
    const { root, domainName } = resolveGateway(config.gateway);
    super(domainName);
    this.user = config.user;
    if (config.auth?.key) {
      /**
       * Resolve our username against the gateway to get the canonical user URI.
       * Gateway-based URIs use HTTP by default (see also {@link AccountOwnedId}).
       */
      this.principal = new TimeldPrincipal(this.absoluteId(this.user), config);
    }
    this.gatewayRoot = root;
    // noinspection HttpUrlsUsage
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
    const url = new URL(`api/${path}`, await this.gatewayRoot);
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
   * @param {(question: string) => Promise<string>} ask
   */
  async activate(ask) {
    if (this.principal == null) {
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
      const keyConfig = /**@type UserKeyConfig*/ await this
        .fetchApi(`key/${this.user}`, { jwt, user: false })
        .then(checkSuccessRes).then(resJson);
      this.principal = new TimeldPrincipal(this.absoluteId(this.user), keyConfig);
    }
  }

  /**
   * @returns {UserKeyConfig | undefined}
   */
  get accessConfig() {
    if (this.principal != null)
      return this.principal.toConfig();
  }

  /**
   * @param {string} account to which the timesheet belongs
   * @param {string} timesheet the timesheet name
   * @returns {Promise<MeldConfig>} configuration for
   * timesheet domain
   */
  async config(account, timesheet) {
    return this.fetchApi(`cfg/${account}/tsh/${timesheet}`)
      .then(checkSuccessRes).then(resJson);
  }

  /**
   * @param {Read} pattern
   * @returns {Results} results
   */
  read(pattern) {
    return consume(this.fetchApi('read', { json: pattern }).then(checkSuccessRes))
      .pipe(flatMap(res => consume(res.body.pipe(ndjson.parse()))));
  }

  /**
   * @param {Write} pattern
   */
  async write(pattern) {
    await checkSuccessRes(await this.fetchApi('write', { json: pattern }));
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
  userJwt() {
    return this.principal.signJwt({}, {
      subject: this.user, expiresIn: '1m'
    });
  }
}

/**
 * @param {import('@zeit/fetch').Response} res
 * @returns {import('@zeit/fetch').Response}
 */
const checkSuccessRes = async res => {
  if (res.ok)
    return res;
  else
    throw (await res.json().catch(() => ({})))?.message || res.statusText;
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
