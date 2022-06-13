import { Entry } from './Entry.mjs';
import stringify from 'json-stringify-pretty-compact';

export const JSON_LD_GRAPH = {
  opening: '{ "@graph": [', closing: '] }', separator: ',\n', stringify
};

/**
 * @abstract
 * @implements Format
 */
class DisplayFormat {
  separator = '\n';
}

export class DefaultEntryFormat extends DisplayFormat {
  /**
   * @param {import('./TimesheetSession.mjs').TimesheetSession} session
   */
  constructor(session) {
    super();
    this.session = session;
  }

  /**
   * @param {import('@m-ld/m-ld').GraphSubject} src
   * @returns {Promise<string>}
   */
  async stringify(src) {
    try {
      const entry = Entry.fromJSON(src);
      const prefix = entry.sessionId === this.session.id ? 'This session' :
        await entry.sessionLabel(this.session.meld);
      return `${prefix}, entry ${entry.toString()}`;
    } catch (e) {
      return `${src['@id']}: *** Malformed entry: ${e} ***`;
    }
  }
}

export class TableFormat extends DisplayFormat {
  /**
   * @param {string} keys keys to pick out from the source
   */
  constructor(...keys) {
    super();
    this.keys = keys;
  }

  /**
   * @param {import('@m-ld/m-ld').GraphSubject} src
   * @returns {string}
   */
  stringify(src) {
    return this.keys.map(key => {
      if (src[key] == null)
        return '-';
      return src[key];
    }).join('\t');
  }
}