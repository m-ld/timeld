import { propertyValue } from '@m-ld/m-ld';
import { AblyKey, TimesheetId } from 'timeld-common';
import jsonwebtoken from 'jsonwebtoken';
import { promisify } from 'util';

const verify = promisify(jsonwebtoken.verify);

/**
 * Javascript representation of an Account subject in the Gateway domain.
 * Instances are ephemeral, instantiated dynamically on demand, and are not
 * expected to be updated.
 */
export default class Account {
  /**
   * @param {Gateway} gateway
   * @param {import('@m-ld/m-ld').GraphSubject} src
   */
  static fromJSON(gateway, src) {
    // noinspection JSCheckFunctionSignatures
    return new Account(gateway, {
      name: src['@id'],
      emails: propertyValue(src, 'email', Set, String),
      keyids: propertyValue(src, 'keyid', Set, String),
      // TODO: Use Reference in m-ld-js v0.9
      timesheets: propertyValue(src, 'timesheet', Array, Object)
    });
  }

  /**
   * @param {Gateway} gateway
   * @param {string} name plain account name
   * @param {Set<string>} emails verifiable account identities
   * @param {Set<string>} keyids per-device keys
   * @param {import('@m-ld/m-ld').Reference[]} timesheets timesheet Id URLs
   */
  constructor(
    gateway,
    {
      name,
      emails = new Set,
      keyids = new Set,
      timesheets = []
    }
  ) {
    this.gateway = gateway;
    this.name = name;
    this.emails = new Set([...emails ?? []]);
    this.keyids = new Set([...keyids ?? []]);
    this.timesheets = timesheets ?? [];
  }

  /**
   * @param {string} email
   * @param {string} timesheet initial timesheet requested
   * @returns {Promise<string>} Ably key for the account
   */
  async activate(email, timesheet) {
    // Every activation creates a new Ably key (assumes new device)
    const keyDetails = await this.gateway.ablyApi.createAppKey({
      name: email, capability: tsCapability(this.tsId(timesheet))
    });
    // Store the keyid and the email
    this.keyids.add(keyDetails.id);
    this.emails.add(email);
    await this.gateway.domain.write(this.toJSON());
    return keyDetails.key;
  }

  /**
   * Verifies that the given JWT has access to the given timesheet.
   *
   * @param {string} jwt a JWT containing a keyid associated with this Account
   * @param {string} timesheet the timesheet for which access is requested
   * @returns {Promise<import('jsonwebtoken').JwtPayload>}
   */
  verify(jwt, timesheet) {
    // Verify the JWT against its declared keyid
    // noinspection JSCheckFunctionSignatures
    return verify(jwt, this.getJwtKey(timesheet));
  }

  /**
   * @returns import('jsonwebtoken').GetPublicKeyOrSecret
   * @private
   */
  getJwtKey(timesheet) {
    return async (header, cb) => {
      // TODO: Check for access to the timesheet via a Project
      if (!this.keyids.has(header.kid))
        return cb(new Error(`Key ${header.kid} does not have access to ${timesheet}`));
      // Update the capability of the key to include the timesheet.
      // This also serves as a check to see that the key exists.
      try {
        const keyDetail = await this.gateway.ablyApi.updateAppKey(header.kid, {
          capability: tsCapability(this.tsId(timesheet), ...this.tsIds())
        });
        return cb(null, new AblyKey(keyDetail.key).secret);
      } catch (e) {
        cb(e);
      }
    };
  }

  tsId(timesheet) {
    return new TimesheetId({
      gateway: this.gateway.config['@domain'],
      account: this.name,
      timesheet
    });
  }

  *tsIds() {
    for (let tsRef of this.timesheets)
      yield this.gateway.tsId(tsRef);
  }

  toJSON() {
    return {
      '@id': this.name, // scoped to gateway domain
      '@type': 'Account',
      'email': [...this.emails],
      'keyid': [...this.keyids],
      'timesheet': this.timesheets
    };
  }
}

/**
 * @param {TimesheetId} tsIds
 * @returns {object}
 */
function tsCapability(...tsIds) {
  return Object.assign({}, ...tsIds.map(tsId => ({
    [`${tsId.toDomain()}:*`]: ['publish', 'subscribe', 'presence']
  })));
}
