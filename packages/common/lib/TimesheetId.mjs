/**
 * Combination of gateway, account and timesheet. Representations:
 * 1. Presentation string `[<account>/]<timesheet>[@<gateway>]`,
 *   see {@link toString} and {@link fromString}.
 * 2. Configuration/persistence path array
 *   see {@link toPath} and {@link fromPath}.
 * 3. m-ld domain name `<timesheet>.<account>.<gateway>`
 *   see {@link fromDomain}.
 */
export default class TimesheetId {
  /**
   * @param {string} str
   * @returns {TimesheetId}
   */
  static fromString(str) {
    const [orgTs, gateway] = str.split('@');
    const [account, timesheet] = orgTs.split('/');
    if (timesheet != null) // account included
      return new TimesheetId({ account, timesheet, gateway });
    else // No account included
      return new TimesheetId({ timesheet: account, gateway });
  }

  /**
   * @param {string[]} dir
   */
  static fromPath(dir) {
    const [timesheet, account, ...gateway] = [...dir].reverse();
    return new TimesheetId({
      account,
      timesheet,
      gateway: gateway.join('.')
    });
  }

  /**
   * @param {string} domain
   */
  static fromDomain(domain) {
    return TimesheetId.fromPath(domain.split('.').reverse());
  }

  /**
   * @param {string} timesheet
   * @param {string} [account]
   * @param {string} [gateway] dot-separated gateway "domain name"
   */
  constructor({ gateway, account, timesheet }) {
    this.gateway = gateway;
    this.account = account;
    this.timesheet = timesheet;
  }

  /** Validates this timesheet Id */
  validate() {
    function checkId(id) {
      if (!id.match(/[\w-]+/g))
        throw `${id} should contain only alphanumerics & dashes`;
    }
    // Gateway is allowed to be undefined or false
    if (typeof this.gateway == 'string')
      this.gateway.split('.').forEach(checkId);
    checkId(this.account);
    checkId(this.timesheet);
  }

  /**
   * @returns {string[]} relative directory path suitable for persistence
   */
  toPath() {
    return [
      ...this.gateway.split('.').reverse(),
      this.account,
      this.timesheet
    ];
  }

  toDomain() {
    return `${this.timesheet}.${this.account}.${this.gateway}`;
  }

  toUrl() {
    return `https://${this.gateway}/${this.account}/${this.timesheet}`;
  }

  toString() {
    let rtn = this.account ? `${this.account}/` : '';
    rtn += this.timesheet;
    rtn += this.gateway ? `@${this.gateway}` : '';
    return rtn;
  }
}