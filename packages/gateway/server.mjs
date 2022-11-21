import Gateway from './lib/Gateway.mjs';
import Notifier from './lib/Notifier.mjs';
import LOG from 'loglevel';
import rest from './rest/index.mjs';
import gracefulShutdown from 'http-graceful-shutdown';
import DomainKeyStore from 'timeld-common/ext/m-ld/DomainKeyStore.mjs';
import IoCloneFactory from 'timeld-common/ext/socket.io/IoCloneFactory.mjs';
import socketIo from './rest/socket-io.mjs';
import AuditLogger from './lib/AuditLogger.mjs';
import GatewayEnv from './lib/GatewayEnv.mjs';

/**
 * @typedef {object} process.env required for Gateway node startup
 * @property {string} [TIMELD_GATEWAY_DATA_PATH] should point to a volume, default `/data`
 * @property {string} [LOG_LEVEL] defaults to "INFO"
 * @property {string} TIMELD_GATEWAY_GATEWAY domain name or URL of gateway
 * @property {string} TIMELD_GATEWAY_GENESIS "true" iff the gateway is new
 * @property {string} TIMELD_GATEWAY_AUTH__KEY gateway authorisation key
 * @property {string} TIMELD_GATEWAY_KEY__PUBLIC gateway public key base64, see UserKey
 * @property {string} TIMELD_GATEWAY_KEY__PRIVATE gateway private key base64,
 * encrypted with auth key secret, see UserKey
 * @property {string} TIMELD_GATEWAY_SMTP__HOST
 * @property {string} TIMELD_GATEWAY_SMTP__FROM
 * @property {string} TIMELD_GATEWAY_SMTP__AUTH__USER
 * @property {string} TIMELD_GATEWAY_SMTP__AUTH__PASS
 * @property {string} [TIMELD_GATEWAY_ADDRESS__PORT] defaults to 8080
 * @property {string} [TIMELD_GATEWAY_ADDRESS__HOST] defaults to any-network-host
 * @property {string} TIMELD_GATEWAY_LOGZ__KEY
 */

/**
 * @typedef {object} _TimeldGatewayConfig
 * @property {string} gateway domain name or URL of gateway
 * @property {SmtpOptions} smtp SMTP details for activation emails
 * @property {Object} address server address bind options
 * @property {number} address.port server bind port
 * @property {string} address.host server bind host
 * @property {string} logz.key
 * @typedef {TimeldConfig & _TimeldGatewayConfig} TimeldGatewayConfig
 * @see process.env
 * @see https://nodejs.org/docs/latest-v16.x/api/net.html#serverlistenoptions-callback
 */

const env = new GatewayEnv();
const config = await env.loadConfig();
const keyStore = new DomainKeyStore(config);
const cloneFactory = new IoCloneFactory();
const auditLogger = new AuditLogger(config.logz);

const gateway = new Gateway(env, config, cloneFactory, keyStore, auditLogger);
const notifier = new Notifier(config);
const server = rest({ gateway, notifier });
const io = socketIo({ gateway, server });
io.on('error', LOG.error);
io.on('debug', LOG.debug);

server.listen(config.address, async () => {
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
    await auditLogger.close();
    LOG.info('Gateway shut down');
  }
});
