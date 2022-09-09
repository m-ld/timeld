import setupFetch from '@zeit/fetch';
import { domainRelativeIri, lastPathComponent, ResultsReadable } from 'timeld-common';
import { each } from 'rx-flowable';
import LOG from 'loglevel';

/**
 * @typedef {object} TikiConfig
 * @property {string} api API URL e.g. https://timesheet.dev3.evoludata.com/api/trackers/2/items
 * @property {string} token OAuth2 token
 */

/**
 * @implements Connector
 */
export default class TikiConnector {
  // noinspection JSUnusedGlobalSymbols
  /** Used by the gateway to provide the configuration constructor parameter */
  static configKey = 'tiki';

  // noinspection JSUnusedGlobalSymbols
  /** Used by the gateway to negotiate content types */
  static contentType = 'application/json+tiki';

  /**
   * Construct with configuration parameters
   * @param {TikiConfig} config
   * @param {GraphSubject} ext
   * @param {import('@zeit/fetch').Fetch} fetch injected fetch
   */
  constructor(config, ext, fetch = setupFetch()) {
    const missingConfig = ['api', 'token'].filter(k => !config[k]);
    if (missingConfig.length)
      throw new Error(`Missing Tiki config: ${missingConfig.join(', ')}`);

    const apiRoot = new URL(config.api);
    if (apiRoot.pathname.endsWith('/'))
      apiRoot.pathname = apiRoot.pathname.slice(0, -1);
    this.ext = ext;
    /**
     * @param {TimesheetTrackerItem} trackerItem
     * @returns {Promise<*>}
     */
    this.post = async trackerItem => {
      let url = apiRoot;
      if (trackerItem.itemId != null)
        url += `/${trackerItem.itemId}`;
      const res = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${(config.token)}`
        },
        method: 'POST',
        body: trackerItem.toString()
      });
      if (!res.ok)
        throw new Error(`Fetch failed with ${res.statusText}, tracker item:
          ${JSON.stringify(trackerItem)}`);
      const body = await res.text();
      if (body.length > 0)
        return JSON.parse(body);
    };
  }

  async syncTimesheet(tsId, state) {
    if (state) {
      await each(state.read({
        '@describe': '?entry', '@where': { '@id': '?entry', '@type': 'Entry' }
      }).consume, src => this.postTrackerItm(tsId, src));
    }
  }

  entryUpdate(tsId, update, state) {
    // Look for new Entries, and IDs for which we already have a tracker item
    return Promise.all(update['@insert'].map(async src => {
      if (src['@id'] in this.ext) {
        // Load the whole state for the entry
        // noinspection JSCheckFunctionSignatures
        src = await state.get(src['@id']);
        await this.post(new TimesheetTrackerItem(tsId, src, this.ext[src['@id']]));
      } else if (src['@type'] === 'Entry') {
        await this.postTrackerItm(tsId, src);
      }
    }));
  }

  async postTrackerItm(tsId, src) {
    // Inserting timesheet tracker item
    const res = await this.post(new TimesheetTrackerItem(tsId, src));
    // Store the item ID for the entry
    this.ext[src['@id']] = res['itemId'];
    LOG.debug('Posted tracker item', res['itemId'], 'from Entry', src['@id']);
  }

  reportTimesheet(tsId, state) {
    return new ResultsReadable(state.read({
      '@describe': '?entry', '@where': { '@id': '?id', '@type': 'Entry' }
    }).consume, {
      stringify: src => new TimesheetTrackerItem(tsId, src).toString(),
      separator: '\n'
    });
  }
}

class TimesheetTrackerItem {
  /**
   * @param {AccountOwnedId} tsId
   * @param {GraphSubject} src timeld Entry subject
   * @param {number} [itemId] Tracker item ID (for update only)
   */
  constructor(tsId, src, itemId) {
    this.itemId = itemId;
    this.tsUser = lastPathComponent(src['vf:provider']['@id']);
    this.tsProject = tsId.toRelativeIri();
    this.tsDescription = src['activity'];
    const start = new Date(src['start']['@value']);
    this.tsDate = this.tsStartTime = tikiTime(start);
    const duration = src['duration'];
    if (duration) {
      this.tsDuration = JSON.stringify({
        hours: Math.floor(duration / 60),
        minutes: Math.floor(duration % 60)
      });
      const end = new Date(start.getTime() + (duration * 60000));
      this.tsEndTime = tikiTime(end);
    }
    this.tsTimeldID = domainRelativeIri(src['@id'], tsId.toDomain());
    // Original source ID may be external
    this.tsSource = src['external']?.['@id'] || this.tsTimeldID;
  }

  toString() {
    const {
      tsUser, tsProject, tsDescription, tsStartTime, tsEndTime,
      tsDate, tsDuration, tsSource, tsTimeldID
    } = this;
    return Object.entries({
      tsUser, tsProject, tsDescription, tsStartTime, tsEndTime,
      tsDate, tsDuration, tsSource, tsTimeldID
    }).filter(([, value]) => value != null)
      .map(([field, value]) =>
        `fields[${encodeURIComponent(field)}]=${encodeURIComponent(value)}`)
      .join('&');
  }
}

function tikiTime(date) {
  return `${Math.floor(date.getTime() / 1000)}`;
}