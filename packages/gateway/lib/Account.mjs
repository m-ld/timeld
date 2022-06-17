import { array, propertyValue } from '@m-ld/m-ld';
import { AblyKey } from 'timeld-common';
import errors from 'restify-errors';
import { QueryPattern, ReadPattern } from './QueryPattern.mjs';
import { EmptyError, firstValueFrom } from 'rxjs';
import { safeRefsIn, verify } from './util.mjs';

/**
 * Javascript representation of an Account subject in the Gateway domain.
 * Instances are ephemeral, instantiated dynamically on demand.
 */
export default class Account {
  /**
   * @param {Gateway} gateway
   * @param {import('@m-ld/m-ld').GraphSubject} src
   */
  static fromJSON(gateway, src) {
    // noinspection JSCheckFunctionSignatures
    return new Account(gateway, {
      name: src['@id'],
      emails: propertyValue(src, 'email', Set, String),
      keyids: propertyValue(src, 'keyid', Set, String),
      admins: safeRefsIn(src, 'vf:primaryAccountable').map(ref => ref['@id']),
      timesheets: safeRefsIn(src, 'timesheet')
    });
  }

  /**
   * @param {Gateway} gateway
   * @param {string} name plain account name
   * @param {Iterable<string>} emails verifiable account identities
   * @param {Iterable<string>} keyids per-device keys
   * @param {Iterable<string>} admins admin (primary accountable) IRIs
   * @param {import('@m-ld/m-ld').Reference[]} timesheets timesheet Id Refs
   */
  constructor(gateway, {
    name,
    emails = [],
    keyids = [],
    admins = [],
    timesheets = []
  }) {
    this.gateway = gateway;
    this.name = name;
    this.emails = new Set([...emails ?? []]);
    this.keyids = new Set([...keyids ?? []]);
    this.admins = new Set([...admins ?? []]);
    this.timesheets = timesheets ?? [];
  }

  /**
   * Activation of a gateway account requires an initial timesheet.
   * This is because Ably cannot create a key without at least one capability.
   *
   * @param {string} email
   * @returns {Promise<string>} Ably key for the account
   */
  async activate(email) {
    // Every activation creates a new Ably key (assumes new device)
    const keyDetails = await this.gateway.ablyApi.createAppKey({
      name: `${this.name}@${this.gateway.domainName}`,
      capability: this.keyCapability()
    });
    // Store the keyid and the email
    this.keyids.add(keyDetails.id);
    this.emails.add(email);
    await this.gateway.domain.write(this.toJSON());
    return keyDetails.key;
  }
  /**
   * Verifies the given JWT for this account.
   *
   * @param {string} jwt a JWT containing a keyid associated with this Account
   * @param {AccountSubId} [tsId] a timesheet for which access is requested
   * @returns {Promise<import('jsonwebtoken').JwtPayload>}
   */
  async verify(jwt, tsId) {
    // Verify the JWT against its declared keyid
    const payload = await verify(jwt, async header => {
      // TODO: Check for write access to the timesheet
      if (!this.keyids.has(header.kid))
        throw new Error(`Key ${header.kid} does not belong to account ${this.name}`);
      // Update the capability of the key to include the timesheet.
      // This also serves as a check that the key exists.
      // TODO: Include access via organisations
      const authorisedTsIds = [...this.tsIds()].concat(tsId ?? []);
      const keyDetail = await this.gateway.ablyApi.updateAppKey(header.kid, {
        capability: this.keyCapability(...authorisedTsIds)
      });
      return new AblyKey(keyDetail.key).secret;
    });
    if (payload.sub !== this.name)
      throw new errors.UnauthorizedError('JWT does not correspond to user');
    return payload;
  }

  get allowedReadPatterns() {
    const accountName = this.name;
    const isVariable = { type: 'string' };
    return [
      // Read property details from user account
      new ReadPattern({
        properties: {
          '@id': { enum: [accountName] },
          '@type': { enum: ['Account'] }
        },
        optionalProperties: {
          email: isVariable,
          project: isVariable,
          timesheet: isVariable
        }
      }),
      // Read details of an organisations the user is admin of
      new class extends ReadPattern {
        async check(state, query) {
          // JSON Type Definition only tells us it's an array
          if (array(query['@where']['vf:primaryAccountable'])
            .find(admin => admin['@id'] === accountName) == null)
            throw new errors.ForbiddenError('Read must check org admin');
          return query;
        }
      }({
        properties: {
          '@id': { type: 'string' },
          '@type': { enum: ['Account'] },
          // Primary accountable must be included for admin filter (above)
          'vf:primaryAccountable': {}
        },
        optionalProperties: {
          'vf:primaryAccountable': { type: 'string' }, // Variable
          project: isVariable,
          timesheet: isVariable
        }
      })
    ];
  }

  /**
   * @param {import('@m-ld/m-ld').Read} query
   * @returns {Promise<Results>} results
   */
  async read(query) {
    // Check that the given pattern matches a permitted query
    const matchingPattern = this.allowedReadPatterns.find(qp => qp.matches(query));
    if (matchingPattern == null)
      throw new errors.ForbiddenError('Unrecognised read pattern');
    return new Promise((resolve, reject) => {
      this.gateway.domain.read(async state => {
        try {
          // noinspection JSCheckFunctionSignatures
          resolve(state.read(await matchingPattern.check(state, query)).consume);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  get allowedWritePatterns() {
    const { name: thisAccountName, interceptInsertTimesheet } = this;
    const isThisAccountRef = { properties: { '@id': { enum: [thisAccountName] } } };
    const isThisAccount = {
      properties: {
        '@id': { enum: [thisAccountName] },
        '@type': { enum: ['Account'] }
      }
    };
    const isReference = { properties: { '@id': { type: 'string' } } };
    const thisAccountDetail = {
      ...isThisAccountRef,
      optionalProperties: {
        email: { type: 'string' },
        timesheet: isReference,
        project: isReference
      }
    };
    const thisAccountIsAdmin = {
      properties: {
        '@id': { type: 'string' },
        '@type': { enum: ['Account'] },
        'vf:primaryAccountable': isThisAccountRef
      }
    };
    const orgDetail = {
      properties: { '@id': { type: 'string' } },
      optionalProperties: {
        'vf:primaryAccountable': isReference,
        timesheet: isReference,
        project: isReference
      }
    };

    class ModifyOrgPattern extends QueryPattern {
      async check(state, query) {
        // Either insert or delete (not both)
        const orgId = query['@delete']?.['@id'] || query['@insert']?.['@id'];
        // Close loophole in schema, different IDs
        if (orgId !== query['@where']['@id'])
          throw new errors.ForbiddenError('Malformed query');
        return query;
      }
    }

    return [
      // Add details to user account
      new class extends QueryPattern {
        async check(state, query) {
          await interceptInsertTimesheet(state, query);
          return query;
        }
      }({
        properties: {
          '@insert': thisAccountDetail,
          '@where': isThisAccount
        }
      }),
      // Remove details from user account
      new QueryPattern({
        properties: {
          '@delete': thisAccountDetail,
          '@where': isThisAccount
        }
      }),
      // Write new organisation account (with this account as admin)
      new class extends QueryPattern {
        async check(state, query) {
          // Organisation must not already exist
          // TODO: Use ask in m-ld-js@edge
          if ((await state.get(query['@id'])) != null)
            throw new errors.ForbiddenError('Organisation already exists');
          return query;
        }
      }(thisAccountIsAdmin),
      // Add details to an organisation
      new class extends ModifyOrgPattern {
        async check(state, query) {
          await interceptInsertTimesheet(state, query);
          return query;
        }
      }({
        properties: { '@insert': orgDetail, '@where': thisAccountIsAdmin }
      }),
      // Remove organisation or its details
      new class extends ModifyOrgPattern {
        async check(state, query) {
          await super.check(state, query);
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
                throw new errors.NotFoundError(`${orgId} not found`);
              throw e;
            }
          } else {
            if (query['@delete']['vf:primaryAccountable']?.['@id'] === thisAccountName)
              throw new errors.ForbiddenError('Cannot remove yourself as an admin');
            return query;
          }
        }
      }({
        properties: { '@delete': orgDetail, '@where': thisAccountIsAdmin }
      })
    ];
  }

  /**
   * @param {import('@m-ld/m-ld').MeldReadState}state the current domain state
   * @param {Query} query the query to check
   * @returns {Promise<void>}
   */
  interceptInsertTimesheet = async (state, query) => {
    const tsRef = query['@insert']['timesheet'];
    if (tsRef != null) {
      const tsId = this.gateway.tsRefAsId(tsRef);
      if (tsId.account !== query['@insert']['@id'])
        throw new errors.BadRequestError('Timesheet does not match account');
      await this.gateway.initTimesheet(tsId, state);
    }
  };

  /**
   * @param {import('@m-ld/m-ld').Query} query
   */
  async write(query) {
    const matchingPattern = this.allowedWritePatterns.find(qp => qp.matches(query));
    if (matchingPattern == null)
      throw new errors.ForbiddenError('Unrecognised write pattern');
    await this.gateway.domain.write(async state => {
      await state.write(await matchingPattern.check(state, query));
    });
  }

  /**
   * @returns the Timesheet IDs provided by this account
   */
  *tsIds() {
    for (let tsRef of this.timesheets)
      yield this.gateway.tsRefAsId(tsRef);
  }

  /**
   * @param {AccountSubId} tsIds
   * @returns {object}
   */
  keyCapability(...tsIds) {
    return Object.assign({
      // Ably keys must have a capability. Assign a notification channels as a minimum.
      [`${this.gateway.domainName}:notify`]: ['subscribe']
    }, ...tsIds.map(tsId => ({
      [`${tsId.toDomain()}:*`]: ['publish', 'subscribe', 'presence']
    })));
  }

  toJSON() {
    return {
      '@id': this.name, // scoped to gateway domain
      '@type': 'Account',
      'email': [...this.emails],
      'keyid': [...this.keyids],
      'vf:primaryAccountable': [...this.admins].map(iri => ({ '@id': iri })),
      'timesheet': this.timesheets
    };
  }
}