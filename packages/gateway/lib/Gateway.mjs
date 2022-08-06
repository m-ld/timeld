import Account from './Account.mjs';
import { randomInt } from 'crypto';
import Cryptr from 'cryptr';
import { propertyValue, Reference, uuid } from '@m-ld/m-ld';
import { AblyKey, BaseGateway, Env, timeldContext, UserKey } from 'timeld-common';
import jsonwebtoken from 'jsonwebtoken';
import LOG from 'loglevel';
import { access, rm, writeFile } from 'fs/promises';
import { accountHasTimesheet } from './statements.mjs';
import { concat } from 'rxjs';
import { consume } from 'rx-flowable/consume';
import { ConflictError, NotFoundError, UnauthorizedError } from '../rest/errors.mjs';

/**
 * @typedef {import('@m-ld/m-ld').MeldClone} MeldClone
 */

export default class Gateway extends BaseGateway {
  /**
   * @param {import('timeld-common').Env} env
   * @param {TimeldGatewayConfig} config
   * @param {(...args: *[]) => import('timeld-common').clone} clone m-ld clone creation function
   * @param {import('./AblyApi.mjs').AblyApi} ablyApi Ably control API
   * @param {import('./AuditLogger.mjs').AuditLogger} auditLogger
   */
  constructor(env,
    config,
    clone,
    ablyApi,
    auditLogger
  ) {
    super(config['@domain']);
    this.env = env;
    this.config = /**@type {TimeldGatewayConfig}*/{
      ...config,
      '@id': uuid(),
      '@context': timeldContext
    };
    LOG.info('Gateway ID is', this.config['@id']);
    LOG.debug('Gateway domain is', this.domainName);
    this.ablyKey = new AblyKey(config.ably.key);
    this.machineKey = UserKey.fromConfig(config);
    this.clone = clone;
    this.ablyApi = /**@type {import('./AblyApi.mjs').AblyApi}*/ablyApi;
    this.auditLogger = auditLogger;
    this.timesheetDomains = /**@type {{ [name: string]: MeldClone }}*/{};
  }

  async initialise() {
    // Load the gateway domain
    const dataDir = await this.env.readyPath('data', 'gw');
    this.domain = await this.clone(this.config, dataDir);
    await this.domain.status.becomes({ outdated: false });
    // Enliven all timesheets already in the domain
    await this.domain.read(state => {
      // Timesheets are the range of the 'timesheet' Account property
      state.read({
        '@select': '?tsh', '@where': { timesheet: '?tsh' }
      }).consume.subscribe(({ value, next }) => {
        this.timesheetAdded(this.ownedRefAsId(value['?tsh'])).finally(next);
      });
    }, update => {
      // And watch for timesheets appearing and disappearing
      // noinspection JSCheckFunctionSignatures
      return Promise.all([
        ...update['@delete'].map(subject => Promise.all(
          propertyValue(subject, 'timesheet', Array, Reference).map(tsRef =>
            this.timesheetRemoved(this.ownedRefAsId(tsRef))))),
        ...update['@insert'].map(subject => Promise.all(
          propertyValue(subject, 'timesheet', Array, Reference).map(tsRef =>
            this.timesheetAdded(this.ownedRefAsId(tsRef)))))
      ]);
    });
    return this;
  }

  /**
   * @param {AccountOwnedId} tsId timesheet to clone
   * @param {boolean} genesis whether timesheet is expected to be new
   * @returns {Promise<MeldClone>}
   */
  async cloneTimesheet(tsId, genesis = false) {
    const config = Object.assign(Env.mergeConfig(this.config, {
      '@id': uuid(), '@domain': tsId.toDomain()
    }), { genesis });
    LOG.info(tsId, 'ID is', config['@id']);
    const principal = { '@id': this.absoluteId('/') };
    const ts = await this.clone(config, await this.getDataPath(tsId), principal);
    ts.follow(update => this.auditLogger.log(tsId, update));
    if (genesis) {
      // Add our machine identity and key to the timesheet for signing
      await this.writePrincipalToTimesheet(ts, '/', 'Gateway', this.machineKey);
    }
    return this.timesheetDomains[tsId.toDomain()] = ts;
  }

  /**
   *
   * @param {MeldClone} ts
   * @param {string} iri gateway-relative or absolute IRI
   * @param {'Account'|'Gateway'} type note vocabulary is common between gw and ts
   * @param {UserKey} key
   * @returns {Promise<void>}
   */
  async writePrincipalToTimesheet(ts, iri, type, key) {
    await ts.write({
      '@id': this.absoluteId(iri), '@type': type, key: key.toJSON(true)
    });
  }

  getDataPath(tsId) {
    return this.env.readyPath('data', 'tsh', tsId.account, tsId.name);
  }

  async timesheetAdded(tsId) {
    if (!(tsId.toDomain() in this.timesheetDomains)) {
      try {
        await this.cloneTimesheet(tsId);
        LOG.info('Loaded declared timesheet', tsId);
      } catch (e) {
        // If the clone fails that's fine, we'll try again if it's asked for
        LOG.warn('Failed to load declared timesheet', tsId, e);
      }
    }
  }

  async timesheetRemoved(tsId) {
    try {
      await this.timesheetDomains[tsId.toDomain()]?.close();
      const path = await this.getDataPath(tsId);
      // Remove the persistent data
      await rm(path, { recursive: true, force: true });
      // Write the tombstone file to prevent re-creation
      await writeFile(`${path}.rip`, '');
      // TODO: Remove all channel permissions
      delete this.timesheetDomains[tsId.toDomain()];
      LOG.info('Removed declared timesheet', tsId);
    } catch (e) {
      LOG.warn('Error removing declared timesheet', tsId, e);
    }
  }

  async tsTombstoneExists(tsId) {
    const path = await this.getDataPath(tsId);
    return access(`${path}.rip`).then(() => true, () => false);
  }

  /**
   * @param {string} account name
   * @param {true} [orCreate] allow creation of new account
   * @returns {Promise<Account | undefined>}
   */
  async account(account, { orCreate } = {}) {
    let acc;
    await this.domain.write(async state => {
      const src = await state.get(account);
      if (src != null) {
        acc = Account.fromJSON(this, src);
      } else if (orCreate) {
        acc = new Account(this, { name: account });
        await state.write(acc.toJSON());
      }
    });
    return acc;
  }

  /**
   * @param {string} account name
   * @param {string} email
   * @returns {Promise<{ jwe: string, code: string }>}
   */
  async activation(account, email) {
    // If the account exists, check the email is registered
    const acc = await this.account(account);
    if (acc != null && !acc.emails.has(email))
      throw new UnauthorizedError(
        'Email %s not registered to account %s', email, account);
    // Construct a JWT with the email, using our Ably key
    const { secret, keyid } = this.ablyKey;
    const jwt = jsonwebtoken.sign({ email }, secret, {
      keyid, expiresIn: '10m'
    });
    // Encrypt the JWT with the activation code
    const code = randomInt(111111, 1000000).toString(10);
    const jwe = new Cryptr(code).encrypt(jwt);
    return { jwe, code };
  }

  /**
   * @param {string} jwt a JWT created by this Gateway
   * @returns {object} the JWT payload
   */
  verify(jwt) {
    // Verify the JWT was created by us
    return jsonwebtoken.verify(jwt, this.ablyKey.secret);
  }

  /**
   * Gets the m-ld configuration for a timesheet. Calling this method will
   * create the timesheet if it does not already exist.
   *
   * The caller must have already checked user access to the timesheet.
   *
   * @param {AccountOwnedId} tsId
   * @param {Account} user
   * @param {string} keyid
   * @returns {Promise<import('@m-ld/m-ld').MeldConfig>}
   */
  async timesheetConfig(tsId, { acc: user, keyid }) {
    const tsDomain = tsId.toDomain();
    // Use m-ld write locking to guard against API race conditions
    await this.domain.write(async state => {
      // Do we already have a clone of this timesheet?
      let ts = this.timesheetDomains[tsDomain];
      if (ts == null) {
        // Genesis if the timesheet is not already in the account
        ts = await this.initTimesheet(tsId, await this.isGenesisTs(state, tsId));
        // Ensure the timesheet is in the domain
        state = await state.write(accountHasTimesheet(tsId));
      }
      // Ensure that the account is in the timesheet for signing
      await this.writePrincipalToTimesheet(
        ts, user.name, 'Account', await user.key(state, keyid));
    });
    // Return the config required for a new clone, using some of our config
    const { ably, networkTimeout, maxOperationSize, logLevel } = this.config;
    return Env.mergeConfig({
      '@domain': tsDomain,
      genesis: false, // Definitely not genesis
      ably, networkTimeout, maxOperationSize, logLevel
    }, {
      ably: { key: false, apiKey: false } // Remove our Ably secrets
    });
  }

  /**
   * @param {import('@m-ld/m-ld').MeldReadState} state
   * @param {AccountOwnedId} tsId
   * @returns {Promise<boolean>}
   */
  async isGenesisTs(state, tsId) {
    return !(await state.ask({ '@where': accountHasTimesheet(tsId) }));
  }

  /**
   * @param {AccountOwnedId} tsId
   * @param {boolean} genesis
   * @returns {Promise<MeldClone>}
   */
  async initTimesheet(tsId, genesis) {
    if (tsId.toDomain() in this.timesheetDomains)
      return this.timesheetDomains[tsId.toDomain()];
    // If genesis, check that this timesheet has not existed before
    if (genesis && await this.tsTombstoneExists(tsId))
      throw new ConflictError();
    const ts = await this.cloneTimesheet(tsId, genesis);
    // Ensure that the clone is online to avoid race with the client
    await ts.status.becomes({ online: true });
    return ts;
  }

  /**
   * Reports on the given timesheet OR project with the given ID.
   *
   * The results will contain the following subjects in guaranteed order:
   * 1. The project, if applicable
   * 2. The timesheet OR all timesheets in the project, each followed
   * immediately by its entries
   *
   * @param {AccountOwnedId} ownedId
   * @returns {Promise<Results>}
   */
  report(ownedId) {
    return new Promise(async (resolve, reject) => {
      this.domain.read(async state => {
        try {
          const owned = await state.get(ownedId.toIri());
          switch (owned?.['@type']) {
            case 'Timesheet':
              return resolve(await this.reportTimesheet(owned));
            case 'Project':
              // Don't hold the gateway domain open while all timesheets are output
              const timesheets = await state.read({
                '@describe': '?ts',
                '@where': { '@id': '?ts', '@type': 'Timesheet', project: owned['@id'] }
              });
              const tsFlows = await Promise.all(timesheets.map(this.reportTimesheet));
              return resolve(concat(consume([owned]), ...tsFlows));
            default:
              return reject(new NotFoundError('%s not found', ownedId));
          }
        } catch (e) {
          return reject(e);
        }
      });
    });
  }

  /**
   * @param {import('@m-ld/m-ld').GraphSubject} ts
   * @returns {Promise<Results>}
   */
  reportTimesheet = async ts => {
    const tsId = this.ownedRefAsId(ts);
    const tsClone = await this.initTimesheet(tsId, false);
    // FIXME: Bug in m-ld-js does not permit result consumable to be subscribed
    // after read completes. Should be using read(<req>).consume.
    const result = await tsClone.read({
      '@describe': '?entry',
      '@where': { '@id': '?entry', '@type': 'Entry' }
    });
    return concat(consume([ts]), consume(result));
  };

  close() {
    // Close the gateway domain
    return Promise.all([
      this.domain?.close(),
      ...Object.values(this.timesheetDomains).map(d => d.close())
    ]);
  }
}

