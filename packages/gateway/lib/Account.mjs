import { propertyValue } from '@m-ld/m-ld';
import { TimesheetId } from 'timeld-common';
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
      timesheets: propertyValue(src, 'timesheet', Set, Object)
    });
  }

  /**
   * @param {Gateway} gateway
   * @param {string} name
   * @param {Set<string>} emails
   * @param {Set<string>} keyids
   * @param {Set<import('@m-ld/m-ld').Reference>} timesheets
   */
  constructor(
    gateway,
    {
      name,
      emails = new Set,
      keyids = new Set,
      timesheets = new Set
    }
  ) {
    this.gateway = gateway;
    this.name = name;
    this.emails = new Set([...emails || []]);
    this.keyids = new Set([...keyids || []]);
    this.timesheets = new Set([...timesheets || []]);
  }

  /**
   * @param {string} email
   * @param {string} timesheet initial timesheet requested
   * @returns {Promise<string>} Ably key for the account
   */
  async activate(email, timesheet) {
    const tsId = new TimesheetId({
      gateway: this.gateway.config['@domain'],
      account: this.name,
      timesheet
    });
    // Every activation creates a new Ably key (assumes new device)
    const keyDetails = await this.gateway.ablyApi.createAppKey(email, {
      [tsId.toDomain()]: ['publish', 'subscribe', 'presence']
    });
    // Store the keyid and the email
    this.emails.add(email);
    this.keyids.add(keyDetails.id);
    await this.gateway.domain.write(this.toJSON());
    return keyDetails.key;
  }

  /**
   * @param {string} jwt a JWT containing a keyid associated with this Account
   * @returns {Promise<import('jsonwebtoken').JwtPayload>}
   */
  verify(jwt) {
    // Verify the JWT against its declared keyid
    // noinspection JSCheckFunctionSignatures
    return verify(jwt, this.getJwtKey);
  }

  /**
   * @type import('jsonwebtoken').GetPublicKeyOrSecret
   * @private
   */
  getJwtKey = async (header, cb) => {
    if (!this.keyids.has(header.kid))
      return cb('Key not present');
    // TODO: Listen for new keys in the account and cache this response
    const keyDetails = await this.gateway.ablyApi.listAppKeys();
    const keyDetail = keyDetails.find(keyDetail => keyDetail.id === header.kid);
    if (!keyDetail)
      return cb('No matching key');
    return cb(null, keyDetail.key);
  };

  toJSON() {
    return {
      '@id': this.name, // scoped to gateway domain
      '@type': 'Account',
      'email': [...this.emails],
      'keyid': [...this.keyids],
      'timesheet': [...this.timesheets]
    };
  }
}