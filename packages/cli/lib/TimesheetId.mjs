/**
 * Combination of gateway, organisation and timesheet. Representations:
 * 1. Presentation string `[<organisation>/]<timesheet>[@<gateway>]`,
 *   see {@link toString} and {@link fromString}.
 * 2. Configuration/persistence path array
 *   see {@link toPath} and {@link fromPath}.
 * 3. m-ld domain name `<timesheet>.<organisation>.<gateway>`
 *   see {@link fromDomain}.
 */
export class TimesheetId {
  /**
   * @param {string} str
   * @returns {TimesheetId}
   */
  static fromString(str) {
    const [orgTs, gateway] = str.split('@');
    const [organisation, timesheet] = orgTs.split('/');
    if (timesheet != null) // Organisation included
      return new TimesheetId({ organisation, timesheet, gateway });
    else // No organisation included
      return new TimesheetId({ timesheet: organisation, gateway });
  }

  /**
   * @param {string[]} dir
   */
  static fromPath(dir) {
    const [timesheet, organisation, ...gateway] = [...dir].reverse();
    return new TimesheetId({
      organisation,
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
   * @param {string} [organisation]
   * @param {string} [gateway] dot-separated gateway "domain name"
   */
  constructor({ gateway, organisation, timesheet }) {
    this.gateway = gateway;
    this.organisation = organisation;
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
    checkId(this.organisation);
    checkId(this.timesheet);
  }

  /**
   * @returns {string[]} relative directory path suitable for persistence
   */
  toPath() {
    return [
      ...this.gateway.split('.').reverse(),
      this.organisation,
      this.timesheet
    ];
  }

  toString() {
    let rtn = this.organisation ? `${this.organisation}/` : '';
    rtn += this.timesheet;
    rtn += this.gateway ? `@${this.gateway}` : '';
    return rtn;
  }
}