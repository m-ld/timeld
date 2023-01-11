/**
 * An authorisation key with app, keyid and secret components
 */
export default class AuthKey {
  static fromString(keyStr) {
    const [keyName, secret] = keyStr.split(':');
    const [appId, keyid] = keyName.split('.');
    const authKey = new AuthKey({ appId, keyid, secret });
    if (authKey.toString() !== keyStr)
      throw new RangeError(`${keyStr} is not a valid authorisation key`);
    return authKey;
  }

  constructor({ appId, keyid, secret }) {
    /** Application ID: for multi-app gateways, not used in timeld */
    this.appId = appId;
    /** Key ID: scoped to app */
    this.keyid = keyid;
    /** Secret material */
    this.secret = secret;
  }

  toString() {
    return `${this.appId}.${this.keyid}:${this.secret}`;
  }
}

/**
 * @typedef {object} AuthKeyDetail full details of an authorisation key
 * @property {AuthKey} key The complete key including secret
 * @property {string} name Friendly name
 * @property {boolean} revoked The revocation status
 */

/**
 * A persistent store of keys
 * @interface AuthKeyStore
 */

/**
 * Mint a new authorisation key with the given friendly name.
 * @function
 * @name AuthKeyStore#mintKey
 * @param {string} name Friendly name for reference
 * @returns {Promise<AuthKeyDetail>}
 */

/**
 * Ping the given authorisation keyid. This operation checks that the key
 * exists, and may update its privileges; it returns the key details.
 * @function
 * @name AuthKeyStore#pingKey
 * @param {string} keyid
 * @param {() => Promise<AccountOwnedId[]>} getAuthorisedTsIds callback to get
 * authorised Timesheet IDs for the requested key, if this key store supports
 * fine-grained privileges
 * @returns {Promise<boolean>}
 */
