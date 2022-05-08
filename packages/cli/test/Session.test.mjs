import { describe, expect, jest, test } from '@jest/globals';
import { BehaviorSubject } from 'rxjs';
import { clone, uuid } from '@m-ld/m-ld';
import { MeldMemDown } from '@m-ld/m-ld/dist/memdown';
import Session from '../lib/Session.mjs';
import { fileSync } from 'tmp';

// noinspection JSUnusedGlobalSymbols
class DeadRemotes {
  live = new BehaviorSubject(false);
  setLocal() {}
}

describe('CLI Session', () => {
  let /**@type string*/id;
  let /**@type import('@m-ld/m-ld').MeldClone*/meld;
  let /**@type import('tmp').FileSyncObject*/logFile;
  let /**@type Session*/session;

  beforeEach(async () => {
    id = uuid();
    // noinspection JSCheckFunctionSignatures
    meld = await clone(new MeldMemDown(), DeadRemotes, {
      '@id': id,
      '@domain': 'test.testing.timeld.org',
      genesis: true
    });
    // noinspection JSCheckFunctionSignatures
    logFile = fileSync();
    session = new Session({
      id, timesheet: 'test', providerId: 'http://alice.example/#profile',
      logLevel: 'DEBUG', logFile: logFile.name, meld
    });
  });

  afterEach(async () => {
    await meld.close();
  })

  test('add entry with duration adds session', async () => {
    const outLines = jest.fn(), errLines = jest.fn();
    await session.execute('add testing 1h', outLines, errLines);
    await expect(meld.get(id)).resolves.toMatchObject({
      '@type': 'Session',
      'start': {
        '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
        '@value': expect.toBeISODateString(Date.now())
      }
    });
    await expect(meld.get(`${id}/1`)).resolves.toMatchObject({
      '@type': 'Entry',
      'activity': 'testing',
      'duration': 60,
      'session': { '@id': id },
      'start': {
        '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
        '@value': expect.toBeISODateString(Date.now())
      },
      'vf:provider': { '@id': 'http://alice.example/#profile' }
    });
    expect(outLines).toHaveBeenCalledWith(expect.stringMatching(/#1: testing/));
  });

  test('add entry with start', async () => {
    const outLines = jest.fn(), errLines = jest.fn();
    await session.execute('add testing 1m --start 12pm', outLines, errLines);
    const expectStart = new Date();
    expectStart.setHours(12);
    expectStart.setMinutes(0);
    expectStart.setSeconds(0);
    await expect(meld.get(`${id}/1`)).resolves.toMatchObject({
      '@type': 'Entry',
      'activity': 'testing',
      'duration': 1,
      'session': { '@id': id },
      'start': {
        '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
        '@value': expect.toBeISODateString(expectStart.getTime())
      },
      'vf:provider': { '@id': 'http://alice.example/#profile' }
    });
  });

  test('add entry with end', async () => {
    const outLines = jest.fn(), errLines = jest.fn();
    await session.execute('add testing --end 1h from now', outLines, errLines);
    await expect(meld.get(`${id}/1`)).resolves.toMatchObject({
      '@type': 'Entry',
      'activity': 'testing',
      'duration': 60,
      'session': { '@id': id },
      'start': {
        '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
        '@value': expect.toBeISODateString(Date.now())
      },
      'vf:provider': { '@id': 'http://alice.example/#profile' }
    });
  });

  test('modify entry with new duration', async () => {
    const outLines = jest.fn(), errLines = jest.fn();
    await session.execute('add testing 1h', outLines, errLines);
    await session.execute('modify testing 2h', outLines, errLines);
    await expect(meld.get(`${id}/1`)).resolves.toMatchObject({
      '@type': 'Entry',
      'activity': 'testing',
      'duration': 120,
      'session': { '@id': id },
      'start': {
        '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
        '@value': expect.toBeISODateString(Date.now())
      },
      'vf:provider': { '@id': 'http://alice.example/#profile' }
    });
  });

  test('modify entry with new end', async () => {
    const outLines = jest.fn(), errLines = jest.fn();
    await session.execute('add testing', outLines, errLines);
    await session.execute('modify testing --end 2h from now', outLines, errLines);
    await expect(meld.get(`${id}/1`)).resolves.toMatchObject({
      '@type': 'Entry',
      'activity': 'testing',
      'duration': 120,
      'session': { '@id': id },
      'start': {
        '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
        '@value': expect.toBeISODateString(Date.now())
      },
      'vf:provider': { '@id': 'http://alice.example/#profile' }
    });
  });

  test('list one entry', async () => {
    const outLines = jest.fn(), errLines = jest.fn();
    await session.execute('add testing 1h', outLines, errLines);
    await session.execute('list', outLines, errLines);
    expect(outLines).toHaveBeenLastCalledWith(expect.stringMatching(
      /This session, entry #1: testing/));
  });
});