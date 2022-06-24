/**
 * @typedef {import('@m-ld/m-ld').Query['@where']} Where
 */

/**
 * @param {import('timeld-common').AccountOwnedId} tsId
 * @returns {Where}
 */
export const accountHasTimesheet = tsId => ({
  '@id': tsId.account, timesheet: { '@id': tsId.toIri(), '@type': 'Timesheet' }
});

/**
 * @param {string} user
 * @param {string} account
 * @returns {Where}
 */
export const userIsAdmin = (user, account) => ({
  '@id': account, 'vf:primaryAccountable': user
});

/**
 * TODO: Use `ask` in m-ld-js v0.9
 */
export class Ask {
  /**
   * @param {import('@m-ld/m-ld').MeldReadState} state
   */
  constructor(state) {
    this.state = state;
  }

  /**
   * @param {Where} where
   * @returns {Promise<boolean>}
   */
  async exists(where) {
    return !!(await this.state.read({
      '@select': '?', '@where': where
    })).length;
  }
}