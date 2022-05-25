import restify from 'restify';
import Gateway from './lib/Gateway.mjs';
import Notifier from './lib/Notifier.mjs';
import { clone, Env } from 'timeld-common';
import { HttpError } from '@m-ld/io-web-runtime/dist/server/fetch';
import Account from './lib/Account.mjs';
import AblyApi from './lib/AblyApi.mjs';

/**
 * @typedef {object} process.env required for Gateway node startup
 * @property {string} [DATA_PATH] should point to a volume
 * @property {string} [CONFIG_PATH] should point to a volume
 * @property {string} [LOG_PATH] should point to a volume
 * @property {string} [LOG] defaults to "INFO"
 * @property {string} TIMELD_GENESIS "true" iff the gateway is new
 * @property {string} TIMELD_ABLY__KEY gateway Ably app key
 * @property {string} TIMELD_ABLY__API_KEY gateway Ably api key
 * @property {string} TIMELD_COURIER__AUTHORIZATION_TOKEN
 */

const env = new Env({
  data: process.env.DATA_PATH || '/data',
  config: process.env.CONFIG_PATH || '/config',
  log: process.env.LOG_PATH || '/log'
});
// Parse command line, environment variables & configuration
const config = /**@type {*}*/(await env.yargs()).parse();
const ablyApi = new AblyApi(config.ably);
const gateway = await new Gateway(env, config, clone, ablyApi).initialise();
const notifier = new Notifier(config.courier);
const server = restify.createServer();
server.use(restify.plugins.queryParser());

server.get('/:account/jwe',
  async (req, res, next) => {
    const { account, email } = req.params;
    const { jwe, code } = gateway.activation(account, email);
    await notifier.sendActivationCode(email, code);
    res.json({ jwe });
    next();
  });

server.get('/:account/key',
  async (req, res, next) => {
    const { account, jwt, timesheet } = req.params;
    const { email } = gateway.verify(jwt);
    const acc = (await gateway.account(account)) ||
      new Account(gateway, { name: account });
    const key = await acc.activate(email, timesheet);
    res.json({ key });
    next();
  });

server.get('/:account/tsh/:timesheet/cfg',
  async (req, res, next) => {
    const { account, timesheet, jwt } = req.params;
    const acc = await gateway.account(account);
    if (acc == null)
      throw new HttpError(404, 'Not Found');
    await acc.verify(jwt);
    res.json(await gateway.timesheetConfig(account, timesheet));
    next();
  });

server.listen(8080, function () {
  // noinspection JSUnresolvedVariable
  console.log('%s listening at %s', server.name, server.url);
});

process.on('beforeExit', async () => {
  await gateway.close();
});