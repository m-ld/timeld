/**
 * @param {import('timeld-common').AccountOwnedId} tsId
 * @returns {Subject}
 */
export const accountHasTimesheet = tsId => ({
  '@id': tsId.account, timesheet: { '@id': tsId.toIri(), '@type': 'Timesheet' }
});

/**
 * @param {string} user
 * @param {string} account
 * @returns {Subject}
 */
export const userIsAdmin = (user, account) => ({
  '@id': account, 'vf:primaryAccountable': { '@id': user }
});

/**
 *
 * @param {string} ts
 * @param {string} project
 * @returns {Subject}
 */
export const timesheetHasProject = (ts, project) => ({
  '@id': ts, '@type': 'Timesheet', project: { '@id': project }
});