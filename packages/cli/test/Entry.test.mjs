import { Entry } from '../lib/Entry.mjs';

describe('Timesheet entry', () => {
  test('from JSON', () => {
    // noinspection JSCheckFunctionSignatures
    const startDateStr = '2022-05-06T10:24:22.139Z';
    const entry = Entry.fromJSON({
      '@id': 'session123/1',
      'session': { '@id': 'session123' },
      'activity': 'testing',
      'vf:provider': { '@id': 'https://alice.example/profile#me' },
      'start': {
        '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
        '@value': startDateStr
      },
      'duration': 60
    });
    expect(entry.seqNo).toBe('1');
    expect(entry.sessionId).toBe('session123');
    expect(entry.activity).toBe('testing');
    expect(entry.providerId).toBe('https://alice.example/profile#me');
    expect(entry.start.toISOString()).toBe(startDateStr);
    expect(entry.duration).toBe(60);
    expect(entry.toString()).toMatch(
      `#1: testing (${new Date(startDateStr).toLocaleString()}, 1 hour)`);
  });
});