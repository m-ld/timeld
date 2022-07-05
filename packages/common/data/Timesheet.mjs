import { isReference, mustBe, safeRefsIn } from '../lib/util.mjs';
import { AccountOwnedId } from '../index.mjs';
import DomainEntity from './DomainEntity.mjs';

export default class Timesheet extends DomainEntity {
  /** @type {import('jtd').Schema} */
  static SCHEMA = {
    properties: {
      '@id': { type: 'string' },
      '@type': mustBe('Timesheet')
    },
    optionalProperties: {
      // TODO: loading from data also allows single reference
      project: { elements: isReference },
      ...DomainEntity.SCHEMA.optionalProperties
    }
  };

  /**
   * @param {import('@m-ld/m-ld').GraphSubject} src
   */
  static fromJSON(src) {
    // noinspection JSCheckFunctionSignatures
    return new Timesheet({
      id: AccountOwnedId.fromReference(src),
      projects: safeRefsIn(src, 'project'),
      ...DomainEntity.specFromJson(src)
    });
  }

  /**
   * @param {AccountOwnedId} spec.id
   * @param {import('@m-ld/m-ld').Reference[]} spec.projects
   * @param {string} [spec.externalId]
   */
  constructor(spec) {
    super(spec);
    this.id = spec.id;
    this.projects = spec.projects ?? [];
  }

  toJSON() {
    return {
      '@id': this.id.toIri(),
      '@type': 'Timesheet',
      project: this.projects,
      ...super.toJSON()
    };
  }
}