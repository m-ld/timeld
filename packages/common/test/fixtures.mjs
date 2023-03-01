import { BehaviorSubject } from 'rxjs';
import { normaliseValue } from '@m-ld/m-ld';

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
  'start': normaliseValue(start),
  'duration': 60
});

export const exampleProjectJson = (start = new Date) => ({
  '@id': 'test/pr1',
  '@type': 'Project',
  'start': normaliseValue(start),
  'duration': 60,
  'milestone': ['1', '2']
});

export const exampleTimesheetJson = {
  '@id': 'test/ts1',
  '@type': 'Timesheet',
  project: [{ '@id': 'test/pr1' }]
};

/**
 * @param {string} received
 * @param {number} [approxTime]
 * @param {number} [delta]
 */
export function toBeISODateString(received, approxTime, delta = 1000) {
  if (typeof received != 'string') {
    return {
      pass: false,
      message: `Expected ${received} to be a valid ISO date string`
    };
  }
  const date = new Date(received);
  if (date.toISOString() !== received) {
    return {
      pass: false,
      message: `Expected ${received} to be a valid ISO date string`
    };
  }
  if (approxTime != null && Math.abs(date.getTime() - approxTime) > delta) {
    return {
      pass: false,
      message: `Expected ${received} to be close to ${new Date(approxTime)}`
    };
  }
  return {
    pass: true,
    message: `Expected ${received} not to be a valid ISO date string`
  };
}