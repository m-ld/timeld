import { BehaviorSubject } from 'rxjs';
import { dateJsonLd } from '../lib/util.mjs';

// noinspection JSUnusedGlobalSymbols
export class DeadRemotes {
  live = new BehaviorSubject(false);
  setLocal() {}
}

/**
 * @param {Date} start
 * @param {number} n
 * @returns {object}
 */
export const exampleEntryJson = (start, n = 1) => ({
  '@id': `session123/${n}`,
  '@type': 'Entry',
  'session': { '@id': 'session123' },
  'activity': 'testing',
  'vf:provider': { '@id': 'test' },
  'start': dateJsonLd(start),
  'duration': 60
});