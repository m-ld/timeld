import { array, propertyValue } from '@m-ld/m-ld';
import { idSet, safeRefsIn } from 'timeld-common/lib/util.mjs';
import { Readable } from 'stream';
import { Subscription } from 'rxjs';
import LOG from 'loglevel';
import { Env } from 'timeld-common';

/**
 * @interface Connector
 * @static {string} configKey used to provide the configuration
 * @static {string} contentType used to negotiate content types
 */

/**
 * Called to synchronise the timesheet with the external system. If the `state`
 * parameter is provided, the connector may read and write it as required, but
 * not after the returned promise is settled. Updates in the returned observable
 * represent external updates and will be applied in order to the timesheet.
 *
 * @function
 * @name Connector#syncTimesheet
 * @param {AccountOwnedId} tsId
 * @param {MeldState} [state] the local timesheet state
 * @returns {Promise<import('rxjs').Observable<Update> | null>}
 */

/**
 * Called when a timesheet entry is updated, to be pushed to the external system
 * @function
 * @name Connector#entryUpdate
 * @param {AccountOwnedId} tsId
 * @param {MeldUpdate} update
 * @param {MeldReadState} state the timesheet state
 * @returns Promise<*>
 */

/**
 * Called to report the timesheet in the native format of the external system
 * @function
 * @name Connector#reportTimesheet
 * @param {AccountOwnedId} tsId
 * @param {MeldReadState} state the timesheet state
 * @returns {Readable} timesheet content in some native format
 */

/**
 * @implements {Connector} but note return type of entryUpdate
 */
export default class ConnectorExtension {
  /**
   * @param {GraphSubject} src
   */
  static fromJSON(src) {
    // noinspection JSCheckFunctionSignatures
    return new ConnectorExtension({
      module: propertyValue(src, 'module', String),
      appliesTo: idSet(safeRefsIn(src, 'appliesTo')),
      config: propertyValue(src, 'config', Array, String).map(JSON.parse)[0]
    }, src);
  }

  /**@type {Promise<*>}*/asyncTasks = Promise.resolve();

  /**
   * @param {string} module ESM module to import for connector implementation
   * @param {Iterable<string>} appliesTo set of timesheet or project IRIs
   * @param {*} config instance-specific configuration
   * @param {GraphSubject} [src]
   */
  constructor({ module, appliesTo, config }, src) {
    this.module = module;
    this.appliesTo = [...appliesTo];
    this.config = config;
    this.resetUpdate();
    this.src = new Proxy(src || {}, {
      set: (src, p, value) => {
        if (p in src) {
          if (this.update['@delete'] == null || !(p in this.update['@delete']))
            (this.update['@delete'] ||= { '@id': src['@id'] })[p] = src[p];
        }
        if (array(value).length) {
          (this.update['@insert'] ||= { '@id': src['@id'] })[p] = value;
          return Reflect.set(src, p, value);
        } else {
          return Reflect.deleteProperty(src, p);
        }
      }
    });
    this.subs = new Subscription();
  }

  /**
   * @param {Gateway} gateway
   * @returns {Promise<this>}
   */
  async initialise(gateway) {
    this.gateway = gateway;
    const Impl = (await import(this.module)).default;
    this.connector = /**@type {Connector}*/new Impl(
      Env.mergeConfig(gateway.config[Impl.configKey], this.config), this.src);
    this.contentType = Impl.contentType;
    return this;
  }

  get name() {
    return this.connector.constructor.name;
  }

  async syncTimesheet(tsId, state) {
    const updates = await this.connector.syncTimesheet?.(tsId, state);
    if (updates) {
      this.subs.add(updates.subscribe(update =>
        this.asyncTasks = this.asyncTasks.then(
          () => this.writeIncomingUpdate(tsId, update))));
    }
    return updates; // Only for conformance with interface
  }

  /**
   * @returns {Promise<Update>} an update applicable to the gateway state
   */
  async entryUpdate(tsId, update, state) {
    await this.connector.entryUpdate?.(tsId, update, state);
    this.updateGateway(tsId);
  }

  reportTimesheet(tsId, state) {
    return this.connector.reportTimesheet?.(tsId, state) || Readable.from([]);
  };

  async writeIncomingUpdate(tsId, update) {
    try {
      const ts = await this.gateway.initTimesheet(tsId, false);
      await ts.write(update);
      this.updateGateway(tsId);
    } catch (e) {
      LOG.warn(this.name, 'cannot write to', tsId, e);
    }
  }

  updateGateway(tsId) {
    // TODO: Consider separate concurrently-edited timesheets
    // Pushing the Gateway domain update async to prevent a deadlock
    const update = this.resetUpdate();
    if (Object.keys(update).length)
      this.gateway.domain.write(update)
        .catch(e => LOG.warn(this.name, 'gateway update failed', tsId, e));
  }

  /**
   * Called when the extension subject itself is updated
   * @param {GraphSubject} src
   * @param {'delete'|'insert'} type
   */
  onUpdate(src, type) {
    if ('appliesTo' in src) {
      const affectedApplies = idSet(array(src['appliesTo']));
      if (type === 'delete') {
        this.appliesTo = this.appliesTo.filter(a => !affectedApplies.has(a));
      } else {
        this.appliesTo.push(...affectedApplies);
      }
    }
  }

  /**
   * @returns {Update}
   */
  resetUpdate() {
    const update = this.update;
    this.update = {};
    return update;
  }

  async close() {
    this.subs.unsubscribe();
    await this.asyncTasks;
  }

  /**
   * @returns {Subject}
   */
  toJSON() {
    return {
      '@type': 'Connector',
      module: this.module,
      appliesTo: [...this.appliesTo].map(iri => ({ '@id': iri })),
      config: this.config ? JSON.stringify(this.config) : [],
      ...this.src
    };
  }
}