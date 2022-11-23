// noinspection NpmUsedModulesInstalled
import { describe, expect, jest, test } from '@jest/globals';
import AuditLogger from '../lib/AuditLogger.mjs';
import { AccountOwnedId } from 'timeld-common';

describe('Audit Logger', () => {
  test('default options', () => {
    const opts = AuditLogger.extractOptions({ url: 'http://ex.org/' });
    expect(opts).toEqual({
      url: expect.any(URL),
      isNd: false,
      bufferTimeSpan: 2000,
      maxBufferSize: 10,
      fetch: { method: 'POST' }
    });
    expect(opts.url.toString()).toBe('http://ex.org/');
  });

  test('extract options', () => {
    // noinspection JSCheckFunctionSignatures
    const opts = AuditLogger.extractOptions({
      url: 'http://ex.org/',
      headers: '{"Content-Type":"application/x-ndjson"}',
      bufferTimeSpan: '1',
      maxBufferSize: '2',
      method: 'PUT'
    });
    expect(opts).toEqual({
      url: expect.any(URL),
      isNd: true,
      bufferTimeSpan: 1,
      maxBufferSize: 2,
      fetch: {
        headers: { 'Content-Type': 'application/x-ndjson' },
        method: 'PUT'
      }
    });
    expect(opts.url.toString()).toBe('http://ex.org/');
  });

  test('bad options', () => {
    // noinspection JSCheckFunctionSignatures
    expect(() => AuditLogger.extractOptions({})).toThrow();
    expect(() => AuditLogger.extractOptions({
      url: 'http://ex.org/',
      method: 'GET'
    })).toThrow();
  });

  describe('posting ndjson events', () => {
    let /**@type AuditLogger*/logger;
    let fetch;

    beforeEach(() => {
      // noinspection JSCheckFunctionSignatures
      fetch = jest.fn().mockResolvedValue({ ok: true });
      // noinspection JSCheckFunctionSignatures
      logger = new AuditLogger({
        audit: {
          url: 'http://log.org/',
          bufferTimeSpan: '1',
          headers: '{"Content-Type":"application/x-ndjson"}'
        }
      }, fetch);
    });

    afterEach(async () => {
      await logger.close();
    });

    test('posts an event', done => {
      // noinspection JSCheckFunctionSignatures update details not needed
      logger.log(AccountOwnedId.fromString('test/ts1@ex.org'), {
        '@insert': { '@id': 'foo' }
      });
      setTimeout(() => {
        try {
          const args = fetch.mock.calls[0];
          expect(args[0]).toBe('http://log.org/');
          expect(args[1].method).toBe('POST');
          expect(args[1].body.endsWith('\n')).toBe(true);
          expect(args[1].body.slice(0, -1).split('\n').map(JSON.parse)).toEqual([{
            gateway: 'ex.org',
            account: 'test',
            name: 'ts1',
            update: { '@insert': { '@id': 'foo' } }
          }]);
          done();
        } catch (e) {
          done(e);
        }
      }, 2);
    });

    test('batches events', done => {
      // noinspection JSCheckFunctionSignatures update details not needed
      logger.log(AccountOwnedId.fromString('test/ts1@ex.org'), {
        '@insert': { '@id': 'foo' }
      });
      // noinspection JSCheckFunctionSignatures update details not needed
      logger.log(AccountOwnedId.fromString('test/ts2@ex.org'), {
        '@insert': { '@id': 'bar' }
      });
      setTimeout(() => {
        try {
          const args = fetch.mock.calls[0];
          expect(args[0]).toBe('http://log.org/');
          expect(args[1].method).toBe('POST');
          expect(args[1].body.endsWith('\n')).toBe(true);
          expect(args[1].body.slice(0, -1).split('\n').map(JSON.parse)).toEqual([{
            gateway: 'ex.org', account: 'test', name: 'ts1',
            update: { '@insert': { '@id': 'foo' } }
          }, {
            gateway: 'ex.org', account: 'test', name: 'ts2',
            update: { '@insert': { '@id': 'bar' } }
          }]);
          done();
        } catch (e) {
          done(e);
        }
      }, 2);
    });
  });
});
