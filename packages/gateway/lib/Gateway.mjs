import Account from './Account';
import { randomInt } from 'crypto';
import Cryptr from 'cryptr';
import { uuid } from '@m-ld/m-ld';
import { Env, timeldContext, TimesheetId } from 'timeld-common';
import jsonwebtoken from 'jsonwebtoken';

export default class Gateway {
  /**
   * @param {import('timeld-common').Env} env
   * @param {Partial<import('@m-ld/m-ld/dist/ably').MeldAblyConfig>} config
   * @param {import('timeld-common').clone} clone
   * @param {import('./AblyApi.mjs').AblyApi} ablyApi
   */
  constructor(
    env,
    config,
    clone,
    ablyApi
  ) {
    this.env = env;
    this.config = /**@type {import('@m-ld/m-ld/dist/ably').MeldAblyConfig}*/{
      ...config,
      '@id': uuid(),
      '@context': timeldContext
    };
    const [keyid, secret] = config.ably.key.split(':') ?? [];
    this.ablyKeyid = keyid;
    this.ablySecret = secret;
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
    // TODO: Listen for timesheets being deleted from accounts
    return this;
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
    const jwt = jsonwebtoken.sign({ email }, this.ablySecret, {
      keyid: this.ablyKeyid,
      expiresIn: '10m'
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
    return jsonwebtoken.verify(jwt, this.ablySecret);
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
        const accountHasTimesheet = { '@id': account, timesheet: tsId.toUrl() };
        const genesis = !(await state.read({
          '@select': '?', '@where': accountHasTimesheet
        })).length;
        const config = Env.mergeConfig(this.config, {
          '@id': uuid(), // New identity
          '@domain': tsId.toDomain(),
          genesis
        });
        const dataDir = await this.env.readyPath(
          'data', 'tsh', account, timesheet);
        this.timesheetDomains[tsId.toDomain()] = await this.clone(config, dataDir);
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

  close() {
    // Close the gateway domain
    return Promise.all([
      this.domain?.close(),
      ...Object.values(this.timesheetDomains).map(d => d.close())
    ]);
  }
}