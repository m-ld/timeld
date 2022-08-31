/**
 * An authorisation key with app, keyid and secret components
 */
export default class AuthKey {
  constructor(keyStr) {
    const [keyName, secret] = keyStr.split(':');
    const [appId, keyid] = keyName.split('.');
    this.appId = appId;
    this.keyid = keyid;
    this.secret = secret;
    if (this.toString() !== keyStr)
      throw new RangeError(`${keyStr} is not a valid authorisation key`);
  }

  toString() {
    return `${this.appId}.${this.keyid}:${this.secret}`;
  }
}

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
 * @returns {Promise<AuthKeyDetail>}
 */

/**
 * @typedef {object} AuthKeyDetail full details of an authorisation key
 * @property {string} id The keyid
 * @property {string} name Friendly name for reference
 * @property {0|1} status The status of the key. 0 is enabled, 1 is revoked
 * @property {string} key The complete authorisation key including secret
 */
