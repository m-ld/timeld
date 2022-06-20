/**
 * Combination of gateway, account and timesheet/project. Representations:
 * 1. Presentation string `[<account>/]<name>[@<gateway>]`,
 *   see {@link toString} and {@link fromString}.
 * 2. Configuration/persistence path array
 *   see {@link toPath} and {@link fromPath}.
 * 3. m-ld domain name `<name>.<account>.<gateway>`
 *   see {@link fromDomain}.
 */
export default class AccountSubId {
  /**
   * @param {string} str
   * @returns {AccountSubId}
   */
  static fromString(str) {
    const [orgTs, gateway] = str.split('@');
    const [account, name] = orgTs.split('/');
    if (name != null) // account included
      return new AccountSubId({ account, name, gateway });
    else // No account included
      return new AccountSubId({ name: account, gateway });
  }

  /**
   * @param {string[]} dir
   */
  static fromPath(dir) {
    const [name, account, ...gateway] = [...dir].reverse();
    return new AccountSubId({
      account, name, gateway: gateway.join('.')
    });
  }

  /**
   * @param {string} domain
   */
  static fromDomain(domain) {
    return AccountSubId.fromPath(domain.split('.').reverse());
  }

  /**
   * @param {string | URL} url
   * @param {string} [gateway]
   */
  static fromUrl(url, gateway) {
    if (typeof url == 'string')
      url = new URL(url, `http://${gateway}`);
    gateway = url.hostname;
    const [, account, name] = url.pathname.split('/');
    return new AccountSubId({ gateway, account, name });
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

  /** Validates this Id */
  validate() {
    // Gateway is allowed to be undefined or false
    if (typeof this.gateway == 'string')
      this.gateway.split('.').forEach(AccountSubId.checkComponentId);
    AccountSubId.checkComponentId(this.account);
    AccountSubId.checkComponentId(this.name);
    return this;
  }

  static checkComponentId(id) {
    if (!AccountSubId.isComponentId(id))
      throw `${id} should contain only alphanumerics & dashes`;
  }

  static isComponentId(id) {
    return id != null && !!id.match(/[\w-]+/g);
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

  toUrl() {
    return `http://${this.gateway}/${this.account}/${this.name}`;
  }

  toString() {
    let rtn = this.account ? `${this.account}/` : '';
    rtn += this.name;
    rtn += this.gateway ? `@${this.gateway}` : '';
    return rtn;
  }
}