import { describe, expect, jest, test } from '@jest/globals';
import { DeadRemotes, toBeISODateString } from 'timeld-common/test/fixtures.mjs';
import { clone, uuid } from '@m-ld/m-ld';
import { MeldMemDown } from '@m-ld/m-ld/dist/memdown';
import TimesheetSession from '../lib/TimesheetSession.mjs';
import { fileSync } from 'tmp';
import { writeFileSync } from 'fs';

expect.extend({ toBeISODateString });

function tmpFile() {
  // noinspection JSCheckFunctionSignatures
  return fileSync();
}

describe('CLI Session', () => {
  let /**@type string*/id;
  let /**@type import('@m-ld/m-ld').MeldClone*/meld;
  let /**@type import('tmp').FileSyncObject*/logFile;
  let /**@type TimesheetSession*/session;

  beforeEach(async () => {
    id = uuid();
    // noinspection JSCheckFunctionSignatures
    meld = await clone(new MeldMemDown(), DeadRemotes, {
      '@id': id, '@domain': 'test.testing.timeld.org', genesis: true
    });
    logFile = tmpFile();
    session = new TimesheetSession({
      id, timesheet: 'test', providerId: 'alice',
      logLevel: 'DEBUG', logFile: logFile.name, meld
    });
  });

  afterEach(async () => {
    await meld.close();
  });

  function expectEntry(activity, duration, start = Date.now()) {
    const expected = {
      '@type': 'Entry',
      'activity': activity,
      'session': { '@id': id },
      'start': {
        '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
        '@value': expect.toBeISODateString(start)
      },
      'vf:provider': { '@id': 'alice' }
    };
    if (duration != null)
      expected.duration = duration;
    return expected;
  }

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
    await expect(meld.get(`${id}/1`))
      .resolves.toMatchObject(expectEntry('testing', 60));
    expect(outLines).toHaveBeenCalledWith(expect.stringMatching(/#1: testing/));
  });

  test('add entry with start', async () => {
    const outLines = jest.fn(), errLines = jest.fn();
    await session.execute('add testing 1m --start 12pm', outLines, errLines);
    const expectStart = new Date();
    expectStart.setHours(12);
    expectStart.setMinutes(0);
    expectStart.setSeconds(0);
    await expect(meld.get(`${id}/1`))
      .resolves.toMatchObject(expectEntry('testing', 1, expectStart));
  });

  test('add entry with end', async () => {
    const outLines = jest.fn(), errLines = jest.fn();
    await session.execute('add testing --end 1h from now', outLines, errLines);
    await expect(meld.get(`${id}/1`))
      .resolves.toMatchObject(expectEntry('testing', 60));
  });

  test('modify entry with new duration', async () => {
    const outLines = jest.fn(), errLines = jest.fn();
    await session.execute('add testing 1h', outLines, errLines);
    await session.execute('modify testing 2h', outLines, errLines);
    await expect(meld.get(`${id}/1`))
      .resolves.toMatchObject(expectEntry('testing', 120));
  });

  test('modify entry with new end', async () => {
    const outLines = jest.fn(), errLines = jest.fn();
    await session.execute('add testing', outLines, errLines);
    await session.execute('modify testing --end 2h from now', outLines, errLines);
    await expect(meld.get(`${id}/1`))
      .resolves.toMatchObject(expectEntry('testing', 120));
  });

  test('list one entry', async () => {
    const outLines = jest.fn(), errLines = jest.fn();
    await session.execute('add testing 1h', outLines, errLines);
    await session.execute('list', outLines, errLines);
    expect(outLines).toHaveBeenLastCalledWith(expect.stringMatching(
      /Entry #1: testing/));
  });

  describe('import', () => {
    test('inline entry', async () => {
      const outLines = jest.fn(), errLines = jest.fn();
      await session.execute(
        'import --data \'{"activity": "trying it out", "start": "now"}\'',
        outLines, errLines);
      await expect(meld.get(`${id}/1`))
        .resolves.toMatchObject(expectEntry('trying it out'));
    });

    test('entries from file', async () => {
      const outLines = jest.fn(), errLines = jest.fn();
      const file = tmpFile();
      writeFileSync(file.name, JSON.stringify([
        { 'activity': 'testing1', 'start': 'now'},
        { 'activity': 'testing2', 'start': 'now'}
      ]));
      await session.execute(`${file.name} > import`, outLines, errLines);
      await expect(meld.get(`${id}/1`))
        .resolves.toMatchObject(expectEntry('testing1'));
      await expect(meld.get(`${id}/2`))
        .resolves.toMatchObject(expectEntry('testing2'));
    });

    test('entry from file', async () => {
      const outLines = jest.fn(), errLines = jest.fn();
      const file = tmpFile();
      writeFileSync(file.name, JSON.stringify({
        'activity': 'trying it out', 'start': 'now'
      }));
      await session.execute(`${file.name} > import $`, outLines, errLines);
      await expect(meld.get(`${id}/1`))
        .resolves.toMatchObject(expectEntry('trying it out'));
    });
  });
});
