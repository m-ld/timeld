import { array } from '@m-ld/m-ld';
import { AccountOwnedId, isDomainEntity, isReference } from 'timeld-common';
import { QueryPattern } from './QueryPattern.mjs';
import { EmptyError, firstValueFrom } from 'rxjs';
import { ForbiddenError, NotFoundError } from '../rest/errors.mjs';

/**
 * @typedef {import('@m-ld/m-ld').Reference} Reference
 */

export default class WritePatterns {
  /**
   * @param {string} accountName
   * @param {(state: MeldReadState, tsRef: Reference) => Promise<void>} onInsertTimesheet
   */
  constructor(accountName, onInsertTimesheet) {
    const isThisAccountRef = { properties: { '@id': { enum: [accountName] } } };
    /** @param {object} [properties] */
    const isThisAccount = properties => ({
      properties: {
        '@id': { enum: [accountName] },
        '@type': { enum: ['Account'] },
        ...properties
      }
    });
    /**
     * @param {'Timesheet'|'Project'} type
     * @param {'@insert'|'@delete'} verb
     */
    const isOwned = (type, verb) => ({
      ...isDomainEntity.mapping[type],
      additionalProperties: verb === '@delete' // ?p ?o
    });
    const matchOwned = {
      properties: { '@id': { type: 'string' } },
      additionalProperties: true // ?p ?o
    };
    const whereDeleteOwned = {
      optionalProperties: { timesheet: matchOwned, project: matchOwned }
    };
    const deletesOwnedProperties = query => {
      const deleteMatchesWhere = owned => !query['@where'][owned] ||
        Object.entries(query['@where'][owned]).every(([p, v]) =>
          query['@delete'][owned]?.[p] === v);
      return deleteMatchesWhere('timesheet') &&
        deleteMatchesWhere('project');
    };
    const thisAccountDetail = verb => ({
      ...isThisAccountRef,
      optionalProperties: {
        email: { type: 'string' },
        timesheet: isOwned('Timesheet', verb),
        project: isOwned('Project', verb)
      }
    });
    /** @param {object} [properties] */
    const thisAccountIsAdmin = properties => ({
      properties: {
        '@id': { type: 'string' },
        '@type': { enum: ['Account'] },
        'vf:primaryAccountable': isThisAccountRef,
        ...properties
      }
    });
    const orgDetail = verb => ({
      properties: { '@id': { type: 'string' } },
      optionalProperties: {
        'vf:primaryAccountable': isReference,
        timesheet: isOwned('Timesheet', verb),
        project: isOwned('Project', verb)
      }
    });
    const isValidAccountDetail = src => {
      return (!src.timesheet ||
          src['@id'] === AccountOwnedId.fromReference(src.timesheet).account) &&
        (!src.project ||
          src['@id'] === AccountOwnedId.fromReference(src.project).account);
    };
    // Either insert or delete (not both)
    const updatedId = query => query['@delete']?.['@id'] || query['@insert']?.['@id'];
    // Close loophole in schema: different IDs for update and where
    const isModifyOrgDetail = query =>
      updatedId(query) === query['@where']['@id'];
    const timesheetDetail = {
      properties: { '@id': { type: 'string' }, project: isReference }
    };
    // noinspection JSValidateTypes
    /** @type {QueryPattern[]} */
    this.patterns = [
      // Add details to user account
      new class extends QueryPattern {
        matches(query) {
          return super.matches(query) && isValidAccountDetail(query['@insert']);
        }
        async check(state, query) {
          await onInsertTimesheet(state, query['@insert'].timesheet);
          return query;
        }
      }({
        properties: {
          '@insert': thisAccountDetail('@insert'),
          '@where': isThisAccount()
        }
      }),
      // Remove details from user account
      new class extends QueryPattern {
        matches(query) {
          // Check timesheet delete includes linked projects
          return super.matches(query) && deletesOwnedProperties(query);
        }
      }({
        properties: {
          '@delete': thisAccountDetail('@delete'),
          '@where': { ...isThisAccount(), ...whereDeleteOwned }
        }
      }),
      // Write new organisation account (with this account as admin)
      new class extends QueryPattern {
        async check(state, query) {
          // Organisation must not already exist
          // TODO: Use ask in m-ld-js@edge
          if ((await state.get(query['@id'])) != null)
            throw new ForbiddenError('Organisation already exists');
          return query;
        }
      }(thisAccountIsAdmin()),
      // Add details to an organisation
      new class extends QueryPattern {
        matches(query) {
          return super.matches(query) &&
            isModifyOrgDetail(query) &&
            isValidAccountDetail(query['@insert']);
        }
        async check(state, query) {
          await onInsertTimesheet(state, query['@insert'].timesheet);
          return query;
        }
      }({
        properties: { '@insert': orgDetail('@insert'), '@where': thisAccountIsAdmin() }
      }),
      // Remove organisation or its details
      new class extends QueryPattern {
        matches(query) {
          return super.matches(query) &&
            isModifyOrgDetail(query) &&
            deletesOwnedProperties(query);
        }
        async check(state, query) {
          if (Object.keys(query['@delete']).length === 1) {
            const orgId = query['@delete']['@id'];
            // The whole org is being deleted. Cascade delete the organisation
            // timesheets and projects
            // TODO: Can this be done nicely without a query?
            try {
              const org = await firstValueFrom(state.read({
                '@describe': orgId, '@where': query['@where']
              }));
              // noinspection JSValidateTypes
              return {
                '@delete': [
                  { '@id': orgId },
                  ...array(org['name']),
                  ...array(org['project'])
                ]
              };
            } catch (e) {
              if (e instanceof EmptyError)
                throw new NotFoundError(`${orgId} not found`);
              throw e;
            }
          } else {
            if (query['@delete']['vf:primaryAccountable']?.['@id'] === accountName)
              throw new ForbiddenError('Cannot remove yourself as an admin');
            return query;
          }
        }
      }({
        properties: {
          '@delete': orgDetail('@delete'),
          '@where': { ...thisAccountIsAdmin(), ...whereDeleteOwned }
        }
      }),
      // Add project to user or organisation owned timesheet
      new class extends QueryPattern {
        matches(query) {
          return super.matches(query) &&
            updatedId(query) === query['@where']['timesheet']['@id'];
        }
        async check(state, query) {
          const insert = query['@insert'];
          if (insert != null && insert.project != null) {
            // TODO Use ask in m-ld-js@edge
            const ts = await state.get(insert['@id'], '@type');
            if (ts == null)
              throw new NotFoundError('Timesheet does not exist');
            const project = await state.get(insert.project['@id'], '@type');
            if (project == null)
              throw new NotFoundError('Project does not exist');
          }
          return query;
        }
      }(...['@insert', '@delete'].map(verb => ({
        properties: {
          [verb]: timesheetDetail,
          '@where': isThisAccount({ timesheet: isReference })
        }
      })), ...['@insert', '@delete'].map(verb => ({
        properties: {
          [verb]: timesheetDetail,
          '@where': thisAccountIsAdmin({ timesheet: isReference })
        }
      })))
    ];
  }

  /**
   * @param {Query} query
   * @returns {QueryPattern}
   */
  matchPattern(query) {
    return this.patterns.find(qp => qp.matches(query));
  }
}