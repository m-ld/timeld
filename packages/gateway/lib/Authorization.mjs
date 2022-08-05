import { AblyKey, AccountOwnedId } from 'timeld-common';
import { verify } from './util.mjs';
import { BadRequestError, UnauthorizedError } from '../rest/errors.mjs';

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
      throw new UnauthorizedError();
    this.user = req.params.user || req.authorization.basic?.username;
    if (!AccountOwnedId.isComponentId(this.user))
      throw new UnauthorizedError('Bad user %s', this.user);
    switch (req.authorization.scheme) {
      case 'Bearer':
        if (!req.authorization.credentials)
          throw new UnauthorizedError();
        /**
         * a JWT containing a keyid associated with this Account
         * @type {string}
         */
        this.jwt = req.authorization.credentials;
        break;
      case 'Basic':
        if (!req.authorization.basic?.password)
          throw new UnauthorizedError();
        /**
         * an Ably key associated with this Account
         * @type {string}
         */
        this.key = req.authorization.basic.password;
        break;
      default:
        throw new BadRequestError('Unrecognised authorization');
    }
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
    let /**@type AblyKey*/ablyKey;
    if (this.jwt) {
      try { // Verify the JWT against its declared keyid
        const payload = await verify(this.jwt, async header => {
          const { key } = await userAcc.authorise(header.kid, access);
          ablyKey = new AblyKey(key);
          return ablyKey.secret;
        });
        if (payload.sub !== this.user)
          return Promise.reject(new UnauthorizedError('JWT does not correspond to user'));
      } catch (e) {
        throw new UnauthorizedError(e);
      }
    } else {
      ablyKey = new AblyKey(this.key);
      const { key: actualKey } = await userAcc.authorise(ablyKey.keyid, access);
      if (this.key !== actualKey)
        throw new UnauthorizedError();
    }
    return { acc: userAcc, keyid: ablyKey.keyid };
  }
}