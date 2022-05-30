import Account from './Account.mjs';
import { randomInt } from 'crypto';
import Cryptr from 'cryptr';
import { propertyValue, uuid } from '@m-ld/m-ld';
import { AblyKey, Env, timeldContext, TimesheetId } from 'timeld-common';
import jsonwebtoken from 'jsonwebtoken';
import LOG from 'loglevel';

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
    this.ablyKey = new AblyKey(config.ably.key);
    this.clone = clone;
    this.ablyApi = ablyApi;
    this.timesheetDomains =
      /**@type {{ [name: string]: import('@m-ld/m-ld').MeldClone }}*/{};
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
        this.timesheetAdded(TimesheetId.fromUrl(value['?tsh']['@id'])).finally(next);
      });
    }, update => {
      // And watch for timesheets appearing and disappearing
      // noinspection JSCheckFunctionSignatures
      return Promise.all([
        ...update['@delete'].map(subject => Promise.all(
          propertyValue(subject, 'timesheet', Array, Object).map(tsRef =>
            this.timesheetRemoved(TimesheetId.fromUrl(tsRef['@id']))))),
        ...update['@insert'].map(subject => Promise.all(
          propertyValue(subject, 'timesheet', Array, Object).map(tsRef =>
            this.timesheetAdded(TimesheetId.fromUrl(tsRef['@id'])))))
      ]);
    });
    return this;
  }

  async timesheetAdded(tsId) {
    if (!(tsId.toDomain() in this.timesheetDomains)) {
      try {
        await this.cloneTimesheet(tsId);
      } catch (e) {
        // If the clone fails that's fine, we'll try again if it's asked for
        LOG.warn(`Declared timesheet ${tsId} failed to load with`, e);
      }
    }
  }

  async timesheetRemoved(tsId) {
    await this.timesheetDomains[tsId.toDomain()]?.close();
    await this.env.delEnvDir('data',
      ['tsh', tsId.account, tsId.timesheet], { force: true });
    delete this.timesheetDomains[tsId.toDomain()];
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
      throw 'Email not registered to account';
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
   * @param account
   * @param timesheet
   * @returns {Promise<import('@m-ld/m-ld').MeldConfig>}
   */
  async timesheetConfig(account, timesheet) {
    // Do we already have a clone of this timesheet?
    const tsId = new TimesheetId({
      gateway: this.config['@domain'], account, timesheet
    });
    if (!(tsId.toDomain() in this.timesheetDomains)) {
      // Use m-ld write locking to guard against API race conditions
      await this.domain.write(async state => {
        // Genesis if the timesheet is not already in the account
        // TODO: Use `ask` in m-ld-js v0.9
        const accountHasTimesheet = {
          '@id': account, timesheet: { '@id': tsId.toUrl() }
        };
        const genesis = !(await state.read({
          '@select': '?', '@where': accountHasTimesheet
        })).length;
        await this.cloneTimesheet(tsId, genesis);
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
   * @param tsId timesheet to clone
   * @param genesis whether timesheet is expected to be new
   * @returns {Promise<void>}
   */
  async cloneTimesheet(tsId, genesis = false) {
    this.timesheetDomains[tsId.toDomain()] = await this.clone(
      Object.assign(Env.mergeConfig(this.config, {
        '@id': uuid(), '@domain': tsId.toDomain()
      }), { genesis }),
      await this.env.readyPath(
        'data', 'tsh', tsId.account, tsId.timesheet));
  }

  close() {
    // Close the gateway domain
    return Promise.all([
      this.domain?.close(),
      ...Object.values(this.timesheetDomains).map(d => d.close())
    ]);
  }
}