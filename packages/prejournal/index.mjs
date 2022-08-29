import setupFetch from '@zeit/fetch';
import { ResultsReadable } from 'timeld-common';
import LOG from 'loglevel';

/**
 * @typedef {object} PrejournalConfig
 * @property {string} user account (user) name
 * @property {string} key account key
 * @property {string} api API URL e.g. https://time.pondersource.com/v1/
 * @property {string} client default client
 */

/**
 * @implements Integration
 */
export default class PrejournalIntegration {
  // noinspection JSUnusedGlobalSymbols
  /** Used by the gateway to provide the configuration constructor parameter */
  static configKey = 'prejournal';

  // noinspection JSUnusedGlobalSymbols
  /** Used by the gateway to negotiate content types */
  static contentType = 'text/x-prejournal';

  /**
   * Construct with configuration parameters
   * @param {PrejournalConfig} config
   * @param {GraphSubject} ext
   * @param {import('@zeit/fetch').Fetch} fetch injected fetch
   */
  constructor(config, ext, fetch = setupFetch()) {
    const auth = `Basic ${Buffer.from([config.user, config.key].join(':')).toString('base64')}`;
    const apiRoot = new URL(config.api);
    if (!apiRoot.pathname.endsWith('/'))
      apiRoot.pathname += '/';
    if (!apiRoot.pathname.endsWith('/v1/'))
      throw new RangeError('Prejournal integration requires v1 API');
    this.ext = ext;
    this.client = config.client;
    /**
     * @param {WorkedHours} workedHours
     * @returns {Promise<*>}
     */
    this.post = async workedHours => {
      const command = workedHours.toJSON();
      const res = await fetch(new URL(command[0], apiRoot).toString(), {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': auth
        },
        method: 'POST',
        body: JSON.stringify(command.slice(1))
      });
      if (!res.ok)
        throw new Error(`Fetch failed with ${res.statusText}, command:
          ${JSON.stringify(command)}`);
      const body = await res.text();
      if (body.length > 0)
        return JSON.parse(body);
    };
  }

  /**
   * @param {AccountOwnedId} tsId
   * @param {MeldUpdate} update
   * @param {MeldReadState} state
   */
  entryUpdate(tsId, update, state) {
    // Look for new Entries, and IDs for which we already have a Movement
    return Promise.all(update['@insert'].map(async src => {
      if (src['@id'] in this.ext) {
        // Load the whole state for the entry
        // noinspection JSCheckFunctionSignatures
        src = await state.get(src['@id']);
        const movementId = this.ext[src['@id']];
        LOG.debug('Updated Movement', movementId, 'from Entry', src['@id']);
        await this.post(new WorkedHours(tsId, src, this.client, movementId));
      } else if (src['@type'] === 'Entry') {
        // Inserting worked-hours
        const res = await this.post(new WorkedHours(tsId, src, this.client));
        // Store the movement ID for the entry
        // (If available: https://github.com/pondersource/prejournal/issues/127)
        const movementId = res[0]['movementId'];
        LOG.debug('Inserted Movement', movementId, 'from Entry', src['@id']);
        if (movementId)
          this.ext[src['@id']] = movementId;
      }
    }));
  }

  /**
   * @param {AccountOwnedId} tsId
   * @param {MeldReadState} state
   */
  reportTimesheet(tsId, state) {
    return new ResultsReadable(state.read({
      '@describe': '?entry', '@where': { '@id': '?id', '@type': 'Entry' }
    }).consume, {
      stringify: src => new WorkedHours(tsId, src, this.client).toJSON().join(' '),
      separator: '\n'
    });
  }
}

class WorkedHours {
  /**
   * Note:
   *
   * - The configured Prejournal account (see PrejournalIntegration constructor)
   * must have an access control 'claim' over the given worker account.
   *
   * @param {AccountOwnedId} tsId
   * @param {GraphSubject} src Entry subject
   * @param {string} client
   * @param {number} [movementId]
   */
  constructor(tsId, src, client, movementId) {
    this.timestamp = src['start']['@value'];
    this.client = client;
    this.worker = src['vf:provider']['@id'];
    this.project = tsId.toRelativeIri();
    this.amount = (src['duration'] || 0) / 60;
    this.description = src['activity'];
    this.movementId = movementId;
    // TODO: External identifier, https://github.com/pondersource/prejournal/issues/129
  }

  toJSON() {
    return this.movementId != null ? [
      'update-entry',
      this.timestamp,
      this.client + ':' + this.project,
      this.amount,
      this.description,
      // Not possible to update the worker
      this.movementId
    ] : [
      'worked-hours',
      this.timestamp,
      this.client,
      this.project,
      this.amount,
      this.description,
      this.worker
    ];
  }
}
