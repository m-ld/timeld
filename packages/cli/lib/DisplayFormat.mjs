import { Entry } from 'timeld-common';
import stringify from 'json-stringify-pretty-compact';
import { formatDate, formatDuration, formatTimeAgo } from './util.mjs';
import { propertyValue } from '@m-ld/m-ld';

/**
 * @typedef {import('@m-ld/m-ld').Subject} Subject
 * @typedef {'default'|'JSON-LD'|'json-ld'|'ld'} EntryFormatName
 * @typedef {(entry: Entry) => string | Subject | Promise<Subject>} GetSession
 */

export const ENTRY_FORMAT_OPTIONS = {
  describe: 'Timesheet format to use',
  choices: /**@type {EntryFormatName[]}*/['default', 'JSON-LD', 'json-ld', 'ld'],
  default: 'default'
};

/** @type {Format} */
export const JSON_LD_GRAPH = {
  opening: '{ "@graph": [', closing: '] }',
  separator: ',\n',
  stringify
};

/**
 * @param {EntryFormatName} format
 * @param {GetSession} [getSession]
 * @returns {Format}
 */
export function getSubjectFormat(format, getSession) {
  return {
    'JSON-LD': JSON_LD_GRAPH,
    'json-ld': JSON_LD_GRAPH,
    ld: JSON_LD_GRAPH
  }[format] || new DefaultFormat(getSession);
}

/**
 * @abstract
 * @implements Format
 */
class DisplayFormat {
  separator = '\n';

  // noinspection JSCheckFunctionSignatures
  /**
   * @param {import('@m-ld/m-ld').GraphSubject} src
   * @returns {string | Promise<string>}
   */
  async stringify(src) {
    throw undefined;
  }
}

export class DefaultFormat extends DisplayFormat {
  /**
   * @param {GetSession} [getSession]
   */
  constructor(getSession) {
    super();
    this.getSession = getSession;
  }

  /**
   * @param {import('@m-ld/m-ld').GraphSubject} src
   * @returns {Promise<string>}
   */
  async stringify(src) {
    try {
      switch (src['@type']) {
        case 'Entry':
          return await this.entryDescription(Entry.fromJSON(src));
        default:
          return `${src['@type']} ${src['@id']}`;
      }
    } catch (e) {
      return `${src['@id']}: *** Malformed ${src['@type']}: ${e} ***`;
    }
  }

  async entryDescription(entry) {
    const sessionLabel = await this.sessionLabel(entry);
    const qualifier = sessionLabel ? ` (in ${sessionLabel})` : '';
    return `Entry ${(DefaultFormat.entryLabel(entry))}${qualifier}`;
  }

  /**
   * @param {Entry} entry
   * @returns {string}
   */
  static entryLabel(entry) {
    return `#${entry.seqNo}: ${entry.activity} (${formatDate(entry.start)}` +
      (entry.duration != null ? `, ${formatDuration(entry.duration)}` : '') + `)`;
  }

  async sessionLabel(entry) {
    if (this.getSession != null) {
      const session = await this.getSession(entry);
      if (typeof session == 'object') {
        // noinspection JSCheckFunctionSignatures
        const start = propertyValue(session, 'start', Date);
        return `Session ${formatTimeAgo(start)}`;
      }
      return session;
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
      const value = src[key];
      if (value == null) {
        return '-';
      } else if (typeof value == 'object') {
        if ('@id' in value) // Reference or subject
          return value['@id'];
        else if ('@value' in value) // Value object
          return value['@value']; // TODO: Normalise would be better
      } else {
        return value;
      }
    }).join('\t');
  }
}
