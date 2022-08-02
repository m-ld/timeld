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
  '@id': account, 'vf:primaryAccountable': { '@id': user }
});

/**
 *
 * @param {string} ts
 * @param {string} project
 * @returns {Where}
 */
export const timesheetHasProject = (ts, project) => ({
  '@id': ts, '@type': 'Timesheet', project: { '@id': project }
});