import { mustBe } from '../lib/util.mjs';
import { AccountOwnedId } from '../index.mjs';

export default class Project {
  /** @type {import('jtd').Schema} */
  static SCHEMA = {
    properties: {
      '@id': { type: 'string' },
      '@type': mustBe('Project')
    }
  }

  /**
   * @param {import('@m-ld/m-ld').GraphSubject} src
   */
  static fromJSON(src) {
    // noinspection JSCheckFunctionSignatures
    return new Project({
      id: AccountOwnedId.fromIri(src['@id'])
    });
  }

  /**
   * @param {AccountOwnedId} spec.id
   */
  constructor(spec) {
    this.id = spec.id;
  }

  toJSON() {
    return {
      '@id': this.id.toIri(),
      '@type': 'Project'
    };
  }
}