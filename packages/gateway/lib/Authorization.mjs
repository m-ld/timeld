import { TimesheetId } from 'timeld-common';
import errors from 'restify-errors';

export default class Authorization {
  /**
   * @param {Gateway} gateway
   * @param {import('restify').Request} req
   */
  constructor(gateway, req) {
    if (!TimesheetId.isComponentId(req.params.user))
      throw new errors.BadRequestError('Bad user %s', req.params.user);
    if (req.authorization.scheme !== 'Bearer')
      throw new errors.UnauthorizedError('Bearer token not provided');
    this.gateway = gateway;
    this.user = req.params.user;
    this.jwt = req.authorization.credentials;
  }

  /**
   * @param {TimesheetId} [tsId]
   * @returns {Promise<void>}
   */
  async verifyUser(tsId) {
    const userAcc = await this.gateway.account(this.user);
    if (userAcc == null)
      throw new errors.NotFoundError('Not found: %s', this.user);
    try {
      await userAcc.verify(this.jwt, tsId);
    } catch (e) {
      throw new errors.ForbiddenError(e);
    }
  }
}