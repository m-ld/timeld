import { fetchJson } from '@m-ld/io-web-runtime/dist/server/fetch';
import { readFile } from 'fs/promises';
import { uuid } from '@m-ld/m-ld';

/**
 * @typedef {Partial<import('@m-ld/m-ld').MeldConfig>} SessionArgs
 * @property {string | false} [gateway]
 * @property {string} organisation
 * @property {string} timesheet
 * @property {boolean} [create]
 */

const timeldContext = JSON.parse(
  await readFile(new URL('./context.json', import.meta.url), 'utf8'));

/**
 * Expands a partial set of command-line arguments into a usable m-ld
 * configuration with an `@id`, `@domain`, `@context` and `genesis` flag.
 */
export class DomainConfigurator {
  /**
   * @param {SessionArgs} argv
   */
  constructor(argv) {
    this.argv = argv;
  }

  /** @returns {Promise<SessionArgs>} */
  async load() {
    return {
      ...await this.fetchGatewayConfig(),
      // Command-line options override gateway config
      // TODO: sounds dangerous
      ...this.argv,
      // These items cannot be overridden
      '@id': uuid(),
      '@context': timeldContext
    };
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
    const { gateway, organisation, timesheet, create } = this.argv;
    if (!gateway) { // could be false or undefined
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
        gatewayConfig = await fetchJson(
          `https://${gateway}/api/${organisation}/${timesheet}/config`);
      } catch (e) {
        console.info(`Gateway ${gateway} is not reachable (${e})`);
        return this.noGatewayConfig(gateway);
      }
      if (create && !gatewayConfig.genesis)
        throw 'This timesheet already exists';
      return gatewayConfig;
    }
  }

  noGatewayConfig(rootDomain) {
    const { organisation, timesheet, create } = this.argv;
    return {
      genesis: create, // Will be ignored if true but domain exists locally
      '@domain': `${timesheet}.${organisation}.${rootDomain}`
    };
  }
}