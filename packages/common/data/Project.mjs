import { isDate, mustBe, withDoc } from '../lib/util.mjs';
import { AccountOwnedId } from '../index.mjs';
import { normaliseValue, Optional, propertyValue } from '@m-ld/m-ld';
import DomainEntity from './DomainEntity.mjs';

export default class Project extends DomainEntity {
  /** @type {import('jtd').Schema} */
  static SCHEMA = {
    properties: {
      '@id': { type: 'string' },
      '@type': mustBe('Project')
    },
    optionalProperties: {
      start: isDate,
      duration: {
        ...withDoc('The project duration, in minutes'),
        type: 'int16'
      },
      milestone: { elements: { type: 'string' } },
      ...DomainEntity.SCHEMA.optionalProperties
    }
  };

  /**
   * @param {import('@m-ld/m-ld').GraphSubject} src
   */
  static fromJSON(src) {
    // noinspection JSCheckFunctionSignatures
    return new Project({
      id: AccountOwnedId.fromReference(src),
      start: propertyValue(src, 'start', Optional, Date),
      duration: propertyValue(src, 'duration', Optional, Number),
      milestones: propertyValue(src, 'milestone', Array, String),
      ...DomainEntity.specFromJson(src)
    });
  }

  /**
   * @param {AccountOwnedId} spec.id
   * @param {Date} [spec.start]
   * @param {number} [spec.duration]
   * @param {string[]} [spec.milestones]
   * @param {string} [spec.externalId]
   */
  constructor(spec) {
    super(spec);
    this.id = spec.id;
    this.start = spec.start;
    this.duration = spec.duration;
    this.milestones = spec.milestones ?? [];
  }

  toJSON() {
    return {
      '@id': this.id.toIri(),
      '@type': 'Project',
      'start': normaliseValue(this.start),
      'duration': this.duration,
      'milestone': this.milestones,
      ...super.toJSON()
    };
  }
}