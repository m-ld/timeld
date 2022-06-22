import { AccountSubId } from '../index.mjs';

/**
 * Utility base class for things that represent a Gateway
 */
export default class BaseGateway {
  /**
   * @param {string} domainName
   */
  constructor(domainName) {
    if (!domainName)
      throw new RangeError('No domain specified for Gateway');
    this.domainName = domainName;
  }

  /**
   * @param {import('@m-ld/m-ld').Reference} tsRef
   * @returns {AccountSubId}
   */
  tsRefAsId(tsRef) {
    // A timesheet reference may be relative to the domain base
    return AccountSubId.fromUrl(tsRef['@id'], this.domainName);
  }

  tsId(account, timesheet) {
    return new AccountSubId({
      gateway: this.domainName, account, name: timesheet
    });
  }
}