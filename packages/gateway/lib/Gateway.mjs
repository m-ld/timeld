import Account from './Account.mjs';
import { randomInt } from 'crypto';
import Cryptr from 'cryptr';
import { uuid } from '@m-ld/m-ld';
import { AuthKey, BaseGateway, Env, safeRefsIn, timeldContext } from 'timeld-common';
import jsonwebtoken from 'jsonwebtoken';
import LOG from 'loglevel';
import { access, rm, writeFile } from 'fs/promises';
import { accountHasTimesheet, Ask } from './statements.mjs';
import { concat, finalize, Subscription } from 'rxjs';
import { consume } from 'rx-flowable/consume';
import { ConflictError, NotFoundError, UnauthorizedError } from '../rest/errors.mjs';
import IntegrationExtension from './Integration.mjs';

export default class Gateway extends BaseGateway {
  /**
   * @param {import('timeld-common').Env} env
   * @param {TimeldGatewayConfig} config
   * @param {CloneFactory} cloneFactory m-ld clone creation function
   * @param {AuthKeyStore} keyStore authorisation key store
   */
  constructor(env,
    config,
    cloneFactory,
    keyStore
  ) {
    super(config['@domain']);
    this.env = env;
    this.config = /**@type {TimeldGatewayConfig}*/{
      ...config,
      '@id': uuid(),
      '@context': timeldContext
    };
    LOG.info('Gateway ID is', this.config['@id']);
    LOG.debug('Gateway domain is', this.domainName);
    this.authKey = new AuthKey(config.auth.key);
    this.cloneFactory = cloneFactory;
    this.keyStore = /**@type {AuthKeyStore}*/keyStore;
    this.timesheetDomains = /**@type {{ [name: string]: MeldClone }}*/{};
    this.integrations = /**@type {{ [id: string]: IntegrationExtension }}*/{};
    this.subs = new Subscription();
  }

  async initialise() {
    // Load the gateway domain
    const dataDir = await this.env.readyPath('data', 'gw');
    this.domain = await this.cloneFactory.clone(this.config, dataDir);
    await this.domain.status.becomes({ outdated: false });
    // Enliven all timesheets and integrations already in the domain
    await new Promise(resolve => {
      this.subs.add(this.domain.read(state => Promise.all([
        this.initTimesheets(state),
        this.initIntegrations(state)
      ]).then(resolve), (update, state) => Promise.all([
        this.onUpdateTimesheets(update),
        this.onUpdateIntegrations(update, state)
      ])));
    });
    return this;
  }

  /**
   * @param {MeldReadState} state
   */
  initTimesheets(state) {
    // Timesheets are the range of the 'timesheet' Account property
    return this.readAsync(state.read({
      '@select': '?tsh', '@where': { timesheet: '?tsh' }
    }).consume, ({ value, next }) => {
      this.timesheetAdded(this.ownedRefAsId(value['?tsh'])).finally(next);
    });
  }

  /**
   * @param {MeldUpdate} update
   * @returns {Promise<*>}
   */
  onUpdateTimesheets(update) {
    // Watch for timesheets appearing and disappearing
    // noinspection JSCheckFunctionSignatures
    return Promise.all([
      ...update['@delete'].map(subject => Promise.all(
        safeRefsIn(subject, 'timesheet').map(tsRef =>
          this.timesheetRemoved(this.ownedRefAsId(tsRef))))),
      ...update['@insert'].map(subject => Promise.all(
        safeRefsIn(subject, 'timesheet').map(tsRef =>
          this.timesheetAdded(this.ownedRefAsId(tsRef)))))
    ]);
  }

  /**
   * @param {MeldReadState} state
   */
  initIntegrations(state) {
    // FIXME: Integration must be tied to exactly one gateway instance!
    // noinspection JSCheckFunctionSignatures
    return this.readAsync(state.read({
      '@describe': '?ext',
      '@where': {
        // Only load the integration if it applies to anything
        '@id': '?ext', '@type': 'Integration', appliesTo: '?'
      }
    }), src => this.loadIntegration(src));
  }

  /**
   * Hoop-jumping to ensure that an asynchronous read does not throw an
   * unhandled exception if the gateway is closed too soon.
   * @param {import('rxjs').Observable} results
   * @param {Parameters<import('rxjs').Observable['subscribe']>[0]} sub
   * @returns {Promise<unknown>}
   */
  readAsync(results, sub) {
    return new Promise(resolve => {
      // noinspection JSCheckFunctionSignatures
      this.subs.add(results.pipe(finalize(resolve)).subscribe(sub));
    });
  }

  /**
   * @param {GraphSubject} src
   * @returns {Promise<void>}
   */
  async loadIntegration(src) {
    try {
      this.integrations[src['@id']] =
        await IntegrationExtension.fromJSON(src).initialise(this.config);
      LOG.info('Loaded integration', src);
    } catch (e) {
      LOG.warn('Could not load integration', src, e);
    }
  }

  /**
   * @param {MeldUpdate} update
   * @param {MeldReadState} state
   * @returns {Promise<*>}
   */
  onUpdateIntegrations(update, state) {
    for (let src of update['@delete']) {
      if (src['@id'] in this.integrations) {
        if ('module' in src) {
          // If an integration's key property vanishes, remove it
          delete this.integrations[src['@id']];
          LOG.info('Unloaded integration', src);
        } else {
          this.integrations[src['@id']].onUpdate(src, 'delete');
        }
      }
    }
    for (let src of update['@insert']) {
      // If a new integration appears, load it
      if (src['@type'] === 'Integration') {
        // noinspection JSIgnoredPromiseFromCall happy for this to be async
        this.loadIntegration(src);
      } else if (src['@id'] in this.integrations) {
        this.integrations[src['@id']].onUpdate(src, 'insert');
      }
    }
  }

  /**
   * @param {AccountOwnedId} tsId timesheet to clone
   * @param {boolean} genesis whether timesheet is expected to be new
   * @returns {Promise<MeldClone>}
   */
  async cloneTimesheet(tsId, genesis = false) {
    const config = Object.assign(Env.mergeConfig(this.config, {
      '@id': uuid(), '@domain': tsId.toDomain()
    }), { genesis });
    LOG.info(tsId, 'ID is', config['@id']);
    const ts = await this.cloneFactory.clone(config, await this.getDataPath(tsId));
    // Attach integration listener
    // Note we have not waited for up to date, so this picks up rev-ups
    const tsIri = tsId.toRelativeIri();
    ts.follow(async (update, state) => {
      for (let integration of Object.values(this.integrations)) {
        if (integration.appliesTo.includes(tsIri)) {
          // TODO: These will queue up on the write lock, and could overflow
          // Integrations should be guaranteed fast and async their heavy stuff
          await this.domain.write(async gwState =>
            gwState.write(await integration.entryUpdate(tsId, update, state))
          ).catch(err => LOG.warn(integration.module, 'update failed', tsIri, err));
        }
      }
    });
    return this.timesheetDomains[tsId.toDomain()] = ts;
  }

  getDataPath(tsId) {
    return this.env.readyPath('data', 'tsh', tsId.account, tsId.name);
  }

  async timesheetAdded(tsId) {
    if (!(tsId.toDomain() in this.timesheetDomains)) {
      try {
        await this.cloneTimesheet(tsId);
        LOG.info('Loaded declared timesheet', tsId);
      } catch (e) {
        // If the clone fails that's fine, we'll try again if it's asked for
        LOG.warn('Failed to load declared timesheet', tsId, e);
      }
    }
  }

  async timesheetRemoved(tsId) {
    try {
      await this.timesheetDomains[tsId.toDomain()]?.close();
      const path = await this.getDataPath(tsId);
      // Remove the persistent data
      await rm(path, { recursive: true, force: true });
      // Write the tombstone file to prevent re-creation
      await writeFile(`${path}.rip`, '');
      // TODO: Remove all channel permissions
      delete this.timesheetDomains[tsId.toDomain()];
      LOG.info('Removed declared timesheet', tsId);
    } catch (e) {
      LOG.warn('Error removing declared timesheet', tsId, e);
    }
  }

  async tsTombstoneExists(tsId) {
    const path = await this.getDataPath(tsId);
    return access(`${path}.rip`).then(() => true, () => false);
  }

  /**
   * @param {string} account name
   * @param {true} [orCreate] allow creation of new account
   * @returns {Promise<Account | undefined>}
   */
  async account(account, { orCreate } = {}) {
    let acc;
    await this.domain.write(async state => {
      const src = await state.get(account);
      if (src != null) {
        acc = Account.fromJSON(this, src);
      } else if (orCreate) {
        acc = new Account(this, { name: account });
        await state.write(acc.toJSON());
      }
    });
    return acc;
  }

  /**
   * @param {string} account name
   * @param {string} email
   * @returns {Promise<{ jwe: string, code: string }>}
   */
  async activation(account, email) {
    // If the account exists, check the email is registered
    const acc = await this.account(account);
    if (acc != null && !acc.emails.has(email))
      throw new UnauthorizedError(
        'Email %s not registered to account %s', email, account);
    // Construct a JWT with the email, using our authorisation key
    const { secret, keyid } = this.authKey;
    // noinspection JSCheckFunctionSignatures
    const jwt = jsonwebtoken.sign({ email }, secret, {
      keyid, expiresIn: '10m'
    });
    // Encrypt the JWT with the activation code
    const code = randomInt(111111, 1000000).toString(10);
    const jwe = new Cryptr(code).encrypt(jwt);
    return { jwe, code };
  }

  /**
   * @param {string} jwt a JWT created by this Gateway
   * @returns {object} the JWT payload
   */
  verify(jwt) {
    // Verify the JWT was created by us
    // noinspection JSCheckFunctionSignatures
    return jsonwebtoken.verify(jwt, this.authKey.secret);
  }

  /**
   * Gets the m-ld configuration for a timesheet. Calling this method will
   * create the timesheet if it does not already exist.
   *
   * The caller must have already checked user access to the timesheet.
   *
   * @param {AccountOwnedId} tsId
   * @returns {Promise<Partial<MeldConfig>>}
   */
  async timesheetConfig(tsId) {
    // Do we already have a clone of this timesheet?
    if (!(tsId.toDomain() in this.timesheetDomains)) {
      // Use m-ld write locking to guard against API race conditions
      await this.domain.write(async state => {
        // Genesis if the timesheet is not already in the account
        await this.initTimesheet(tsId, await this.isGenesisTs(state, tsId));
        // Ensure the timesheet is in the domain
        await state.write(accountHasTimesheet(tsId));
      });
    }
    // Return the config required for a new clone, using some of our config
    return Object.assign({
      '@domain': tsId.toDomain(), genesis: false // Definitely not genesis
    }, this.cloneFactory.reusableConfig(this.config));
  }

  /**
   * @param {import('@m-ld/m-ld').MeldReadState} state
   * @param {AccountOwnedId} tsId
   * @returns {Promise<boolean>}
   */
  async isGenesisTs(state, tsId) {
    return !(await new Ask(state).exists(accountHasTimesheet(tsId)));
  }

  /**
   * @param {AccountOwnedId} tsId
   * @param {boolean} genesis
   * @returns {Promise<MeldClone>}
   */
  async initTimesheet(tsId, genesis) {
    if (tsId.toDomain() in this.timesheetDomains)
      return this.timesheetDomains[tsId.toDomain()];
    // If genesis, check that this timesheet has not existed before
    if (genesis && await this.tsTombstoneExists(tsId))
      throw new ConflictError();
    const ts = await this.cloneTimesheet(tsId, genesis);
    // Ensure that the clone is online to avoid race with the client
    await ts.status.becomes({ online: true });
    return ts;
  }

  /**
   * Reports on the given timesheet OR project with the given ID.
   *
   * The results will contain the following subjects in guaranteed order:
   * 1. The project, if applicable
   * 2. The timesheet OR all timesheets in the project, each followed
   * immediately by its entries
   *
   * @param {AccountOwnedId} ownedId
   * @returns {Promise<Results>}
   */
  report(ownedId) {
    return new Promise(async (resolve, reject) => {
      this.domain.read(async state => {
        try {
          const owned = await state.get(ownedId.toIri());
          switch (owned?.['@type']) {
            case 'Timesheet':
              return resolve(await this.reportTimesheet(owned));
            case 'Project':
              // Don't hold the gateway domain open while all timesheets are output
              const timesheets = await state.read({
                '@describe': '?ts',
                '@where': { '@id': '?ts', '@type': 'Timesheet', project: owned['@id'] }
              });
              const tsFlows = await Promise.all(timesheets.map(this.reportTimesheet));
              return resolve(concat(consume([owned]), ...tsFlows));
            default:
              return reject(new NotFoundError('%s not found', ownedId));
          }
        } catch (e) {
          return reject(e);
        }
      });
    });
  }

  /**
   * @param {import('@m-ld/m-ld').GraphSubject} ts
   * @returns {Promise<Results>}
   */
  reportTimesheet = async ts => {
    const tsId = this.ownedRefAsId(ts);
    const tsClone = await this.initTimesheet(tsId, false);
    // FIXME: Bug in m-ld-js does not permit result consumable to be subscribed
    // after read completes. Should be using read(<req>).consume.
    const result = await tsClone.read({
      '@describe': '?entry',
      '@where': { '@id': '?entry', '@type': 'Entry' }
    });
    return concat(consume([ts]), consume(result));
  };

  close() {
    this.subs.unsubscribe();
    // Close the gateway domain
    return Promise.all([
      this.domain?.close(),
      ...Object.values(this.timesheetDomains).map(d => d.close())
    ]);
  }
}

