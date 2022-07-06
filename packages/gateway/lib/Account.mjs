import { propertyValue } from '@m-ld/m-ld';
import { AccountOwnedId, isDomainEntity, Session } from 'timeld-common';
import { idSet, safeRefsIn } from 'timeld-common/lib/util.mjs';
import { accountHasTimesheet, Ask, timesheetHasProject, userIsAdmin } from './statements.mjs';
import ReadPatterns from './ReadPatterns.mjs';
import WritePatterns from './WritePatterns.mjs';
import { each } from 'rx-flowable';
import { validate } from 'jtd';
import {
  BadRequestError, ConflictError, ForbiddenError, toHttpError, UnauthorizedError
} from '../rest/errors.mjs';

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
      admins: idSet(safeRefsIn(src, 'vf:primaryAccountable')),
      timesheets: safeRefsIn(src, 'timesheet'),
      projects: safeRefsIn(src, 'project')
    });
  }

  /**
   * @param {Gateway} gateway
   * @param {string} name plain account name
   * @param {Iterable<string>} emails verifiable account identities
   * @param {Iterable<string>} keyids per-device keys
   * @param {Iterable<string>} admins admin (primary accountable) IRIs
   * @param {import('@m-ld/m-ld').Reference[]} timesheets timesheet Id Refs
   * @param {import('@m-ld/m-ld').Reference[]} projects project Id Refs
   */
  constructor(gateway, {
    name,
    emails = [],
    keyids = [],
    admins = [],
    timesheets = [],
    projects = []
  }) {
    this.gateway = gateway;
    this.name = name;
    this.emails = new Set([...emails ?? []]);
    this.keyids = new Set([...keyids ?? []]);
    this.admins = new Set([...admins ?? []]);
    this.timesheets = timesheets ?? [];
    this.projects = projects ?? [];
    /**
     * Cache of account-owned entities
     * @type {{ Project: Set<string>, Timesheet: Set<string> }}
     * @see allOwned
     */
    this.owned = {}; // See allOwned
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
   * @param {string} keyid user key ID
   * @param {AccessRequest|undefined} [access] request
   * @returns {Promise<AblyKeyDetail>}
   * @throws {import('restify-errors').DefinedHttpError}
   */
  async authorise(keyid, access) {
    if (!this.keyids.has(keyid))
      throw new UnauthorizedError(
        `Key ${keyid} does not belong to account ${this.name}`);

    return new Promise(async (resolve, reject) => {
      this.gateway.domain.read(async state => {
        try {
          if (access != null)
            await this.checkAccess(state, access);
          // Update the capability of the key to include the timesheet.
          // This also serves as a check that the key exists.
          const authorisedTsIds = [...await this.allOwned(state, 'Timesheet')]
            .map(iri => AccountOwnedId.fromIri(iri, this.gateway.domainName));
          try {
            return resolve(await this.gateway.ablyApi.updateAppKey(keyid, {
              capability: this.keyCapability(...authorisedTsIds)
            }));
          } catch (e) {
            // TODO: Assuming this is a Not Found
            return reject(new UnauthorizedError(e));
          }
        } catch (e) {
          return reject(toHttpError(e));
        }
      });
    });
  }

  /**
   * @param {MeldReadState} state
   * @param {AccessRequest} access request
   * @returns {Promise<void>}
   */
  async checkAccess(state, access) {
    const ask = new Ask(state);
    const iri = access.id.toRelativeIri();
    const writable = {
      'Timesheet': await this.allOwned(state, 'Timesheet'),
      'Project': await this.allOwned(state, 'Project')
    };
    if (access.forWrite && !(await ask.exists({ '@id': iri }))) {
      // Creating; check write access to account
      if (access.id.account !== this.name &&
        !(await ask.exists(userIsAdmin(this.name, access.id.account))))
        throw new ForbiddenError();
      // Otherwise OK to create
      writable[access.forWrite].add(iri);
    } else if (!writable['Timesheet'].has(iri) && !writable['Project'].has(iri)) {
      if (access.forWrite) {
        throw new ForbiddenError();
      } else {
        // Finally check for a readable timesheet through one of the projects
        if (!(await Promise.all([...writable['Project']].map(project =>
          ask.exists(timesheetHasProject(iri, project))))).includes(true))
          throw new ForbiddenError();
      }
    }
  }

  /**
   * @param {MeldReadState} state
   * @param {'Timesheet'|'Project'} type
   * @returns {Promise<Set<string>>}
   */
  async allOwned(state, type) {
    if (this.owned[type] == null) {
      this.owned[type] = idSet(
        type === 'Timesheet' ? this.timesheets : this.projects);
      await state.read({
        '@select': '?owned',
        '@where': ({
          '@type': 'Account',
          'vf:primaryAccountable': { '@id': this.name },
          [type.toLowerCase()]: '?owned'
        })
      }).forEach(result => this.owned[type].add(result['?owned']['@id']));
    }
    return this.owned[type];
  }

  /**
   * @param {import('@m-ld/m-ld').Read} query
   * @returns {Promise<Results>} results
   */
  async read(query) {
    // Check that the given pattern matches a permitted query
    const matchingPattern = new ReadPatterns(this.name).matchPattern(query);
    if (matchingPattern == null)
      throw new ForbiddenError('Unrecognised read pattern: %j', query);
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

  /**
   * @param {MeldReadState} state the current domain state
   * @param {import('@m-ld/m-ld').Reference} tsRef the timesheet ref
   * @returns {Promise<void>}
   */
  onInsertTimesheet = async (state, tsRef) => {
    if (tsRef != null) {
      const tsId = this.gateway.ownedRefAsId(tsRef);
      const ask = new Ask(state);
      if (await ask.exists(accountHasTimesheet(tsId)))
        throw new ConflictError('Timesheet already exists');
      if (this.name !== tsId.account &&
        !(await ask.exists(userIsAdmin(this.name, tsId.account))))
        throw new UnauthorizedError('No access to timesheet');
      await this.gateway.initTimesheet(tsId, true);
    }
  };

  /**
   * @param {import('@m-ld/m-ld').Query} query
   */
  async write(query) {
    const matchingPattern =
      new WritePatterns(this.name, this.onInsertTimesheet).matchPattern(query);
    if (matchingPattern == null)
      throw new ForbiddenError('Unrecognised write pattern: %j', query);
    await this.gateway.domain.write(async state => {
      await state.write(await matchingPattern.check(state, query));
    });
  }

  /**
   * @param {Results} subjects Domain entity subjects, i.e. Projects, Timesheets & Entries
   * @returns {Promise<void>}
   */
  async import(subjects) {
    const sessions = {};
    await each(subjects, async src => {
      // Validate schema observance
      const validation = validate(isDomainEntity, src);
      if (validation.length > 0)
        throw new BadRequestError(
          'Malformed domain entity %j', validation);
      switch (src['@type']) {
        case 'Timesheet':
        case 'Project':
          return this.importOwned(src);
        case 'Entry':
          return this.importEntry(src, sessions);
        default:
          throw new BadRequestError(
            'Unknown entity type %s for %s', src['@type'], src['@id']);
      }
    });
  }

  /**
   * @param {import('@m-ld/m-ld').GraphSubject} src
   * @returns {Promise<void>}
   */
  async importOwned(src) {
    const id = this.gateway.ownedRefAsId(src);
    if (!id.isValid)
      throw new BadRequestError(
        'Malformed entity identity %s', src['@id']);
    await this.gateway.domain.write(async state => {
      await this.checkAccess(state, { id, forWrite: src['@type'] });
      if (src['@type'] === 'Timesheet' && await this.gateway.isGenesisTs(state, id))
        await this.gateway.initTimesheet(id, true);
      return state.write({
        '@delete': { '@id': src['@id'] },
        '@insert': { '@id': id.account, [src['@type'].toLowerCase()]: src }
      });
    });
  }

  /**
   * @param {import('@m-ld/m-ld').GraphSubject} src
   * @param {{ [key: string]: Session }} sessions
   * @returns {Promise<void>}
   */
  async importEntry(src, sessions) {
    // Check @id not provided
    if (src['@id'])
      throw new BadRequestError(
        'Imported Timesheet entry should not include ID');
    const tsId = this.gateway.ownedRefAsId(src['session']);
    await this.gateway.domain.write(async state => {
      await this.checkAccess(state, { id: tsId, forWrite: 'Timesheet' });
      if (await this.gateway.isGenesisTs(state, tsId))
        throw new BadRequestError('Timesheet not found: %s', tsId);
      const tsClone = await this.gateway.initTimesheet(tsId, false);
      await tsClone.write(async state => {
        const tsIri = tsId.toIri();
        // Create session in timesheet if required
        if (!(tsIri in sessions))
          state = await state.write((sessions[tsIri] = new Session()).toJSON());
        // Check if a given entry ID already exists
        if (src['external'] != null) {
          const existing = (await state.read({
            '@select': '?e', '@where': { '@id': '?e', external: src['external'] }
          })).map(result => result['?e']);
          if (existing.length) {
            return state.write({
              '@delete': existing,
              '@insert': {
                ...src,
                ...existing[0], // Pick one
                'session': { '@id': sessions[tsIri].id }
              }
            });
          }
        }
        return state.write({
          ...src,
          '@id': `${sessions[tsIri].id}/${sessions[tsIri].claimEntryId()}`,
          'session': { '@id': sessions[tsIri].id }
        });
      });
    });
  }

  /**
   * @param {AccountOwnedId} tsIds
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
      'timesheet': this.timesheets,
      'project': this.projects
    };
  }
}