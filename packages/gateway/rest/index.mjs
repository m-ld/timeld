import restify from 'restify';
import {
  AccountOwnedId, domainRelativeIri, isDomainEntity, ResultsReadable, timeldContext
} from 'timeld-common';
import isEmail from 'validator/lib/isEmail.js';
import Authorization from '../lib/Authorization.mjs';
import { pipeline } from 'stream/promises';
import LOG from 'loglevel';
import { consume } from 'rx-flowable/consume';
import ndjson from 'ndjson';
import { BadRequestError, toHttpError } from './errors.mjs';

/**
 * @param {ResultsFormat} format
 * @returns {import('restify').Formatter}
 */
const formatter = format => {
  return (req, res, body) => {
    const data = `${format.opening || ''}${format.stringify(body)}${format.closing || ''}`;
    res.setHeader('Content-Length', Buffer.byteLength(data));
    return data;
  };
};
/** @type {ResultsFormat} */
const ND_JSON_FORMAT = { stringify: JSON.stringify, separator: '\n' };
/** @type {ResultsFormat} */
const JSON_LD_FORMAT = {
  stringify: s => JSON.stringify(s, null, ' '),
  separator: ',\n'
};
/** @type {ResultsFormat} */
const HTML_FORMAT = {
  stringify: s => JSON.stringify(s, null, ' '),
  opening: '<pre>', closing: '</pre>', separator: '\n'
};

/**
 * @param {import('restify').Response} res
 * @param {Results} results
 * @returns {Promise<void>}
 */
async function sendStream(res, results) {
  res.header('transfer-encoding', 'chunked');
  res.header('content-type', 'application/x-ndjson');
  res.status(200);
  await pipeline(new ResultsReadable(results, ND_JSON_FORMAT), res);
}

/**
 * @param {Gateway} gateway
 * @param {Notifier} notifier
 * @returns {import('restify').Server}
 */
export default function rest({ gateway, notifier }) {
  const server = restify.createServer({
    formatters: {
      'application/ld+json': formatter(JSON_LD_FORMAT),
      'text/html': formatter(HTML_FORMAT)
    }
  });
  server.use(restify.plugins.queryParser({ mapParams: true }));
  server.use(restify.plugins.authorizationParser());
  server.on('InternalServer', function (req, res, err, cb) {
    LOG.warn(err);
    cb();
  });
  if (LOG.getLevel() <= LOG.levels.DEBUG) {
    server.pre(function (req, res, next) {
      LOG.info(`${req.method} ${req.url} ${JSON.stringify({
        ...req.headers, authorization: undefined
      })}`);
      return next();
    });
  }

  server.get('/api/jwe/:user',
    async (req, res, next) => {
      const { user, email } = req.params;
      if (!AccountOwnedId.isComponentId(user))
        return next(new BadRequestError('Bad user %s', user));
      if (!email || !isEmail(email))
        return next(new BadRequestError('Bad email %s', email));
      try {
        const { jwe, code } = await gateway.activation(user, email);
        await notifier.sendActivationCode(email, code);
        res.json({ jwe });
        next();
      } catch (e) {
        next(toHttpError(e));
      }
    });

  server.get('/api/key/:user',
    async (req, res, next) => {
      try {
        const auth = Authorization.fromRequest(req);
        const { email } = gateway.verify(auth.jwt);
        if (!email || !isEmail(email))
          return next(new BadRequestError('Bad email %s', email));
        const acc = await gateway.account(auth.user, { orCreate: true });
        res.json(await acc.activate(email));
        next();
      } catch (e) {
        next(toHttpError(e));
      }
    });

  server.get('/api/cfg/:account/tsh/:timesheet',
    async (req, res, next) => {
      // account is the timesheet account (may not be user account)
      const { account, timesheet } = req.params;
      try {
        const id = gateway.ownedId(account, timesheet).validate();
        try {
          const who = await Authorization.fromRequest(req).verifyUser(
            gateway, { id, forWrite: 'Timesheet' });
          res.json(await gateway.timesheetConfig(id, who));
        } catch (e) {
          next(toHttpError(e));
        }
        next();
      } catch (e) {
        // TimesheetId.validate throw strings
        return next(new BadRequestError(
          'Bad timesheet %s/%s', account, timesheet));
      }
    });

  server.post('/api/read', restify.plugins.bodyParser(),
    async (req, res, next) => {
      try {
        const { acc } = await Authorization.fromRequest(req).verifyUser(gateway);
        await sendStream(res, await acc.read(req.body));
        next();
      } catch (e) {
        next(toHttpError(e));
      }
    });

  server.post('/api/write', restify.plugins.bodyParser(),
    async (req, res, next) => {
      try {
        const { acc } = await Authorization.fromRequest(req).verifyUser(gateway);
        await acc.write(req.body);
        res.send(200);
        next();
      } catch (e) {
        next(toHttpError(e));
      }
    });

  server.get('/api/rpt/:account/own/:owned',
    async (req, res, next) => {
      const { account, owned } = req.params;
      try {
        const id = gateway.ownedId(account, owned).validate();
        await Authorization.fromRequest(req).verifyUser(gateway, { id });
        await sendStream(res, await gateway.report(id));
        next();
      } catch (e) {
        next(toHttpError(e));
      }
    });

  server.post('/api/import',
    async (req, res, next) => {
      try {
        const { acc } = await Authorization.fromRequest(req).verifyUser(gateway);
        await acc.import(consume(req.pipe(ndjson.parse())));
        res.send(200);
        next();
      } catch (e) {
        next(toHttpError(e));
      }
    });

  server.get('/context',
    async (req, res, next) => {
      res.contentType = req.accepts('html') ? 'html' : 'application/ld+json';
      // noinspection HttpUrlsUsage
      res.send({
        '@base': domainRelativeIri('/', gateway.domainName),
        ...timeldContext
      });
      next();
    });

  server.get('/jtd',
    async (req, res, next) => {
      res.contentType = req.accepts('html') ? 'html' : 'json';
      res.send(isDomainEntity);
      next();
    });

  server.get('/publicKey',
    async (req, res, next) => {
      res.contentType = 'text';
      res.send(gateway.me.userKey.getCryptoPublicKey().export({
        format: 'pem', type: 'spki'
      }));
      next();
    });

  return server;
}