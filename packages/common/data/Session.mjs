import { dateJsonLd } from '../lib/util.mjs';
import { uuid } from '@m-ld/m-ld';

export default class Session {
  /**
   * @param {string} [id]
   * @param {Date} [startTime]
   * @param {number} [nextEntryId]
   */
  constructor(
    id = uuid(),
    startTime = new Date,
    nextEntryId = 1
  ) {
    this.id = id;
    this.startTime = startTime;
    this.nextEntryId = nextEntryId;
  }

  claimEntryId() {
    return this.nextEntryId++;
  }

  toJSON() {
    return {
      '@id': this.id,
      '@type': 'Session',
      start: dateJsonLd(this.startTime)
    };
  }
}