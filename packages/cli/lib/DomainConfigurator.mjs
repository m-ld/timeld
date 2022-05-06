import { uuid } from '@m-ld/m-ld';
import { timeldContext } from './context.mjs';

/**
 * Expands a partial set of command-line arguments into a usable m-ld
 * configuration with an `@id`, `@domain`, `@context`, `genesis` flag and
 * `principal` reference.
 */
export class DomainConfigurator {
  /**
   * @param {Partial<SessionConfig>} argv
   * @param {Gateway | null} gateway
   */
  constructor(argv, gateway) {
    this.argv = argv;
    this.gateway = gateway;
  }

  /** @returns {Promise<SessionConfig>} */
  async load() {
    const config = {
      ...await this.fetchGatewayConfig(),
      // Command-line options override gateway config
      // TODO: sounds dangerous
      ...this.argv,
      // These items cannot be overridden
      '@id': uuid(),
      '@context': timeldContext
    };
    if (config.principal?.['@id'] == null)
      throw 'No user ID available';
    return config;
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
   * @returns {Promise<Partial<import('@m-ld/m-ld').MeldConfig>>}
   */
  async fetchGatewayConfig() {
    const { account, timesheet, create } = this.argv;
    if (this.gateway == null) { // could be false or undefined
      // see https://faqs.ably.com/how-do-i-find-my-app-id
      const appId = /**@type string*/this.argv['ably']?.key?.split('.')[0];
      if (appId == null)
        throw 'Gateway-less use requires an Ably API key.\n' +
        'See https://faqs.ably.com/what-is-an-app-api-key';
      // The domain is scoped to the Ably App. We use "timeld" and the app key
      // just in case there are other real apps running in the same Ably App.
      return this.noGatewayConfig(`timeld.${appId.toLowerCase()}`);
    } else {
      let gatewayConfig;
      try {
        gatewayConfig = await this.gateway.config(account, timesheet);
      } catch (e) {
        console.info(`Gateway ${this.gateway.domain} is not reachable (${e})`);
        return this.noGatewayConfig(this.gateway.domain);
      }
      if (create && !gatewayConfig.genesis)
        throw 'This timesheet already exists';
      return gatewayConfig;
    }
  }

  noGatewayConfig(rootDomain) {
    const { account, timesheet, create } = this.argv;
    return {
      '@domain': `${timesheet}.${account}.${rootDomain}`,
      genesis: create // Will be ignored if true but domain exists locally
    };
  }
}