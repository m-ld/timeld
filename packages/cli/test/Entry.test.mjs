import { Entry } from '../lib/Entry.mjs';

describe('Timesheet entry', () => {
  test('from JSON', () => {
    // noinspection JSCheckFunctionSignatures
    const entry = Entry.fromJSON({
      '@id': 'session123/1',
      'session': { '@id': 'session123' },
      'activity': 'testing',
      'vf:provider': { '@id': 'https://alice.example/profile#me' },
      'start': {
        '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
        '@value': '2022-05-06T10:24:22.139Z'
      },
      'duration': 60
    });
    expect(entry.seqNo).toBe('1');
    expect(entry.sessionId).toBe('session123');
    expect(entry.activity).toBe('testing');
    expect(entry.providerId).toBe('https://alice.example/profile#me');
    expect(entry.start.toISOString()).toBe('2022-05-06T10:24:22.139Z');
    expect(entry.duration).toBe(60);
    expect(entry.toString()).toBe('#1: testing (5/6/2022, 11:24:22 AM, 1 hour)');
  });
});