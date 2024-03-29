import { AccountOwnedId, AuthKey, UserKey } from 'timeld-common';
import { UnauthorizedError } from '../rest/errors.mjs';

/**
 * @typedef {object} AccessRequest
 * @property {AccountOwnedId} id a timesheet or project ID for which access is requested
 * @property {'Timesheet'|'Project'} [forWrite] permission requested
 */

export default class Authorization {
  /**
   * @param {import('restify').Request} req
   */
  static fromRequest(req) {
    if (req.authorization == null)
      throw new UnauthorizedError();
    const user = req.params.user || req.authorization.basic?.username;
    switch (req.authorization.scheme) {
      case 'Bearer':
        return new Authorization({
          user, jwt: req.authorization.credentials
        });
      case 'Basic':
        return new Authorization({
          user, key: req.authorization.basic?.password
        });
      default:
        throw new UnauthorizedError('Unrecognised authorization');
    }
  }

  /**
   * @param {string} user
   * @param {string} [jwt] a JWT containing a keyid associated with this Account
   * @param {string} [key] an authorisation key associated with this Account
   */
  constructor({ user, jwt, key }) {
    if (!AccountOwnedId.isComponentId(user))
      throw new UnauthorizedError('Bad user %s', user);
    if (!jwt && !key)
      throw new UnauthorizedError('No user credentials presented');
    this.user = user;
    this.jwt = jwt;
    this.key = key;
  }

  /**
   * @param {Gateway} gateway
   * @param {AccessRequest} [access] a timesheet or project access request
   * @returns {Promise<{ acc: Account, keyid: string }>}
   */
  async verifyUser(gateway, access) {
    const userAcc = await gateway.account(this.user);
    if (userAcc == null)
      throw new UnauthorizedError('Not found: %s', this.user);
    let /**@type UserKey*/userKey;
    if (this.jwt) {
      try { // Verify the JWT against its declared keyid
        const payload = await UserKey.verifyJwt(this.jwt,
          async header => userKey = await userAcc.authorise(header.kid, access));
        if (payload.sub !== this.user)
          return Promise.reject(new UnauthorizedError('JWT does not correspond to user'));
      } catch (e) {
        throw new UnauthorizedError(e);
      }
    } else {
      const authKey = AuthKey.fromString(this.key);
      userKey = await userAcc.authorise(authKey.keyid, access);
      if (!userKey.matches(authKey))
        throw new UnauthorizedError();
    }
    return { acc: userAcc, keyid: userKey.keyid };
  }
}