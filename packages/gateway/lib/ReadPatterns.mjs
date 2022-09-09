import { array } from '@m-ld/m-ld';
import { isReference } from 'timeld-common';
import { isVariable, ReadPattern } from './QueryPattern.mjs';

export default class ReadPatterns {
  /**
   * @param {string} accountName
   */
  constructor(accountName) {
    this.accountName = accountName;
    const isCheckingAdmin = where =>
      // where is an array when reading timesheet details
      array(array(where)[0]['vf:primaryAccountable'])
        .some(admin => admin['@id'] === this.accountName);
    const timesheetProperty = {
      properties: {
        '@id': { type: 'string' },
        '@type': { enum: ['Timesheet'] },
        project: isReference
      }
    };
    /** @param {Schema} schema */
    const projectOrTimesheet = schema => ({
      optionalProperties: {
        project: schema,
        timesheet: schema
      }
    });
    // Check we are joining either projects or timesheets
    const hasOwnedTimesheetJoin = query => {
      const [filter, check] = query['@where'];
      return (filter.appliesTo && (
          (check.project && filter.appliesTo['@id'] === check.project['@id']) ||
          (check.timesheet && filter.appliesTo['@id'] === check.timesheet['@id']))) ||
        (check.project && filter.project?.['@id'] === check.project['@id']) ||
        filter.timesheet?.['@id'] === check['@id'];
    };
    /** @type {QueryPattern[]} */
    this.patterns = [
      // Read property details from user account
      new ReadPattern({
        ...this.isThisAccount,
        optionalProperties: {
          email: isVariable,
          project: isVariable,
          timesheet: isVariable
        }
      }),
      // Read property details of an organisation account the user is admin of
      new class extends ReadPattern {
        matches(query) {
          return super.matches(query) && isCheckingAdmin(query['@where']);
        }
      }({
        ...this.accountIsAdmin,
        ...projectOrTimesheet(isVariable)
      }),
      // Read timesheet details from user account
      new class extends ReadPattern {
        matches(query) {
          return super.matches(query) && hasOwnedTimesheetJoin(query);
        }
      }({
        ...this.isThisAccount,
        ...projectOrTimesheet(isReference)
      }, timesheetProperty),
      // Read timesheet details from organisation account the user is admin of
      new class extends ReadPattern {
        matches(query) {
          return super.matches(query) &&
            isCheckingAdmin(query['@where']) &&
            hasOwnedTimesheetJoin(query);
        }
      }({
        ...this.accountIsAdmin,
        ...projectOrTimesheet(isReference)
      }, timesheetProperty),
      // Read timesheet or project connectors from user account
      new class extends ReadPattern {
        matches(query) {
          return super.matches(query) && hasOwnedTimesheetJoin(query);
        }
      }({
        properties: {
          '@type': { enum: ['Connector'] },
          appliesTo: isReference
        },
        additionalProperties: true
      }, {
        ...this.isThisAccount,
        ...projectOrTimesheet(isReference)
      }),
      // Read timesheet or project connectors from account the user is admin of
      new class extends ReadPattern {
        matches(query) {
          return super.matches(query) &&
            isCheckingAdmin(query['@where'][1]) &&
            hasOwnedTimesheetJoin(query);
        }
      }({
        properties: {
          '@type': { enum: ['Connector'] },
          appliesTo: isReference
        },
        additionalProperties: true
      }, {
        ...this.accountIsAdmin,
        ...projectOrTimesheet(isReference)
      })
    ];
  }

  get accountIsAdmin() {
    return {
      properties: {
        '@id': { type: 'string' },
        '@type': { enum: ['Account'] },
        // Primary accountable must be included for admin filter (see below)
        'vf:primaryAccountable': {}
      }
    };
  }

  get isThisAccount() {
    return {
      properties: {
        '@id': { enum: [this.accountName] },
        '@type': { enum: ['Account'] }
      }
    };
  }

  /**
   * @param {Query} query
   * @returns {QueryPattern}
   */
  matchPattern(query) {
    return this.patterns.find(qp => qp.matches(query));
  }
}