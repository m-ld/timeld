import Gateway from './lib/Gateway.mjs';
import Notifier from './lib/Notifier.mjs';
import { Env } from 'timeld-common';
import LOG from 'loglevel';
import isFQDN from 'validator/lib/isFQDN.js';
import rest from './rest/index.mjs';
import gracefulShutdown from 'http-graceful-shutdown';
import DomainKeyStore from 'timeld-common/ext/m-ld/DomainKeyStore.mjs';
import IoCloneFactory from 'timeld-common/ext/socket.io/IoCloneFactory.mjs';
import { shortId } from '@m-ld/m-ld';
import socketIo from './rest/socket-io.mjs';

/**
 * @typedef {object} process.env required for Gateway node startup
 * @property {string} [TIMELD_GATEWAY_DATA_PATH] should point to a volume, default `/data`
 * @property {string} [LOG_LEVEL] defaults to "INFO"
 * @property {string} TIMELD_GATEWAY_GATEWAY domain name or URL of gateway
 * @property {string} TIMELD_GATEWAY_GENESIS "true" iff the gateway is new
 * @property {string} TIMELD_GATEWAY_AUTH__KEY gateway authorisation key
 * @property {string} TIMELD_GATEWAY_SMTP__HOST
 * @property {string} TIMELD_GATEWAY_SMTP__FROM
 * @property {string} TIMELD_GATEWAY_SMTP__AUTH__USER
 * @property {string} TIMELD_GATEWAY_SMTP__AUTH__PASS
 */

/**
 * @typedef {object} _TimeldGatewayConfig
 * @property {string} gateway domain name or URL of gateway
 * @property {SmtpOptions} smtp SMTP details for activation emails
 * @typedef {TimeldConfig & _TimeldGatewayConfig} TimeldGatewayConfig
 * @see process.env
 */

const env = new Env({
  // Default is a volume mount, see fly.toml
  data: process.env.TIMELD_GATEWAY_DATA_PATH || '/data'
}, 'timeld-gateway');
// Parse command line, environment variables & configuration
const config = /**@type {TimeldGatewayConfig}*/(await env.yargs()).parse();
LOG.setLevel(config.logLevel || 'INFO');
LOG.debug('Loaded configuration', config);

// Set the m-ld domain from the declared gateway
if (config['@domain'] == null) {
  config['@domain'] = isFQDN(config.gateway) ?
    config.gateway : new URL(config.gateway).hostname;
}

const keyStore = new DomainKeyStore({ appId: shortId(config['@domain']) });
const cloneFactory = new IoCloneFactory();
const gateway = new Gateway(env, config, cloneFactory, keyStore);
const notifier = new Notifier(config);
const server = rest({ gateway, notifier });
const io = socketIo({ gateway, server });
io.on('error', LOG.error);
io.on('debug', LOG.debug);

server.listen(8080, async () => {
  // noinspection JSUnresolvedVariable
  LOG.info('%s listening at %s', server.name, server.url);
  cloneFactory.address = server.url;
  try {
    await gateway.initialise();
    LOG.info('Gateway initialised');
  } catch (e) {
    LOG.error('Gateway failed to initialise', e);
  }
});

gracefulShutdown(server, {
  async onShutdown() {
    LOG.info('Gateway shutting down...');
    await gateway.close();
    LOG.info('Gateway shut down');
  }
});
