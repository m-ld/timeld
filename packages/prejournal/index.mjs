import setupFetch from '@zeit/fetch';
import { lastPathComponent, ResultsReadable } from 'timeld-common';

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
   * @param {string} user Prejournal account (user) name
   * @param {string} key Prejournal account key
   * @param {string} api API URL e.g. https://time.pondersource.com/v1/
   * @param {GraphSubject} ext
   * @param {import('@zeit/fetch').Fetch} fetch injected fetch
   */
  constructor({ user, key, api }, ext, fetch = setupFetch()) {
    const auth = `Basic ${Buffer.from([user, key].join(':')).toString('base64')}`;
    const apiRoot = new URL(api);
    if (!apiRoot.pathname.endsWith('/'))
      apiRoot.pathname += '/';
    if (!apiRoot.pathname.endsWith('/v1/'))
      throw new RangeError('Prejournal integration requires v1 API');
    this.ext = ext;
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
        await this.post(new WorkedHours(tsId, src, this.ext[src['@id']]));
      } else if (src['@type'] === 'Entry') {
        // Inserting worked-hours
        const res = await this.post(new WorkedHours(tsId, src));
        // Store the movement ID for the entry
        this.ext[src['@id']] = res[0]['movementId'];
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
      stringify: src => new WorkedHours(tsId, src).toJSON().join(' '),
      separator: '\n'
    });
  }
}

class WorkedHours {
  /**
   * @param {AccountOwnedId} tsId
   * @param {GraphSubject} src Entry subject
   * @param {number} [movementId]
   */
  constructor(tsId, src, movementId) {
    this.timestamp = src['start']['@value'];
    this.worker = lastPathComponent(src['vf:provider']['@id']);
    this.project = tsId.toRelativeIri();
    this.amount = (src['duration'] || 0) / 60;
    this.description = src['activity'];
    this.movementId = movementId;
  }

  toJSON() {
    return this.movementId != null ? [
      'update-entry',
      this.timestamp,
      this.worker + ':' + this.project,
      this.amount,
      this.description,
      this.movementId
    ] : [
      'worked-hours',
      this.timestamp,
      this.worker,
      this.project,
      this.amount,
      this.description
    ];
  }
}
