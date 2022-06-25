import { dateJsonLd, isDate, mustBe, optionalPropertyValue } from '../lib/util.mjs';
import { AccountOwnedId } from '../index.mjs';
import { propertyValue } from '@m-ld/m-ld';

export default class Project {
  /** @type {import('jtd').Schema} */
  static SCHEMA = {
    properties: {
      '@id': { type: 'string' },
      '@type': mustBe('Project')
    },
    optionalProperties: {
      start: isDate,
      duration: { type: 'int16' },
      milestone: { elements: { type: 'string' } }
    }
  };

  /**
   * @param {import('@m-ld/m-ld').GraphSubject} src
   */
  static fromJSON(src) {
    // noinspection JSCheckFunctionSignatures
    return new Project({
      id: AccountOwnedId.fromIri(src['@id']),
      start: optionalPropertyValue(src, 'start', Date),
      duration: optionalPropertyValue(src, 'duration', Number),
      milestones: propertyValue(src, 'milestone', Array, String)
    });
  }

  /**
   * @param {AccountOwnedId} spec.id
   * @param {Date} [spec.start]
   * @param {number} [spec.duration]
   * @param {string[]} [spec.milestones]
   */
  constructor(spec) {
    this.id = spec.id;
    this.start = spec.start;
    this.duration = spec.duration;
    this.milestones = spec.milestones ?? [];
  }

  toJSON() {
    return {
      '@id': this.id.toIri(),
      '@type': 'Project',
      'start': dateJsonLd(this.start),
      'duration': this.duration,
      'milestone': this.milestones
    };
  }
}