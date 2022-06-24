import { AccountOwnedId } from 'timeld-common';
import errors from 'restify-errors';

export default class Authorization {
  /**
   * @param {import('restify').Request} req
   */
  constructor(req) {
    if (req.authorization == null)
      throw new errors.UnauthorizedError();
    this.user = req.params.user || req.authorization.basic?.username;
    if (!AccountOwnedId.isComponentId(this.user))
      throw new errors.BadRequestError('Bad user %s', this.user);
    switch (req.authorization.scheme) {
      case 'Bearer':
        if (!req.authorization.credentials)
          throw new errors.UnauthorizedError();
        this.jwt = req.authorization.credentials;
        break;
      case 'Basic':
        if (!req.authorization.basic?.password)
          throw new errors.UnauthorizedError();
        this.key = req.authorization.basic.password;
        break;
      default:
        throw new errors.BadRequestError('Unrecognised authorization');
    }
  }

  /**
   * @param {Gateway} gateway
   * @param {AccountOwnedId} [ownedId]
   * @returns {Promise<void>}
   */
  async verifyUser(gateway, ownedId) {
    const userAcc = await gateway.account(this.user);
    if (userAcc == null)
      throw new errors.NotFoundError('Not found: %s', this.user);
    try {
      if (this.jwt)
        await userAcc.verifyJwt(this.jwt, ownedId);
      else
        await userAcc.verifyKey(this.key, ownedId);
    } catch (e) {
      throw new errors.ForbiddenError(e);
    }
  }
}