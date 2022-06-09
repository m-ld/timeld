import restify from 'restify';
import Gateway from './lib/Gateway.mjs';
import Notifier from './lib/Notifier.mjs';
import { clone, Env, TimesheetId } from 'timeld-common';
import Account from './lib/Account.mjs';
import AblyApi from './lib/AblyApi.mjs';
import LOG from 'loglevel';
import isFQDN from 'validator/lib/isFQDN.js';
import isEmail from 'validator/lib/isEmail.js';
import isJWT from 'validator/lib/isJWT.js';
import errors from 'restify-errors';

/**
 * @typedef {object} process.env required for Gateway node startup
 * @property {string} [TIMELD_GATEWAY_DATA_PATH] should point to a volume, default `/data`
 * @property {string} [LOG_LEVEL] defaults to "INFO"
 * @property {string} TIMELD_GATEWAY_GATEWAY domain name or URL of gateway
 * @property {string} TIMELD_GATEWAY_GENESIS "true" iff the gateway is new
 * @property {string} TIMELD_GATEWAY_ABLY__KEY gateway Ably app key
 * @property {string} TIMELD_GATEWAY_ABLY__API_KEY gateway Ably api key
 * @property {string} TIMELD_GATEWAY_COURIER__AUTHORIZATION_TOKEN
 */

const env = new Env({
  // Default is a volume mount, see fly.toml
  data: process.env.TIMELD_GATEWAY_DATA_PATH || '/data'
}, 'timeld-gateway');
// Parse command line, environment variables & configuration
const config = /**@type {*}*/(await env.yargs()).parse();
LOG.setLevel(config.logLevel || 'INFO');
LOG.debug('Loaded configuration', config);

// Set the m-ld domain from the declared gateway
if (config['@domain'] == null) {
  config['@domain'] = isFQDN(config.gateway) ?
    config.gateway : new URL(config.gateway).hostname;
}

const ablyApi = new AblyApi(config.ably);
const gateway = await new Gateway(env, config, clone, ablyApi).initialise();
const notifier = new Notifier(config.courier);
const server = restify.createServer();
server.use(restify.plugins.queryParser({ mapParams: true }));

server.get('/api/:user/jwe',
  async (req, res, next) => {
    const { user, email } = req.params;
    if (!TimesheetId.isComponentId(user))
      return next(new errors.BadRequestError('Bad user %s', user));
    if (!email || !isEmail(email))
      return next(new errors.BadRequestError('Bad email %s', email));
    try {
      const { jwe, code } = await gateway.activation(user, email);
      await notifier.sendActivationCode(email, code);
      res.json({ jwe });
    } catch (e) {
      LOG.warn(e);
      next(e);
    }
    next();
  });

server.get('/api/:user/key',
  async (req, res, next) => {
    const { user, jwt } = req.params;
    if (!TimesheetId.isComponentId(user))
      return next(new errors.BadRequestError('Bad user %s', user));
    try {
      const { email } = gateway.verify(jwt);
      if (!email || !isEmail(email))
        return next(new errors.BadRequestError('Bad email %s', email));
      const acc = (await gateway.account(user)) ||
        new Account(gateway, { name: user });
      const key = await acc.activate(email);
      res.json({ key });
    } catch (e) {
      LOG.warn(e);
      next(e);
    }
    next();
  });

server.get('/api/:account/tsh/:timesheet/cfg',
  async (req, res, next) => {
    // account is the timesheet account (may not be user account)
    const { account, timesheet, user, jwt } = req.params;
    if (typeof jwt != 'string' || !isJWT(jwt))
      return next(new errors.BadRequestError('Bad JWT'));
    try {
      const tsId = gateway.tsId(account, timesheet).validate();
      try {
        const userAcc = await gateway.account(user);
        if (userAcc == null)
          return next(new errors.NotFoundError('Not found: %s', user));
        try {
          await userAcc.verify(jwt, tsId);
        } catch (e) {
          return next(new errors.ForbiddenError(e));
        }
        res.json(await gateway.timesheetConfig(tsId));
      } catch (e) {
        LOG.warn(e);
        next(e);
      }
    } catch (e) {
      return next(new errors.BadRequestError(
        'Bad timesheet %s/%s', account, timesheet));
    }
    next();
  });

server.listen(8080, function () {
  // noinspection JSUnresolvedVariable
  console.log('%s listening at %s', server.name, server.url);
});

process.on('beforeExit', async () => {
  LOG.info('Gateway shutting down...');
  await gateway.close();
  LOG.info('Gateway shut down');
});