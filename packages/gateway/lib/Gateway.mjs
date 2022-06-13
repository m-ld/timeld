import Account from './Account.mjs';
import { randomInt } from 'crypto';
import Cryptr from 'cryptr';
import { propertyValue, uuid } from '@m-ld/m-ld';
import { AblyKey, Env, timeldContext, TimesheetId } from 'timeld-common';
import jsonwebtoken from 'jsonwebtoken';
import LOG from 'loglevel';
import { access, rm, writeFile } from 'fs/promises';
import errors from 'restify-errors';

export default class Gateway {
  /**
   * @param {import('timeld-common').Env} env
   * @param {Partial<import('@m-ld/m-ld/dist/ably').MeldAblyConfig>} config
   * @param {import('timeld-common').clone} clone m-ld clone creation function
   * @param {import('./AblyApi.mjs').AblyApi} ablyApi Ably control API
   */
  constructor(env, config, clone, ablyApi) {
    if (config['@domain'] == null)
      throw new RangeError('No domain specified for Gateway');
    this.env = env;
    this.config = /**@type {import('@m-ld/m-ld/dist/ably').MeldAblyConfig}*/{
      ...config,
      '@id': uuid(),
      '@context': timeldContext
    };
    LOG.info('Gateway ID is', this.config['@id']);
    LOG.debug('Gateway domain is', this.domainName);
    this.ablyKey = new AblyKey(config.ably.key);
    this.clone = clone;
    this.ablyApi = ablyApi;
    this.timesheetDomains =
      /**@type {{ [name: string]: import('@m-ld/m-ld').MeldClone }}*/{};
  }

  get domainName() {
    return this.config['@domain'];
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
        this.timesheetAdded(this.tsRefAsId(value['?tsh'])).finally(next);
      });
    }, update => {
      // And watch for timesheets appearing and disappearing
      // noinspection JSCheckFunctionSignatures
      return Promise.all([
        ...update['@delete'].map(subject => Promise.all(
          safeTimesheetRefsIn(subject).map(tsRef =>
            this.timesheetRemoved(this.tsRefAsId(tsRef))))),
        ...update['@insert'].map(subject => Promise.all(
          safeTimesheetRefsIn(subject).map(tsRef =>
            this.timesheetAdded(this.tsRefAsId(tsRef)))))
      ]);
    });
    return this;
  }

  /**
   * @param {import('@m-ld/m-ld').Reference} tsRef
   * @returns {TimesheetId}
   */
  tsRefAsId(tsRef) {
    // A timesheet reference may be relative to the domain base
    return TimesheetId.fromUrl(new URL(tsRef['@id'], `http://${this.domainName}`));
  }

  tsId(account, timesheet) {
    return new TimesheetId({
      gateway: this.domainName, account, timesheet
    });
  }

  /**
   * @param {TimesheetId} tsId timesheet to clone
   * @param {boolean} genesis whether timesheet is expected to be new
   */
  async cloneTimesheet(tsId, genesis = false) {
    const config = Object.assign(Env.mergeConfig(this.config, {
      '@id': uuid(), '@domain': tsId.toDomain()
    }), { genesis });
    LOG.info(tsId, 'ID is', config['@id']);
    return this.timesheetDomains[tsId.toDomain()] =
      await this.clone(config, await this.getDataPath(tsId));
  }

  getDataPath(tsId) {
    return this.env.readyPath('data', 'tsh', tsId.account, tsId.timesheet);
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
   * @returns {Promise<Account | undefined>}
   */
  async account(account) {
    const src = await this.domain.get(account);
    if (src != null)
      return Account.fromJSON(this, src);
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
      throw new errors.UnauthorizedError(
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
   * @param {TimesheetId} tsId
   * @returns {Promise<import('@m-ld/m-ld').MeldConfig>}
   */
  async timesheetConfig(tsId) {
    // Do we already have a clone of this timesheet?
    if (!(tsId.toDomain() in this.timesheetDomains)) {
      // Use m-ld write locking to guard against API race conditions
      await this.domain.write(async state => {
        // Genesis if the timesheet is not already in the account
        // TODO: Use `ask` in m-ld-js v0.9
        const accountHasTimesheet = {
          '@id': tsId.account, timesheet: { '@id': tsId.toUrl() }
        };
        const genesis = !(await state.read({
          '@select': '?', '@where': accountHasTimesheet
        })).length;
        // If genesis, check that this timesheet has not existed before
        if (genesis && await this.tsTombstoneExists(tsId))
          throw new errors.ConflictError();
        const ts = await this.cloneTimesheet(tsId, genesis);
        // Ensure that the clone is online to avoid race with the client
        await ts.status.becomes({ online: true });
        // Ensure the timesheet is in the domain
        await state.write(accountHasTimesheet);
      });
    }
    // Return the config required for a new clone
    return Object.assign(Env.mergeConfig(this.config, {
      '@id': false, // Remove identity
      '@domain': tsId.toDomain(),
      ably: { key: false } // Remove our secret
    }), { genesis: false }); // Definitely not genesis
  }

  /**
   * @param {import('@m-ld/m-ld').Read} pattern
   * @returns {import('@m-ld/m-ld').ReadResult} results
   */
  read(pattern) {
    // TODO: Use e.g. ajv to validate queries & apply access control
    return this.domain.read(pattern);
  }

  close() {
    // Close the gateway domain
    return Promise.all([
      this.domain?.close(),
      ...Object.values(this.timesheetDomains).map(d => d.close())
    ]);
  }
}

/**
 * @param subject may contain `timesheet` property
 * @returns {import('@m-ld/m-ld').Reference[]}
 */
function safeTimesheetRefsIn(subject) {
  try {
    // TODO: Use Array of Reference in m-ld-js v0.9
    return propertyValue(subject, 'timesheet', Array, Object)
      .filter(ref => ref['@id'] != null);
  } catch (e) {
    return [];
  }
}
