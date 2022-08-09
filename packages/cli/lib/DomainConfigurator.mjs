import { uuid } from '@m-ld/m-ld';
import { AblyKey, Env, timeldContext } from 'timeld-common';
import isURL from 'validator/lib/isURL.js';
import isFQDN from 'validator/lib/isFQDN.js';

/**
 * @typedef {import('@m-ld/m-ld').MeldConfig} MeldConfig
 * @typedef {import('@m-ld/m-ld').AppPrincipal} AppPrincipal
 */

/**
 * Expands a partial set of command-line arguments into a usable m-ld
 * configuration with an `@id`, `@domain`, `@context` and `genesis` flag.
 */
export default class DomainConfigurator {
  /**
   * @param {Partial<TimeldCliConfig>} argv
   * @param {GatewayClient | null} gateway
   */
  constructor(argv, gateway) {
    this.argv = argv;
    this.gateway = gateway;
  }

  /**
   * @returns {Promise<{ config: TimeldCliConfig, principal: AppPrincipal }>}
   */
  async load() {
    const { config: remoteConfig, principal } = await this.fetchConfig();
    const config = Env.mergeConfig(
      this.argv,
      // Gateway config overrides command-line options
      remoteConfig,
      {
        // These items cannot be overridden
        '@id': uuid(),
        '@context': timeldContext
      });
    // Sanity check the result for use as a m-ld configuration – these errors
    // should never happen if this class and the gateway are behaving correctly
    if (config['@domain'] == null || !isFQDN(config['@domain']))
      throw 'No domain available';
    return { config, principal };
  }

  /**
   * Fetch the config from the gateway (if specified). Options:
   * - Remote gateway is reachable and provides base config, e.g. domain,
   * genesis & API keys
   * - Specified gateway is not reachable: we don't know whether the requested
   * timesheet is genesis, so rely on --create flag. If it was set and later
   * turns out to have been wrong, we will go to "merge" behaviour TODO
   * - --no-gateway requires long-lived ably key and uses Ably App ID as base
   * domain
   *
   * @returns {Promise<{ config: Partial<MeldConfig>, principal: AppPrincipal }>}
   * @private
   */
  async fetchConfig() {
    if (this.gateway == null) {
      if (!isURL(this.argv.user))
        throw 'Gateway-less use requires the user to be identified by a URL.';
      // see https://faqs.ably.com/how-do-i-find-my-app-id
      const ablyKey = this.argv.ably?.key;
      if (ablyKey == null)
        throw 'Gateway-less use requires an Ably API key.\n' +
        'See https://faqs.ably.com/what-is-an-app-api-key';
      // The domain is scoped to the Ably App. We use "timeld" and the app key
      // just in case there are other real apps running in the same Ably App.
      return {
        config: this.noGatewayConfig(
          `timeld.${new AblyKey(ablyKey).appId.toLowerCase()}`),
        principal: { '@id': this.argv.user /*, TODO: sign*/ }
      };
    } else {
      const config = await this.fetchGatewayConfig();
      return {
        config: Env.mergeConfig(config, this.gateway.accessConfig),
        principal: { '@id': this.gateway.principalId /*, TODO: sign*/ }
      };
    }
  }

  /**
   * @returns {Promise<Partial<MeldConfig>>}
   */
  async fetchGatewayConfig() {
    const { account, timesheet, create } = this.argv;
    let gatewayConfig;
    try {
      gatewayConfig = await this.gateway.config(account, timesheet);
    } catch (e) {
      // Gateway client returns Strings for HTTP error responses!
      if (e instanceof Error) {
        console.info(`Gateway ${this.gateway.domainName} is not reachable (${e})`);
        return this.noGatewayConfig(this.gateway.domainName);
      } else {
        throw e;
      }
    }
    if (create && !gatewayConfig.genesis)
      throw 'This timesheet already exists';
    return gatewayConfig;
  }

  noGatewayConfig(rootDomain) {
    const { account, timesheet, create } = this.argv;
    return {
      '@domain': `${timesheet}.${account}.${rootDomain}`,
      genesis: create // Will be ignored if true but domain exists locally
    };
  }
}