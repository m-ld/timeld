import { propertyValue } from '@m-ld/m-ld';
import { dateJsonLd, isDate, isReference, mustBe, optionalPropertyValue } from '../lib/util.mjs';

export default class Entry {
  /** @type {import('jtd').Schema} */
  static SCHEMA = {
    properties : {
      '@id': { type: 'string' },
      '@type': mustBe('Entry'),
      session: isReference,
      activity: { type: 'string' },
      'vf:provider': isReference,
      start: isDate
    },
    optionalProperties: {
      duration: { type: 'int16' },
      external: isReference
    }
  }
  /**
   * @param {import('@m-ld/m-ld').GraphSubject} src
   */
  static fromJSON(src) {
    // noinspection JSCheckFunctionSignatures
    return new Entry({
      seqNo: src['@id'].split('/').slice(-1)[0],
      // TODO: Use Reference in m-ld-js v0.9
      sessionId: propertyValue(src, 'session', Object)['@id'],
      activity: propertyValue(src, 'activity', String),
      providerId: propertyValue(src, 'vf:provider', Object)['@id'],
      start: propertyValue(src, 'start', Date),
      duration: optionalPropertyValue(src, 'duration', Number),
      externalId: optionalPropertyValue(src, 'external', Object)?.['@id']
    });
  }

  /**
   * @param {string} spec.seqNo
   * @param {string} spec.sessionId
   * @param {string} spec.activity
   * @param {string} spec.providerId
   * @param {Date} spec.start
   * @param {number} [spec.duration] entry duration in minutes
   * @param {string} [spec.externalId] entry duration in minutes
   */
  constructor(spec) {
    this.seqNo = spec.seqNo;
    this.sessionId = spec.sessionId;
    this.activity = spec.activity;
    this.providerId = spec.providerId;
    this.start = spec.start;
    this.duration = spec.duration;
    this.externalId = spec.externalId;
  }

  toJSON() {
    return {
      '@id': `${this.sessionId}/${this.seqNo}`,
      '@type': 'Entry',
      'session': { '@id': this.sessionId },
      'activity': this.activity,
      'vf:provider': { '@id': this.providerId },
      'start': dateJsonLd(this.start),
      'duration': this.duration,
      'external': this.externalId ? { '@id': this.externalId } : undefined
    };
  }
}