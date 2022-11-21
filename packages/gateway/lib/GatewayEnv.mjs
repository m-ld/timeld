import { Env } from 'timeld-common';
import LOG from 'loglevel';
import isFQDN from 'validator/lib/isFQDN.js';

export default class GatewayEnv extends Env {
  constructor() {
    super({
      // Default is a volume mount, see fly.toml
      data: process.env.TIMELD_GATEWAY_DATA_PATH || '/data'
    }, 'timeld-gateway');
  }

  /**
   * Parse command line, environment variables & configuration
   * @returns {Promise<TimeldGatewayConfig>}
   */
  async loadConfig() {
    // Parse command line, environment variables & configuration
    const config = /**@type {TimeldGatewayConfig}*/(await this.yargs())
      .option('address.port', { default: '8080', type: 'number' })
      .parse();
    LOG.setLevel(config.logLevel || 'INFO');
    LOG.debug('Loaded configuration', config);

    // Set the m-ld domain from the declared gateway
    if (config['@domain'] == null) {
      config['@domain'] = isFQDN(config.gateway) ?
        config.gateway : new URL(config.gateway).hostname;
    }
    return config;
  }
}