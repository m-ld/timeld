import { normaliseValue, Optional, propertyValue, Reference } from '@m-ld/m-ld';
import { isDate, isReference, mustBe, withDoc } from '../lib/util.mjs';
import DomainEntity from './DomainEntity.mjs';

export default class Entry extends DomainEntity {
  /** @type {import('jtd').Schema} */
  static SCHEMA = {
    properties: {
      '@type': mustBe('Entry'),
      session: {
        ...withDoc('The timekeeping session. ' +
          'When importing and exporting, this should be the timesheet ID'),
        ...isReference
      },
      activity: {
        ...withDoc('The activity description'),
        type: 'string'
      },
      'vf:provider': {
        ...withDoc('The entry provider, either as an account name ' +
          'e.g. `alice`, or an absolute URI, e.g. `http://alice.ex.org/#profile`'),
        ...isReference
      },
      start: isDate
    },
    optionalProperties: {
      '@id': {
        ...withDoc('The generated entry identity. ' +
          'When importing, do not set this field.'),
        type: 'string'
      },
      duration: {
        ...withDoc('The entry duration, in minutes'),
        type: 'int16'
      },
      ...DomainEntity.SCHEMA.optionalProperties
    }
  };

  /**
   * @param {import('@m-ld/m-ld').GraphSubject} src
   */
  static fromJSON(src) {
    // noinspection JSCheckFunctionSignatures
    return new Entry({
      seqNo: src['@id'].split('/').slice(-1)[0],
      sessionId: propertyValue(src, 'session', Reference)['@id'],
      activity: propertyValue(src, 'activity', String),
      providerId: propertyValue(src, 'vf:provider', Reference)['@id'],
      start: propertyValue(src, 'start', Date),
      duration: propertyValue(src, 'duration', Optional, Number),
      ...DomainEntity.specFromJson(src)
    });
  }

  /**
   * @param {string} spec.seqNo
   * @param {string} spec.sessionId
   * @param {string} spec.activity
   * @param {string} spec.providerId
   * @param {Date} spec.start
   * @param {number} [spec.duration] entry duration in minutes
   * @param {string} [spec.externalId]
   */
  constructor(spec) {
    super(spec);
    this.seqNo = spec.seqNo;
    this.sessionId = spec.sessionId;
    this.activity = spec.activity;
    this.providerId = spec.providerId;
    this.start = spec.start;
    this.duration = spec.duration;
  }

  toJSON() {
    return {
      '@id': `${this.sessionId}/${this.seqNo}`,
      '@type': 'Entry',
      'session': { '@id': this.sessionId },
      'activity': this.activity,
      'vf:provider': { '@id': this.providerId },
      'start': normaliseValue(this.start),
      'duration': this.duration,
      ...super.toJSON()
    };
  }
}