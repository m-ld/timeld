import restify from 'restify';
import Gateway from './lib/Gateway.mjs';
import Notifier from './lib/Notifier.mjs';
import { clone, Env, TimesheetId } from 'timeld-common';
import Account from './lib/Account.mjs';
import AblyApi from './lib/AblyApi.mjs';
import LOG from 'loglevel';
import validator from 'validator';
import errors from 'restify-errors';

/**
 * @typedef {object} process.env required for Gateway node startup
 * @property {string} [DATA_PATH] should point to a volume, default `/data`
 * @property {string} [LOG_LEVEL] defaults to "INFO"
 * @property {string} TIMELD_GATEWAY domain name or URL of gateway
 * @property {string} TIMELD_GENESIS "true" iff the gateway is new
 * @property {string} TIMELD_ABLY__KEY gateway Ably app key
 * @property {string} TIMELD_ABLY__API_KEY gateway Ably api key
 * @property {string} TIMELD_COURIER__AUTHORIZATION_TOKEN
 */

const env = new Env({
  data: process.env.DATA_PATH || '/data', // Default is a volume mount, see fly.toml
  config: process.env.CONFIG_PATH, // Currently unused
  log: process.env.LOG_PATH // Unused; logging is managed by fly.io
});
// Parse command line, environment variables & configuration
const config = /**@type {*}*/(await env.yargs()).parse();
LOG.setLevel(config.logLevel || 'INFO');
LOG.trace('Loaded configuration', config);

// Set the m-ld domain from the declared gateway
if (config['@domain'] == null) {
  config['@domain'] = validator.isFQDN(config.gateway) ?
    config.gateway : new URL(config.gateway).hostname;
  LOG.debug(`Gateway domain is ${config['@domain']}`);
}

const ablyApi = new AblyApi(config.ably);
const gateway = await new Gateway(env, config, clone, ablyApi).initialise();
const notifier = new Notifier(config.courier);
const server = restify.createServer();
server.use(restify.plugins.queryParser({ mapParams: true }));

server.get('/api/:account/jwe',
  async (req, res, next) => {
    const { account, email } = req.params;
    if (!account || !TimesheetId.isComponentId(account))
      return next(new errors.BadRequestError('Bad account %s', account));
    if (!email || !validator.isEmail(email))
      return next(new errors.BadRequestError('Bad email %s', email));
    try {
      const { jwe, code } = await gateway.activation(account, email);
      await notifier.sendActivationCode(email, code);
      res.json({ jwe });
    } catch (e) {
      LOG.warn(e);
      next(e);
    }
    next();
  });

server.get('/api/:account/key',
  async (req, res, next) => {
    const { account, jwt, timesheet } = req.params;
    if (!account || !TimesheetId.isComponentId(account))
      return next(new errors.BadRequestError('Bad account %s', account));
    if (!timesheet || !TimesheetId.isComponentId(timesheet))
      return next(new errors.BadRequestError('Bad timesheet %s', timesheet));
    try {
      const { email } = gateway.verify(jwt);
      if (!email || !validator.isEmail(email))
        return next(new errors.BadRequestError('Bad email %s', email));
      const acc = (await gateway.account(account)) ||
        new Account(gateway, { name: account });
      const key = await acc.activate(email, timesheet);
      res.json({ key });
    } catch (e) {
      LOG.warn(e);
      next(e);
    }
    next();
  });

server.get('/api/:account/tsh/:timesheet/cfg',
  async (req, res, next) => {
    const { account, timesheet, jwt } = req.params;
    if (!account || !TimesheetId.isComponentId(account))
      return next(new errors.BadRequestError('Bad account %s', account));
    if (!timesheet || !TimesheetId.isComponentId(timesheet))
      return next(new errors.BadRequestError('Bad timesheet %s', timesheet));
    if (!jwt || !validator.isJWT(jwt))
      return next(new errors.BadRequestError('Bad JWT'));
    try {
      const acc = await gateway.account(account);
      if (acc == null)
        return next(new errors.NotFoundError('Not found: %s', account));
      try {
        await acc.verify(jwt);
      } catch (e) {
        return next(new errors.ForbiddenError(e));
      }
      res.json(await gateway.timesheetConfig(account, timesheet));
    } catch (e) {
      LOG.warn(e);
      next(e);
    }
    next();
  });

server.listen(8080, function () {
  // noinspection JSUnresolvedVariable
  console.log('%s listening at %s', server.name, server.url);
});

process.on('beforeExit', async () => {
  await gateway.close();
});