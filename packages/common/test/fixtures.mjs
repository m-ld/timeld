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
export const exampleEntryJson = (start = new Date, n = 1) => ({
  '@id': `session123/${n}`,
  '@type': 'Entry',
  'session': { '@id': 'session123' },
  'activity': 'testing',
  'vf:provider': { '@id': 'test' },
  'start': dateJsonLd(start),
  'duration': 60
});

export const exampleProjectJson = {
  '@id': 'test/pr1',
  '@type': 'Project'
};

export const exampleTimesheetJson = {
  '@id': 'test/ts1',
  '@type': 'Timesheet',
  project: [{ '@id': 'test/pr1' }]
};