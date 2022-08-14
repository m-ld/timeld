import { Entry } from 'timeld-common';
import stringify from 'json-stringify-pretty-compact';
import { formatDate, formatDuration } from './util.mjs';

/**
 * @typedef {'default'|'JSON-LD'|'json-ld'|'ld'} EntryFormatName
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
  stringify: src => stringify(src)
};

/**
 * @param {EntryFormatName} format
 * @param {(id: string) => *} [getIndex]
 * @returns {Format}
 */
export function getSubjectFormat(format, getIndex) {
  return {
    'JSON-LD': JSON_LD_GRAPH,
    'json-ld': JSON_LD_GRAPH,
    ld: JSON_LD_GRAPH
  }[format] || new DefaultFormat(getIndex);
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
   * @param {(id: string) => *} [getIndex]
   */
  constructor(getIndex) {
    super();
    this.getIndex = getIndex;
  }

  /**
   * @param {import('@m-ld/m-ld').GraphSubject} src
   * @returns {Promise<string>}
   */
  async stringify(src) {
    const description = await this.subjectDescription(src);
    return this.getIndex ? `#${this.getIndex(src['@id'])}: ${description}` : description;
  }

  async subjectDescription(src) {
    try {
      switch (src['@type']) {
        case 'Entry':
          return this.entryDescription(Entry.fromJSON(src));
        default:
          return `${src['@type']} ${src['@id']}`;
      }
    } catch (e) {
      return `${src['@id']}: *** Malformed ${src['@type']}: ${e} ***`;
    }
  }

  entryDescription(entry) {
    return `Entry ${(DefaultFormat.entryLabel(entry))}`;
  }

  /**
   * @param {Entry} entry
   * @returns {string}
   */
  static entryLabel(entry) {
    return `"${entry.activity}" (${formatDate(entry.start)}` +
      (entry.duration != null ? `, ${formatDuration(entry.duration)}` : '') + `)`;
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
    function valStr(value) {
      if (value == null) {
        return '-';
      } else if (Array.isArray(value)) {
        return value.map(valStr).join(', ');
      } else if (typeof value == 'object') {
        if ('@id' in value) // Reference or subject
          return value['@id'];
        else if ('@value' in value) // Value object
          return value['@value']; // TODO: Normalise would be better
      } else {
        return value;
      }
    }
    return this.keys.map(key => valStr(src[key])).join('\t');
  }
}
