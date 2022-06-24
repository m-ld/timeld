import { isReference, mustBe, safeRefsIn } from '../lib/util.mjs';
import { AccountOwnedId } from '../index.mjs';

export default class Timesheet {
  /** @type {import('jtd').Schema} */
  static SCHEMA = {
    properties: {
      '@id': { type: 'string' },
      '@type': mustBe('Timesheet'),
      // TODO: loading from data also allows single reference
      project: { elements: isReference }
    }
  };

  /**
   * @param {import('@m-ld/m-ld').GraphSubject} src
   */
  static fromJSON(src) {
    // noinspection JSCheckFunctionSignatures
    return new Timesheet({
      id: AccountOwnedId.fromIri(src['@id']),
      projects: safeRefsIn(src, 'project')
    });
  }

  /**
   * @param {AccountOwnedId} spec.id
   * @param {import('@m-ld/m-ld').Reference[]} spec.projects
   */
  constructor(spec) {
    this.id = spec.id;
    this.projects = spec.projects ?? [];
  }

  toJSON() {
    return {
      '@id': this.id.toIri(),
      '@type': 'Timesheet',
      project: this.projects
    };
  }
}