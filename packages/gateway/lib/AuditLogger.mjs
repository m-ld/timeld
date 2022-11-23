import { fetch as fetchImpl } from '@m-ld/io-web-runtime/dist/server/fetch';
import { validate } from 'jtd';
import { bufferTime, concatMap, lastValueFrom, Subject } from 'rxjs';
import LOG from 'loglevel';

/**
 * @typedef {object} _AuditConfig
 * @property {string} url
 * @property {headers} [string]
 * @property {string} [bufferTimeSpan]
 * @property {string} [maxBufferSize]
 * @typedef {import('@zeit/fetch').FetchOptions & _AuditConfig} AuditConfig
 */
const AUDIT_CONFIG_TYPE = /**@type {import('jtd').Schema}*/{
  properties: {
    url: { type: 'string' }
  },
  optionalProperties: {
    method: { enum: ['PUT', 'POST'] },
    headers: { type: 'string' },
    bufferTimeSpan: { type: 'string' },
    maxBufferSize: { type: 'string' }
  },
  additionalProperties: true
};

export default class AuditLogger {
  /**
   * @param {AuditConfig} [audit] audit logging HTTP options, if any
   * @param {import('@zeit/fetch').Fetch} fetch for injection
   */
  constructor({ audit }, fetch = fetchImpl) {
    this.events = new Subject();
    if (audit) {
      const options = AuditLogger.extractOptions(audit);
      LOG.debug('Audit options', options);
      // Set up events stream to logging service
      this.closed = lastValueFrom(this.events.pipe(
        bufferTime(options.bufferTimeSpan, null, options.maxBufferSize),
        concatMap(async jsons => {
          if (jsons.length) {
            const body = options.isNd ? AuditLogger.jsonNd(jsons) : JSON.stringify(jsons);
            const res = await fetch(options.url.toString(), { ...options.fetch, body });
            if (!res.ok)
              LOG.warn(`Cannot ship audit log to ${options.url.hostname}`, await res.text(), body);
          }
        })
      ), { defaultValue: null });
    } else {
      this.events.subscribe(event => LOG.debug('AUDIT', JSON.stringify(event)));
      this.closed = Promise.resolve();
    }
  }

  /**
   * @param {AuditConfig} audit audit logging HTTP options
   */
  static extractOptions(audit) {
    const config = { ...audit };
    const errors = validate(AUDIT_CONFIG_TYPE, config);
    if (errors.length > 0)
      throw new Error(`Bad audit config: ${errors}`);
    const url = new URL(config.url); // Also validates
    delete config.url;
    const bufferTimeSpan = Number(config.bufferTimeSpan || '2000');
    delete config.bufferTimeSpan;
    const maxBufferSize = Number(config.maxBufferSize || '10');
    delete config.maxBufferSize;
    if (typeof config.headers == 'string')
      config.headers = JSON.parse(/**@type string*/config.headers);
    const isNd = !!config.headers?.['Content-Type']?.startsWith('application/x-ndjson');
    config.method ||= 'POST';
    const fetch = /**@type import('@zeit/fetch').FetchOptions*/config;
    return { url, isNd, bufferTimeSpan, maxBufferSize, fetch };
  }

  /**
   * @param {object[]} jsons
   * @returns {string}
   */
  static jsonNd(jsons) {
    // Some logging services require a trailing newline
    return jsons.map(json => JSON.stringify(json)).join('\n') + '\n';
  }

  /**
   * @param {AccountOwnedId} tsId
   * @param {MeldUpdate} update
   */
  log(tsId, update) {
    this.events.next({ ...tsId.toJSON(), update });
  }

  async close() {
    this.events.complete();
    await this.closed;
  }
}