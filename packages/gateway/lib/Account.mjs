import { propertyValue } from '@m-ld/m-ld';
import { AblyKey } from 'timeld-common';
import jsonwebtoken from 'jsonwebtoken';
import errors from 'restify-errors';

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
   * Activation of a gateway account requires an initial timesheet.
   * This is because Ably cannot create a key without at least one capability.
   *
   * @param {string} email
   * @returns {Promise<string>} Ably key for the account
   */
  async activate(email) {
    // Every activation creates a new Ably key (assumes new device)
    const keyDetails = await this.gateway.ablyApi.createAppKey({
      name: `${this.name}@${this.gateway.domainName}`,
      capability: this.keyCapability()
    });
    // Store the keyid and the email
    this.keyids.add(keyDetails.id);
    this.emails.add(email);
    await this.gateway.domain.write(this.toJSON());
    return keyDetails.key;
  }

  /**
   * Verifies the given JWT for this account.
   *
   * @param {string} jwt a JWT containing a keyid associated with this Account
   * @param {TimesheetId} [tsId] a timesheet for which access is requested
   * @returns {Promise<import('jsonwebtoken').JwtPayload>}
   */
  async verify(jwt, tsId) {
    // Verify the JWT against its declared keyid
    const payload = await verify(jwt, async header => {
      // TODO: Check for write access to the timesheet
      if (!this.keyids.has(header.kid))
        throw new Error(`Key ${header.kid} does not belong to account ${this.name}`);
      // Update the capability of the key to include the timesheet.
      // This also serves as a check that the key exists.
      // TODO: Include access via organisations
      const authorisedTsIds = [...this.tsIds()].concat(tsId ?? []);
      const keyDetail = await this.gateway.ablyApi.updateAppKey(header.kid, {
        capability: this.keyCapability(...authorisedTsIds)
      });
      return new AblyKey(keyDetail.key).secret;
    });
    if (payload.sub !== this.name)
      throw new errors.UnauthorizedError('JWT does not correspond to user');
    return payload;
  }

  /**
   * @returns the Timesheet IDs provided by this account
   */
  *tsIds() {
    for (let tsRef of this.timesheets)
      yield this.gateway.tsRefAsId(tsRef);
  }

  /**
   * @param {TimesheetId} tsIds
   * @returns {object}
   */
  keyCapability(...tsIds) {
    return Object.assign({
      // Ably keys must have a capability. Assign a notification channels as a minimum.
      [`${this.gateway.domainName}:notify`]: ['subscribe']
    }, ...tsIds.map(tsId => ({
      [`${tsId.toDomain()}:*`]: ['publish', 'subscribe', 'presence']
    })));
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
 * Promisified version of jsonwebtoken.verify
 * @param {string} token
 * @param {(header: import('jsonwebtoken').JwtHeader) => Promise<string>} getSecret
 * @returns {Promise<import('jsonwebtoken').JwtPayload>}
 */
function verify(token, getSecret) {
  return new Promise((resolve, reject) =>
    jsonwebtoken.verify(token, (header, cb) => {
      getSecret(header).then(secret => cb(null, secret), err => cb(err));
    }, (err, payload) => {
      if (err) reject(err);
      else resolve(payload);
    }));
}
