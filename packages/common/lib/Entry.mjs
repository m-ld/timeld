import { propertyValue } from '@m-ld/m-ld';
import { dateJsonLd } from './util.mjs';

export default class Entry {
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
      // TODO: Array is the only way to do Optional fields until m-ld-js v0.9
      duration: propertyValue(src, 'duration', Array, Number)[0]
    });
  }

  /**
   * @param {Date} start
   * @param {Date} end
   * @returns {number} duration in fractional minutes
   */
  static durationFromInterval(start, end) {
    // Round to the second then convert to minutes
    return Math.round((end.getTime() - start.getTime()) / 1000) / 60;
  }

  /**
   * @param {string} spec.seqNo
   * @param {string} spec.sessionId
   * @param {string} spec.activity
   * @param {string} spec.providerId
   * @param {Date} spec.start
   * @param {number} [spec.duration] entry duration in minutes
   */
  constructor(spec) {
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
      'session': { '@id': `${this.sessionId}` },
      'activity': this.activity,
      'vf:provider': { '@id': `${this.providerId}` },
      'start': dateJsonLd(this.start),
      'duration': this.duration
    };
  }
}