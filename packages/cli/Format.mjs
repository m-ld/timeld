import { Entry } from './Entry.mjs';

/**
 * @typedef {object} Format
 * @property {string} [opening]
 * @property {string} [closing]
 * @property {string} separator
 * @property {(s: import('@m-ld/m-ld').GraphSubject) => string | Promise<string>} stringify
 */

export const jsonLdFormat = {
  opening: '[', closing: ']', separator: ',\n',
  stringify: JSON.stringify
};

/**
 * @implements Format
 */
export class DefaultFormat {
  separator = '\n';

  /**
   * @param {TimeldSession} session
   */
  constructor(session) {
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
      return `${prefix} entry ${entry.toString()}`;
    } catch (e) {
      return `${src['@id']}: *** Malformed entry: ${e} ***`;
    }
  }
}