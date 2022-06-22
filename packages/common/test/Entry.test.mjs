import { Entry } from '..';
import { exampleEntryJson } from './fixtures.mjs';

describe('Timesheet entry', () => {
  test('from JSON', () => {
    const entry = Entry.fromJSON(exampleEntryJson(new Date('2022-05-06T10:24:22.139Z')));
    expect(entry.seqNo).toBe('1');
    expect(entry.sessionId).toBe('session123');
    expect(entry.activity).toBe('testing');
    expect(entry.providerId).toBe('test');
    expect(entry.start.toISOString()).toBe('2022-05-06T10:24:22.139Z');
    expect(entry.duration).toBe(60);
  });
});