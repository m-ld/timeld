import { array } from '@m-ld/m-ld';
import { AccountOwnedId, isDomainEntity, isReference } from 'timeld-common';
import { isVariable, QueryPattern, ReadPattern } from './QueryPattern.mjs';
import { EmptyError, firstValueFrom } from 'rxjs';
import { ConflictError, ForbiddenError, NotFoundError } from '../rest/errors.mjs';

/**
 * Side effects that are triggered before writing to the gateway domain
 * @interface BeforeWriteTriggers
 */

/**
 * @function
 * @name BeforeWriteTriggers#beforeInsertTimesheet
 * @param {MeldReadState} state
 * @param {Reference} tsRef
 * @returns Promise<*>
 */

/**
 * @function
 * @name BeforeWriteTriggers#beforeDeleteAdmin
 * @param {MeldReadState} state
 * @param {Reference} org
 * @param {Reference} admin
 * @returns Promise<*>
 */

/**
 * @function
 * @name BeforeWriteTriggers#beforeInsertConnector
 * @param {MeldReadState} state
 * @param {GraphSubject} src
 * @returns Promise<Subject>
 */

export default class WritePatterns {
  /**
   * @param {string} accountName
   * @param {BeforeWriteTriggers} triggers
   */
  constructor(accountName, triggers) {
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
    const whereOwned = {
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

    class InsertConnectorPattern extends QueryPattern {
      constructor(whereAccount) {
        super({
          properties: {
            '@insert': {
              properties: {
                '@type': { enum: ['Connector'] },
                module: { type: 'string' },
                appliesTo: isReference
              },
              optionalProperties: { config: { type: 'string' } }
            },
            // TODO: Support projects
            '@where': whereAccount({ timesheet: isReference })
          }
        });
      }
      matchesApplies(query, key) {
        return query['@where'][key] &&
          query['@insert'].appliesTo['@id'] === query['@where'][key]['@id'];
      }
      matches(query) {
        return super.matches(query) &&
          (this.matchesApplies(query, 'timesheet') ||
            this.matchesApplies(query, 'project'));
      }
      async check(state, query) {
        const matching = { ...query['@insert'] }; // @type, module, appliesTo
        delete matching.config;
        if (await state.ask({ '@where': matching }))
          throw new ConflictError('Connector already exists');
        query['@insert'] = await triggers.beforeInsertConnector(state, query['@insert']);
        return super.check(state, query);
      }
    }

    class DeleteConnectorPattern extends QueryPattern {
      constructor(whereAccount) {
        super({
          properties: {
            '@delete': {
              properties: {
                '@id': isVariable,
                appliesTo: isReference
              }
            },
            '@where': {} // See wherePattern
          }
        });
        this.wherePattern = new ReadPattern({
          properties: {
            '@id': isVariable,
            '@type': { enum: ['Connector'] },
            module: { type: 'string' }
          }
        }, whereAccount({ timesheet: isReference }));
      }
      matchesApplies(query, key) {
        return query['@where'][1][key] &&
          query['@delete'].appliesTo['@id'] === query['@where'][1][key]['@id'];
      }
      matches(query) {
        return super.matches(query) &&
          this.wherePattern.matches(query) &&
          (this.matchesApplies(query, 'timesheet') ||
            this.matchesApplies(query, 'project'));
      }
    }

    // noinspection JSValidateTypes
    /** @type {QueryPattern[]} */
    this.patterns = [
      // Add details to user account
      new class extends QueryPattern {
        matches(query) {
          return super.matches(query) && isValidAccountDetail(query['@insert']);
        }
        async check(state, query) {
          await triggers.beforeInsertTimesheet(state, query['@insert'].timesheet);
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
          '@where': { ...isThisAccount(), ...whereOwned }
        }
      }),
      // Write new organisation account (with this account as admin)
      new class extends QueryPattern {
        async check(state, query) {
          // Organisation must not already exist
          if (await state.ask({ '@where': { '@id': query['@id'] } }))
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
          await triggers.beforeInsertTimesheet(state, query['@insert'].timesheet);
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
          if (await state.ask({ '@where': query['@where'] })) {
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
              const org = query['@delete'], admin = org['vf:primaryAccountable'];
              if (admin) {
                if (admin['@id'] === accountName)
                  throw new ForbiddenError('Cannot remove yourself as an admin');
                // Removing an admin must remove all timesheet principals
                await triggers.beforeDeleteAdmin(state, org, admin);
              }
              return query;
            }
          } else {
            throw new ForbiddenError();
          }
        }
      }({
        properties: {
          '@delete': orgDetail('@delete'),
          '@where': { ...thisAccountIsAdmin(), ...whereOwned }
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
            if (!(await state.ask({ '@where': { '@id': insert['@id'] } })))
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
      }))),
      new InsertConnectorPattern(isThisAccount),
      new InsertConnectorPattern(thisAccountIsAdmin),
      new DeleteConnectorPattern(isThisAccount),
      new DeleteConnectorPattern(thisAccountIsAdmin)
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