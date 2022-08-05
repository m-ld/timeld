// noinspection JSCheckFunctionSignatures, NpmUsedModulesInstalled

import { describe, expect, jest, test } from '@jest/globals';
import { dirSync } from 'tmp';
import { Env, UserKey } from 'timeld-common';
import { join } from 'path';
import { clone as meldClone, normaliseValue } from '@m-ld/m-ld';
import { MeldMemDown } from '@m-ld/m-ld/ext/memdown';
import { DeadRemotes } from 'timeld-common/test/fixtures.mjs';
import Gateway from '../lib/Gateway.mjs';
import rest from '../rest/index.mjs';
import request from 'supertest';

describe('Gateway REST API', () => {
  let tmpDir;
  let /**@type {Gateway}*/gateway;
  let /**@type {Notifier}*/notifier;

  beforeEach(async () => {
    tmpDir = dirSync({ unsafeCleanup: true });
    const env = new Env({ data: join(tmpDir.name, 'data') });
    const clone = jest.fn(config =>
      meldClone(new MeldMemDown(), DeadRemotes, config));
    const ablyApi = {
      createAppKey: jest.fn(),
      updateAppKey: jest.fn().mockImplementation(
        (keyid, { capability }) => Promise.resolve({
          id: keyid, key: `app.${keyid}:secret`, name: 'test@ex.org', capability, status: 0
        }))
    };
    const gwAblyKey = 'app.id:secret';
    gateway = new Gateway(env, {
      '@domain': 'ex.org',
      genesis: true,
      ...UserKey.generate(gwAblyKey).toConfig(gwAblyKey)
    }, clone, ablyApi, { log: jest.fn() });
    await gateway.initialise();
    // noinspection JSValidateTypes
    notifier = { sendActivationCode: jest.fn() };
  });

  afterEach(async () => {
    await gateway?.close();
    // noinspection JSUnresolvedFunction
    tmpDir.removeCallback();
  });

  test('gets JSON Type Definitions', async () => {
    const res = await request(rest({ gateway, notifier }))
      .get('/jtd')
      .accept('application/json');
    expect(res.body).toMatchObject({
      discriminator: '@type',
      mapping: expect.anything()
    });
  });

  describe('with user account', () => {
    beforeEach(async () => {
      await gateway.domain.write({
        '@id': 'test', '@type': 'Account', key: { '@id': '.keyid' } // User Key
      });
    });

    test('project report', async () => {
      await gateway.domain.write({
        '@insert': { '@id': 'test', project: { '@id': 'test/pr1', '@type': 'Project' } }
      });
      const res = await request(rest({ gateway, notifier }))
        .get('/api/rpt/test/own/pr1')
        .auth('test', 'app.keyid:secret')
        .expect('Content-Type', 'application/x-ndjson');
      expect(res.text.split('\n').map(JSON.parse)).toMatchObject([{
        '@id': 'test/pr1',
        '@type': 'Project'
      }]);
    });

    test('rejects without authorisation report', async () => {
      await gateway.domain.write({
        '@insert': { '@id': 'test', project: { '@id': 'test/pr1', '@type': 'Project' } }
      });
      await request(rest({ gateway, notifier }))
        .get('/api/rpt/test/own/pr1')
        .expect(401);
    });

    test('rejects bad authorisation report', async () => {
      await gateway.domain.write({
        '@insert': { '@id': 'test', project: { '@id': 'test/pr1', '@type': 'Project' } }
      });
      await request(rest({ gateway, notifier }))
        .get('/api/rpt/test/own/pr1')
        .auth('test', 'app.keyid:garbage')
        .expect(401);
    });

    test('rejects forbidden report', async () => {
      await request(rest({ gateway, notifier }))
        .get('/api/rpt/org1/own/pr1')
        .auth('test', 'app.keyid:secret')
        .expect(403);
    });

    test('import timesheet', async () => {
      const app = rest({ gateway, notifier });
      await request(app)
        .post('/api/import')
        .auth('test', 'app.keyid:secret')
        .send([{
          '@id': 'test/ts1', '@type': 'Timesheet'
        }, {
          '@type': 'Entry',
          session: { '@id': 'test/ts1' },
          activity: 'testing',
          'vf:provider': { '@id': 'test' },
          start: normaliseValue(new Date)
        }].map(JSON.stringify).join('\n'))
        .expect(200);
      const res = await request(app)
        .get('/api/rpt/test/own/ts1')
        .auth('test', 'app.keyid:secret')
        .expect('Content-Type', 'application/x-ndjson');
      expect(res.text.split('\n').map(JSON.parse)).toMatchObject([{
        '@id': 'test/ts1', '@type': 'Timesheet'
      }, {
        '@id': expect.stringMatching(/\w+\/1/),
        '@type': 'Entry',
        session: { '@id': expect.stringMatching(/\w+/) }
      }]);
    });

    test('rejects missing timesheet', async () => {
      const app = rest({ gateway, notifier });
      await request(app)
        .post('/api/import')
        .auth('test', 'app.keyid:secret')
        .send([{
          '@type': 'Entry',
          session: { '@id': 'test/ts1' },
          activity: 'testing',
          'vf:provider': { '@id': 'test' },
          start: normaliseValue(new Date)
        }].map(JSON.stringify).join('\n'))
        .expect(400);
    });
  });
});