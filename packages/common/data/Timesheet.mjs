import { isReference, mustBe } from '../lib/util.mjs';
import { AccountOwnedId } from '../index.mjs';
import DomainEntity from './DomainEntity.mjs';
import { propertyValue, Reference } from '@m-ld/m-ld';

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
   * @param {GraphSubject} src
   */
  static fromJSON(src) {
    // noinspection JSCheckFunctionSignatures
    return new Timesheet({
      id: AccountOwnedId.fromReference(src),
      projects: propertyValue(src, 'project', Array, Reference),
      ...DomainEntity.specFromJson(src)
    });
  }

  /**
   * @param {AccountOwnedId} spec.id
   * @param {Reference[]} spec.projects
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