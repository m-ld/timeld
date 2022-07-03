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
    // Check we are joining either projects or timesheets
    const hasOwnedTimesheetJoin = query =>
      query['@where'][0].project?.['@id'] === query['@where'][1].project['@id'] ||
      query['@where'][0].timesheet?.['@id'] === query['@where'][1]['@id'];
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
      // Read timesheet details from user account
      new class extends ReadPattern {
        matches(query) {
          return super.matches(query) && hasOwnedTimesheetJoin(query);
        }
      }({
        ...this.isThisAccount,
        optionalProperties: {
          project: isReference,
          timesheet: isReference
        }
      }, timesheetProperty),
      // Read details of an organisation account the user is admin of
      new class extends ReadPattern {
        matches(query) {
          return super.matches(query) && isCheckingAdmin(query['@where']);
        }
      }({
        ...this.accountIsAdmin,
        optionalProperties: {
          project: isVariable,
          timesheet: isVariable
        }
      }),
      // Read timesheet details from organisation account the user is admin of
      new class extends ReadPattern {
        matches(query) {
          return super.matches(query) &&
            isCheckingAdmin(query['@where']) &&
            hasOwnedTimesheetJoin(query);
        }
      }({
        ...this.accountIsAdmin,
        optionalProperties: {
          project: isReference,
          timesheet: isReference
        }
      }, timesheetProperty)
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
    return this.patterns.find(qp => qp.matches(query))
  }
}