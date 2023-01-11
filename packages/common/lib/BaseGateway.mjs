import { AccountOwnedId } from '../index.mjs';
import { domainRelativeIri } from './util.mjs';

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
   * @param {Reference} tsRef
   * @returns {AccountOwnedId}
   */
  ownedRefAsId(tsRef) {
    // A timesheet reference may be relative to the domain base
    return AccountOwnedId.fromReference(tsRef, this.domainName);
  }

  ownedId(account, name) {
    return new AccountOwnedId({
      gateway: this.domainName, account, name
    });
  }

  absoluteId(iri) {
    return domainRelativeIri(iri, this.domainName);
  }
}