import { array, propertyValue, Reference } from '@m-ld/m-ld';
import { idSet } from 'timeld-common/lib/util.mjs';
import { Readable } from 'stream';
import { Subscription } from 'rxjs';
import LOG from 'loglevel';
import { Env } from 'timeld-common';
import { httpis, createSigner } from 'http-message-signatures';
import * as httpDigest from '@digitalbazaar/http-digest-header';

/**
 * @interface Connector
 * @typedef {
 * new (config: Object, ext: GraphSubject, ctx: ConnectorContext) => Connector
 * } ConnectorConstructor
 * @property {string} configKey used to provide the configuration
 * @property {string} contentType used to negotiate content types
 */

/**
 * @typedef {import('http-message-signatures').RequestLike} RequestLike
 * @typedef {(req: RequestLike) => Promise<RequestLike>} SignHttp
 */

/**
 * @typedef {object} ConnectorContext
 * @property {SignHttp} signHttp
 */

/**
 * Called to synchronise the timesheet with the external system. If the `state`
 * parameter is provided, the connector may read and write it as required, but
 * not after the returned promise is settled. If the `state` is _not_ provided,
 * updates in the returned observable represent external updates and will be
 * applied in order to the timesheet.
 *
 * @function
 * @name Connector#syncTimesheet
 * @param {AccountOwnedId} tsId
 * @param {MeldState} [state] the local timesheet state
 * @param {number} [tick] the local timesheet tick (for correlation)
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
      appliesTo: idSet(propertyValue(src, 'appliesTo', Array, Reference)),
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
    const Impl = /**@type ConnectorConstructor*/(await import(this.module)).default;
    // noinspection JSValidateTypes Method expression is not of Function type?
    this.connector = /**@type {Connector}*/new Impl(
      Env.mergeConfig(gateway.config[Impl.configKey], this.config),
      this.src,
      { signHttp: req => this.signHttp(gateway, req) }
    );
    this.contentType = Impl.contentType;
    return this;
  }

  /**
   * @param {Gateway} gateway
   * @param {RequestLike} req
   * @param {number} [created] override, for tests
   * @returns {Promise<RequestLike>}
   */
  async signHttp(gateway, req, { created } = {}) {
    if (req.headers?.['X-State-ID'] == null)
      throw new RangeError('Signed request must specify a state ID');
    // Note: cannot use @authority
    // https://github.com/dhensby/node-http-message-signatures/issues/54
    const components = ['@method', '@request-target', 'content-type'];
    if (req.body) {
      if (typeof req.body == 'string') {
        req.headers['Content-Digest'] = await httpDigest
          .createHeaderValue({ data: req.body, useMultihash: true });
        components.push('content-digest');
      } else {
        throw new RangeError('Non-string request bodies are not supported for signatures');
      }
    }
    return httpis.sign(req, {
      format: 'httpbis', components,
      parameters: { created: created ?? Math.floor(Date.now() / 1000) },
      keyId: gateway.me.authKey.keyid,
      signer: createSigner(...gateway.me.getSignHttpArgs())
    });
  }

  get name() {
    return this.connector.constructor.name;
  }

  async syncTimesheet(tsId, state, tick) {
    const updates = await this.connector.syncTimesheet?.(tsId, state, tick);
    // Do not subscribe to updates if the state has been passed
    if (updates && state == null) {
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