import { uuid } from '@m-ld/m-ld';
import { Env, timeldContext } from 'timeld-common';

/**
 * Expands a partial set of command-line arguments into a usable m-ld
 * configuration with an `@id`, `@domain`, `@context`, `genesis` flag and
 * `principal` reference.
 */
export default class DomainConfigurator {
  /**
   * @param {Partial<TimeldConfig>} argv
   * @param {GatewayClient | null} gateway
   * @param {(question: string) => Promise<string>} ask
   */
  constructor(argv, gateway, ask) {
    this.argv = argv;
    this.gateway = gateway;
    this.ask = ask;
  }

  /** @returns {Promise<TimeldConfig>} */
  async load() {
    const config = Env.mergeConfig(
      // Gateway config overrides command-line options
      this.argv, await this.fetchConfig(), {
        // These items cannot be overridden
        '@id': uuid(),
        '@context': timeldContext
      });
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
   * @private
   */
  async fetchConfig() {
    if (this.gateway == null) { // could be false or undefined
      // see https://faqs.ably.com/how-do-i-find-my-app-id
      const appId = /**@type string*/this.ablyKey?.split('.')[0];
      if (appId == null)
        throw 'Gateway-less use requires an Ably API key.\n' +
        'See https://faqs.ably.com/what-is-an-app-api-key';
      // The domain is scoped to the Ably App. We use "timeld" and the app key
      // just in case there are other real apps running in the same Ably App.
      return this.noGatewayConfig(`timeld.${appId.toLowerCase()}`);
    } else {
      const ablyKey = this.ablyKey || await this.activate();
      const config = await this.fetchGatewayConfig(ablyKey);
      return Env.mergeConfig(config, { ably: { key: ablyKey } });
    }
  }

  async fetchGatewayConfig(ablyKey) {
    const { account, timesheet, create } = this.argv;
    let gatewayConfig;
    try {
      gatewayConfig = await this.gateway.config(account, timesheet, ablyKey);
    } catch (e) {
      console.info(`Gateway ${this.gateway.domain} is not reachable (${e})`);
      return this.noGatewayConfig(this.gateway.domain);
    }
    if (create && !gatewayConfig.genesis)
      throw 'This timesheet already exists';
    return gatewayConfig;
  }

  /**
   * @returns {Promise<string>} new Ably key
   * @private
   */
  async activate() {
    return this.gateway.activate(this.argv.account, this.argv.timesheet,
      await this.ask('Please enter your email address to register this device:'),
      () => this.ask('Please enter the activation code we sent you:'));
  }

  noGatewayConfig(rootDomain) {
    const { account, timesheet, create } = this.argv;
    return {
      '@domain': `${timesheet}.${account}.${rootDomain}`,
      genesis: create // Will be ignored if true but domain exists locally
    };
  }

  get ablyKey() {
    return this.argv['ably']?.key;
  }
}