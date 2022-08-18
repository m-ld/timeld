import { array, propertyValue } from '@m-ld/m-ld';
import { idSet, safeRefsIn } from 'timeld-common/lib/util.mjs';

/**
 * @typedef {object} Integration
 * @static {string} configKey
 * @static {string} contentType
 * @property {(
 * tsId: AccountOwnedId,
 * update: MeldUpdate,
 * state: MeldReadState
 * ) => Promise<*>} entryUpdate
 * @property {(
 * tsId: AccountOwnedId,
 * state: MeldReadState
 * ) => Promise<*>} reportTimesheet
 */

/**
 * @implements {Integration} but note return type of entryUpdate
 */
export default class IntegrationExtension {
  /**
   * @param {GraphSubject} src
   */
  static fromJSON(src) {
    // noinspection JSCheckFunctionSignatures
    return new IntegrationExtension({
      module: propertyValue(src, 'module', String),
      appliesTo: idSet(safeRefsIn(src, 'appliesTo'))
    }, src);
  }

  /**
   * @param {string} module
   * @param {Iterable<string>} appliesTo
   * @param {GraphSubject} [src]
   */
  constructor({ module, appliesTo }, src) {
    this.module = module;
    this.appliesTo = [...appliesTo];
    this.resetUpdate();
    this.src = new Proxy(src || {}, {
      set: (src, p, value) => {
        if (p in src) {
          if (this.update['@delete'] == null || !(p in this.update['@delete']))
            (this.update['@delete'] ||= { '@id': src['@id'] })[p] = src[p];
        }
        (this.update['@insert'] ||= { '@id': src['@id'] })[p] = value;
        return Reflect.set(src, p, value);
      }
    });
  }

  /**
   * @param {object} config
   * @returns {Promise<this>}
   */
  async initialise(config) {
    const Impl = (await import(this.module)).default;
    this.integration =
      /**@type {Integration}*/new Impl(config[Impl.configKey], this.src);
    this.contentType = Impl.contentType;
    return this;
  }

  /**
   * @param {AccountOwnedId} tsId
   * @param {MeldUpdate} update
   * @param {MeldReadState} state
   * @returns {Promise<Update>} an update applicable to the gateway state
   */
  async entryUpdate(tsId, update, state) {
    await this.integration.entryUpdate(tsId, update, state);
    // TODO: Consider separate concurrently-edited timesheets
    return this.resetUpdate();
  }

  /**
   * @param {AccountOwnedId} tsId
   * @param {MeldReadState} state
   */
  reportTimesheet(tsId, state) {
    return this.integration.reportTimesheet(tsId, state);
  };

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

  /**
   * @returns {Subject}
   */
  toJSON() {
    return {
      '@type': 'Integration',
      module: this.module,
      appliesTo: [...this.appliesTo].map(iri => ({ '@id': iri })),
      ...this.src
    }
  }
}