import { AblyKey, AccountOwnedId } from 'timeld-common';
import errors from 'restify-errors';
import { verify } from './util.mjs';

/**
 * @typedef {object} AccessRequest
 * @property {AccountOwnedId} id a timesheet or project ID for which access is requested
 * @property {'Timesheet'|'Project'} [forWrite] permission requested
 */

export default class Authorization {
  /**
   * @param {import('restify').Request} req
   */
  constructor(req) {
    if (req.authorization == null)
      throw new errors.UnauthorizedError();
    this.user = req.params.user || req.authorization.basic?.username;
    if (!AccountOwnedId.isComponentId(this.user))
      throw new errors.UnauthorizedError('Bad user %s', this.user);
    switch (req.authorization.scheme) {
      case 'Bearer':
        if (!req.authorization.credentials)
          throw new errors.UnauthorizedError();
        /**
         * a JWT containing a keyid associated with this Account
         * @type {string}
         */
        this.jwt = req.authorization.credentials;
        break;
      case 'Basic':
        if (!req.authorization.basic?.password)
          throw new errors.UnauthorizedError();
        /**
         * an Ably key associated with this Account
         * @type {string}
         */
        this.key = req.authorization.basic.password;
        break;
      default:
        throw new errors.BadRequestError('Unrecognised authorization');
    }
  }

  /**
   * @param {Gateway} gateway
   * @param {AccessRequest} [access] a timesheet or project access request
   * @returns {Promise<Account>}
   */
  async verifyUser(gateway, access) {
    const userAcc = await gateway.account(this.user);
    if (userAcc == null)
      throw new errors.UnauthorizedError('Not found: %s', this.user);
    if (this.jwt) {
      try { // Verify the JWT against its declared keyid
        const payload = await verify(this.jwt, async header => {
          const { key } = await userAcc.authorise(header.kid, access);
          return new AblyKey(key).secret;
        });
        if (payload.sub !== this.user)
          return Promise.reject(new errors.UnauthorizedError('JWT does not correspond to user'));
      } catch (e) {
        throw new errors.UnauthorizedError(e);
      }
    } else {
      const ablyKey = new AblyKey(this.key);
      const { key: actualKey } = await userAcc.authorise(ablyKey.keyid, access);
      if (this.key !== actualKey)
        throw new errors.UnauthorizedError();
    }
    return userAcc;
  }
}