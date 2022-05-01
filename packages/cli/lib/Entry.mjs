import { propertyValue } from '@m-ld/m-ld';
import { format as timeAgo } from 'timeago.js';
import { dateJsonLd } from './util.mjs';

export class Entry {
  /**
   * @param {import('@m-ld/m-ld').GraphSubject} src
   */
  static fromJSON(src) {
    // noinspection JSCheckFunctionSignatures
    return new Entry({
      seqNo: src['@id'].split('/').slice(-1),
      sessionId: src['session']['@id'],
      task: propertyValue(src, 'task', String),
      start: propertyValue(src, 'start', Date),
      // TODO: Array is the only way to do Optional until m-ld-js 0.9
      end: propertyValue(src, 'end', Array, Date)[0]
    });
  }

  /**
   * @param {string} seqNo
   * @param {string} sessionId
   * @param {string} task
   * @param {Date} start
   * @param {Date} [end]
   */
  constructor({ seqNo, sessionId, task, start, end }) {
    this.seqNo = seqNo;
    this.sessionId = sessionId;
    this.task = task;
    this.start = start;
    this.end = end;
  }

  /**
   * @param {import('@m-ld/m-ld').MeldReadState} state
   * @returns {Promise<string>}
   */
  async sessionLabel(state) {
    const session = await state.get(this.sessionId, 'start');
    // noinspection JSCheckFunctionSignatures
    return 'Session ' + timeAgo(propertyValue(session, 'start', Date));
  }

  toJSON() {
    return {
      '@id': `${this.sessionId}/${this.seqNo}`,
      '@type': 'TimesheetEntry',
      session: { '@id': `${this.sessionId}` },
      task: this.task,
      start: dateJsonLd(this.start),
      end: this.end != null ? dateJsonLd(this.end) : undefined
    };
  }

  toString() {
    return `#${this.seqNo}: ${this.task} (${this.start.toLocaleString()}` +
      (this.end != null ? ` - ${this.end.toLocaleString()}` : ``) + `)`;
  }
}