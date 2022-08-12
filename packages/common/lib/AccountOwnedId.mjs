import { domainRelativeIri } from './util.mjs';

/**
 * Combination of gateway, account and timesheet/project. Representations:
 * 1. Presentation string `[<account>/]<name>[@<gateway>]`,
 *   see {@link toString} and {@link fromString}.
 * 2. Configuration/persistence path array
 *   see {@link toPath} and {@link fromPath}.
 * 3. m-ld domain name `<name>.<account>.<gateway>`
 *   see {@link fromDomain}.
 */

export default class AccountOwnedId {
  /**
   * @param {string} str
   * @returns {AccountOwnedId}
   */
  static fromString(str) {
    const [orgTs, gateway] = str.split('@');
    const [account, name] = orgTs.split('/');
    if (name != null) // account included
      return new AccountOwnedId({ account, name, gateway });
    else // No account included
      return new AccountOwnedId({ name: account, gateway });
  }

  /**
   * @param {string[]} dir
   */
  static fromPath(dir) {
    const [name, account, ...gateway] = [...dir].reverse();
    return new AccountOwnedId({
      account, name, gateway: gateway.join('.')
    });
  }

  /**
   * @param {string} domain
   */
  static fromDomain(domain) {
    return AccountOwnedId.fromPath(domain.split('.').reverse());
  }

  /**
   * @param {string | URL} iri
   * @param {string} [gateway]
   */
  static fromIri(iri, gateway) {
    if (typeof iri == 'string') {
      if (!gateway && !iri.includes('//')) {
        const [account, name] = iri.split('/');
        return new AccountOwnedId({ account, name });
      }
      iri = new URL(domainRelativeIri(iri, gateway));
    }
    gateway = iri.hostname;
    const [, account, name] = iri.pathname.split('/');
    return new AccountOwnedId({ gateway, account, name });
  }

  /**
   * @param {object} ref
   * @param {string} [gateway]
   * @returns {AccountOwnedId}
   */
  static fromReference(ref, gateway) {
    return this.fromIri(ref['@id'], gateway);
  }

  /**
   * @param {string} name
   * @param {string} [account]
   * @param {string} [gateway] dot-separated gateway "domain name"
   */
  constructor({ gateway, account, name }) {
    this.gateway = gateway;
    this.account = account;
    this.name = name;
  }

  get isRelative() {
    return typeof this.gateway != 'string';
  }

  get isValid() {
    return (this.isRelative || this.gateway.split('.').every(AccountOwnedId.isComponentId))
      && AccountOwnedId.isComponentId(this.account) && AccountOwnedId.isComponentId(this.name);
  }

  /** Validates this Id */
  validate() {
    // Gateway is allowed to be undefined or false
    if (!this.isRelative)
      this.gateway.split('.').forEach(AccountOwnedId.checkComponentId);
    AccountOwnedId.checkComponentId(this.account);
    AccountOwnedId.checkComponentId(this.name);
    return this;
  }

  static checkComponentId(id) {
    if (!AccountOwnedId.isComponentId(id))
      throw `${id} should contain only lowercase letters, digits & dashes`;
  }

  static isComponentId(id) {
    return id != null && /^[a-z0-9_-]+$/.test(id);
  }

  /**
   * @returns {string[]} relative directory path suitable for persistence
   */
  toPath() {
    return [
      ...this.gateway.split('.').reverse(),
      this.account,
      this.name
    ];
  }

  toDomain() {
    return `${this.name}.${this.account}.${this.gateway}`;
  }

  toIri() {
    const path = this.toRelativeIri();
    return this.isRelative ? path : `http://${this.gateway}/${path}`;
  }

  toRelativeIri() {
    return `${this.account}/${this.name}`;
  }

  toReference() {
    return { '@id': this.toIri() };
  }

  toString() {
    let rtn = this.account ? `${this.account}/` : '';
    rtn += this.name;
    rtn += this.gateway ? `@${this.gateway}` : '';
    return rtn;
  }
}