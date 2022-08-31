// noinspection JSCheckFunctionSignatures,NpmUsedModulesInstalled

import { describe, expect, jest, test } from '@jest/globals';
import { clone as meldClone } from '@m-ld/m-ld';
import { MeldMemDown } from '@m-ld/m-ld/dist/memdown';
import Gateway from '../lib/Gateway.mjs';
import { CloneFactory, dateJsonLd, Env, timeldContext } from 'timeld-common';
import { dirSync } from 'tmp';
import { join } from 'path';
import Account from '../lib/Account.mjs';
import Cryptr from 'cryptr';
import { DeadRemotes, exampleEntryJson } from 'timeld-common/test/fixtures.mjs';
import { existsSync } from 'fs';
import { drain } from 'rx-flowable';
import { consume } from 'rx-flowable/consume';
import * as errors from '../rest/errors.mjs';

describe('Gateway', () => {
  let env;
  let cloneFactory;
  let tmpDir;
  let keyStore;

  beforeEach(() => {
    tmpDir = dirSync({ unsafeCleanup: true });
    env = new Env({ data: join(tmpDir.name, 'data') });
    cloneFactory = new class extends CloneFactory {
      clone = jest.fn((config) => {
        return meldClone(new MeldMemDown(), DeadRemotes, config);
      });
      reusableConfig(config) {
        // Random key for testing of reusable config
        const { tls } = config;
        // noinspection JSValidateTypes
        return { ...super.reusableConfig(config), tls };
      }
    }();
    keyStore = {
      createAppKey: jest.fn(),
      updateAppKey: jest.fn()
    };
  });

  afterEach(async () => {
    // noinspection JSUnresolvedFunction
    tmpDir.removeCallback();
  });

  test('throws if no auth config', async () => {
    await expect(async () => {
      const gateway = new Gateway(
        env, { '@domain': 'ex.org' }, cloneFactory, keyStore);
      return gateway.initialise();
    }).rejects.toBeDefined();
  });

  test('throws if no domain', async () => {
    await expect(async () => {
      const gateway = new Gateway(
        env, { auth: { key: 'id:secret' } }, cloneFactory, keyStore);
      return gateway.initialise();
    }).rejects.toBeDefined();
  });

  describe('initialised', () => {
    let /**@type Gateway*/gateway;

    beforeEach(async () => {
      gateway = new Gateway(env, {
        '@domain': 'ex.org',
        genesis: true,
        auth: { key: 'app.id:secret' },
        smtp: { auth: { user: 'smtp_user', pass: 'smtp_secret' } },
        tls: true
      }, cloneFactory, keyStore);
      await gateway.initialise();
    });

    afterEach(async () => {
      await gateway?.close();
    });

    test('has expected properties', () => {
      expect(gateway.domainName).toBe('ex.org');
      expect(gateway.ownedId('test', 'ts1')).toMatchObject({
        gateway: 'ex.org', account: 'test', name: 'ts1'
      });
      expect(gateway.ownedRefAsId({ '@id': 'test/ts1' })).toMatchObject({
        gateway: 'ex.org', account: 'test', name: 'ts1'
      });
    });

    test('has cloned the gateway domain', () => {
      expect(cloneFactory.clone.mock.calls).toMatchObject([[
        {
          '@id': expect.stringMatching(/\w+/),
          '@domain': 'ex.org',
          '@context': timeldContext,
          genesis: true, // has to be true because dead remotes
          auth: { key: 'app.id:secret' }
        },
        join(tmpDir.name, 'data', 'gw')
      ]]);
    });

    test('has registered account', async () => {
      await gateway.domain.write({
        '@id': 'test',
        '@type': 'Account',
        email: 'test@ex.org'
      });
      await expect(gateway.account('test')).resolves.toBeInstanceOf(Account);
      await expect(gateway.account('garbage')).resolves.toBeUndefined();
    });

    test('does not activate if email not registered', async () => {
      await gateway.domain.write({
        '@id': 'test',
        '@type': 'Account',
        email: 'test@ex.org'
      });
      await expect(gateway.activation('test', 'garbage@ex.org'))
        .rejects.toBeDefined();
    });

    test('activates if email is registered', async () => {
      await gateway.domain.write({
        '@id': 'test',
        '@type': 'Account',
        email: 'test@ex.org'
      });
      const activation = await gateway.activation('test', 'test@ex.org');
      expect(activation).toEqual({
        // Hex with sensible minimum length
        jwe: expect.stringMatching(/[\da-f]{32,}/),
        code: expect.stringMatching(/\d{6}/)
      });
    });

    test('allows non-existent account', async () => {
      const activation = await gateway.activation('test', 'test@ex.org');
      expect(activation).toEqual({
        // Hex with sensible minimum length
        jwe: expect.stringMatching(/[\da-f]{32,}/),
        code: expect.stringMatching(/\d{6}/)
      });
    });

    test('rejects garbage jwt', async () => {
      expect(() => gateway.verify('garbage')).toThrow();
    });

    test('verifies own decoded jwt', async () => {
      const activation = await gateway.activation('test', 'test@ex.org');
      const jwt = new Cryptr(activation.code).decrypt(activation.jwe);
      expect(jwt).not.toBe(activation.jwe); // Some encryption did happen
      expect(gateway.verify(jwt)).toMatchObject({ email: 'test@ex.org' });
    });

    test('gets timesheet config', async () => {
      const tsConfig = await gateway.timesheetConfig(
        gateway.ownedId('test', 'ts1'));
      expect(tsConfig).toEqual({
        '@domain': 'ts1.test.ex.org',
        genesis: false,
        tls: true
      });
      // Gateway API secrets NOT present
      expect(tsConfig['auth']).toBeUndefined();
      expect(tsConfig['smtp']).toBeUndefined();
      expect(tsConfig['tls']).toBe(true);

      // Expect to have created the timesheet genesis clone
      expect(cloneFactory.clone.mock.lastCall).toMatchObject([
        {
          '@id': expect.stringMatching(/\w+/),
          '@domain': 'ts1.test.ex.org',
          '@context': timeldContext,
          genesis: true,
          auth: { key: 'app.id:secret' },
          tls: true
        },
        join(tmpDir.name, 'data', 'tsh', 'test', 'ts1')
      ]);
      await expect(gateway.domain.get('test')).resolves.toEqual({
        '@id': 'test',
        timesheet: { '@id': 'test/ts1' }
      });
      expect(existsSync(join(tmpDir.name, 'data', 'tsh', 'test', 'ts1')));
    });

    test('clones a new timesheet', async () => {
      await gateway.domain.write({
        '@id': 'test', timesheet: { '@id': 'test/ts1', '@type': 'Timesheet' }
      });
      // Doing another write awaits all follow handlers
      await gateway.domain.write({});
      // The gateway should attempt to clone the timesheet.
      // (It will fail due to dead remotes, but we don't care.)
      expect(cloneFactory.clone.mock.lastCall).toMatchObject([
        {
          '@id': expect.stringMatching(/\w+/),
          '@domain': 'ts1.test.ex.org',
          '@context': timeldContext,
          genesis: false,
          auth: { key: 'app.id:secret' },
          tls: true
        },
        join(tmpDir.name, 'data', 'tsh', 'test', 'ts1')
      ]);
    });

    test('removes a timesheet', async () => {
      const tsId = gateway.ownedId('test', 'ts1');
      await gateway.timesheetConfig(tsId);
      await gateway.domain.write({
        '@delete': { '@id': 'test', timesheet: { '@id': 'test/ts1', '@type': 'Timesheet' } }
      });
      // Doing another write awaits all follow handlers
      await gateway.domain.write({});
      expect(!existsSync(join(tmpDir.name, 'data', 'tsh', 'test', 'ts1')));
      expect(gateway.timesheetDomains['ts1.test.ex.org']).toBeUndefined();
      // Cannot re-use a timesheet name
      await expect(gateway.timesheetConfig(tsId))
        .rejects.toThrowError();
    });

    test('reports on a timesheet', async () => {
      const tsId = gateway.ownedId('test', 'ts1');
      await gateway.timesheetConfig(tsId);
      await gateway.timesheetDomains['ts1.test.ex.org']
        .write(exampleEntryJson(new Date));
      const report = await gateway.report(tsId);
      await expect(drain(report)).resolves.toMatchObject([
        { '@id': 'test/ts1', '@type': 'Timesheet' },
        { '@id': 'session123/1', '@type': 'Entry' } // Plus a lot more
      ]);
    });

    test('reports on non-existent timesheet', async () => {
      const tsId = gateway.ownedId('test', 'garbage');
      await expect(gateway.report(tsId)).rejects.toThrowError(errors.NotFoundError);
    });

    test('reports on a project', async () => {
      await gateway.timesheetConfig(gateway.ownedId('test', 'ts1'));
      await gateway.timesheetConfig(gateway.ownedId('test', 'ts2'));
      await gateway.domain.write({
        '@insert': [ // brittle use of direct write
          { '@id': 'test', project: { '@id': 'test/pr1', '@type': 'Project' } },
          { '@id': 'test/ts1', project: { '@id': 'test/pr1' } },
          { '@id': 'test/ts2', project: { '@id': 'test/pr1' } }
        ]
      });
      await Promise.all(['ts1', 'ts2'].map((id, i) =>
        gateway.timesheetDomains[`${id}.test.ex.org`].write(exampleEntryJson(new Date, i))));
      const report = await gateway.report(gateway.ownedId('test', 'pr1'));
      await expect(drain(report)).resolves.toMatchObject([
        { '@id': 'test/pr1', '@type': 'Project' },
        { '@id': 'test/ts1', '@type': 'Timesheet' },
        { '@id': 'session123/0', '@type': 'Entry' },
        { '@id': 'test/ts2', '@type': 'Timesheet' },
        { '@id': 'session123/1', '@type': 'Entry' }
      ]);
    });

    test('refuses unauthorised read', async () => {
      await gateway.domain.write({
        '@id': 'test',
        '@type': 'Account',
        email: 'test@ex.org'
      });
      const acc = await gateway.account('test');
      await expect(acc.read({ '@describe': 'bob' }))
        .rejects.toThrowError();
      await expect(acc.read({ '@select': '?v', '@where': { '@id': 'bob' } }))
        .rejects.toThrowError();
    });

    describe('with account', () => {
      let /**@type {Account}*/acc;

      beforeEach(async () => {
        await gateway.domain.write({
          '@id': 'test',
          '@type': 'Account',
          email: 'test@ex.org'
        });
        acc = await gateway.account('test');
      });

      describe('reads and writes', () => {
        test('reads from user account', async () => {
          expect(await drain(await acc.read({
            '@select': '?e', '@where': { '@id': 'test', '@type': 'Account', email: '?e' }
          }))).toMatchObject([{ '?e': 'test@ex.org' }]);
        });

        test('refuses unauthorised write', async () => {
          await expect(acc.write({ foo: 'bar' }))
            .rejects.toThrowError();
          await expect(acc.write({ '@id': 'bob', email: 'bob@bob.com' }))
            .rejects.toThrowError();
        });

        test('writes email to existing user account', async () => {
          await acc.write({
            '@insert': { '@id': 'test', email: 'test2@ex.org' },
            '@where': { '@id': 'test', '@type': 'Account' }
          });
          expect((await gateway.account('test')).emails)
            .toEqual(new Set(['test@ex.org', 'test2@ex.org']));
        });

        test('adds timesheet to user account', async () => {
          await acc.write({
            '@insert': { '@id': 'test', timesheet: { '@id': 'test/ts1', '@type': 'Timesheet' } },
            '@where': { '@id': 'test', '@type': 'Account' }
          });
          expect((await gateway.account('test')).timesheets)
            .toEqual([{ '@id': 'test/ts1' }]);
          expect(gateway.timesheetDomains['ts1.test.ex.org']).toBeDefined();
        });

        test('removes timesheet from user account', async () => {
          await acc.write({
            '@insert': { '@id': 'test', timesheet: { '@id': 'test/ts1', '@type': 'Timesheet' } },
            '@where': { '@id': 'test', '@type': 'Account' }
          });
          await acc.write({
            '@delete': {
              '@id': 'test',
              timesheet: { '@id': 'test/ts1', '@type': 'Timesheet', '?p': '?o' }
            },
            '@where': {
              '@id': 'test', '@type': 'Account',
              timesheet: { '@id': 'test/ts1', '?p': '?o' }
            }
          });
          expect((await gateway.account('test')).timesheets)
            .toEqual([]);
          expect(gateway.timesheetDomains['ts1.test.ex.org']).toBeUndefined();
        });

        test('cannot orphan timesheet', async () => {
          await acc.write({
            '@insert': { '@id': 'test', timesheet: { '@id': 'test/ts1', '@type': 'Timesheet' } },
            '@where': { '@id': 'test', '@type': 'Account' }
          });
          await expect(acc.write({
            '@delete': { '@id': 'test', timesheet: { '@id': 'test/ts1' } },
            '@where': { '@id': 'test', '@type': 'Account', timesheet: { '@id': 'test/ts1' } }
          })).rejects.toThrow();
        });

        test('writes a new organisation', async () => {
          await acc.write({
            '@id': 'org1',
            '@type': 'Account',
            'vf:primaryAccountable': { '@id': 'test' }
          });
          await expect(gateway.account('org1'))
            .resolves.toBeDefined();
          // Cannot re-create an existing org
          await expect(acc.write({
            '@id': 'org1',
            '@type': 'Account',
            'vf:primaryAccountable': { '@id': 'test' }
          })).rejects.toThrowError();
        });

        test('removes an organisation', async () => {
          await acc.write({
            '@id': 'org1',
            '@type': 'Account',
            'vf:primaryAccountable': { '@id': 'test' }
          });
          await acc.write({
            '@delete': { '@id': 'org1' },
            '@where': {
              '@id': 'org1',
              '@type': 'Account',
              'vf:primaryAccountable': { '@id': 'test' }
            }
          });
          await expect(gateway.account('org1'))
            .resolves.toBeUndefined();
        });

        test.todo('cascade deletes projects & timesheets');

        test('inserts an organisation detail', async () => {
          await acc.write({
            '@id': 'org1',
            '@type': 'Account',
            'vf:primaryAccountable': { '@id': 'test' }
          });
          await acc.write({
            '@insert': {
              '@id': 'org1',
              'vf:primaryAccountable': { '@id': 'other' }
            },
            '@where': {
              '@id': 'org1',
              '@type': 'Account',
              'vf:primaryAccountable': { '@id': 'test' }
            }
          });
          expect((await gateway.account('org1')).admins)
            .toEqual(new Set(['test', 'other']));
        });

        test('cannot insert project if not exists', async () => {
          await acc.write({
            '@insert': { '@id': 'test', timesheet: { '@id': 'test/ts1', '@type': 'Timesheet' } },
            '@where': { '@id': 'test', '@type': 'Account' }
          });
          await expect(acc.write({
            '@insert': { '@id': 'test/ts1', project: { '@id': 'test/pr1' } },
            '@where': { '@id': 'test', '@type': 'Account', timesheet: { '@id': 'test/ts1' } }
          })).rejects.toThrow();
        });

        test('writes timesheet projects', async () => {
          // Inserting the timesheet
          await acc.write({
            '@insert': { '@id': 'test', timesheet: { '@id': 'test/ts1', '@type': 'Timesheet' } },
            '@where': { '@id': 'test', '@type': 'Account' }
          });
          // Inserting the project
          await acc.write({
            '@insert': { '@id': 'test', project: { '@id': 'test/pr1', '@type': 'Project' } },
            '@where': { '@id': 'test', '@type': 'Account' }
          });
          // Inserting project link into timesheet
          await acc.write({
            '@insert': { '@id': 'test/ts1', project: { '@id': 'test/pr1' } },
            '@where': { '@id': 'test', '@type': 'Account', timesheet: { '@id': 'test/ts1' } }
          });
          expect(await drain(await acc.read({
            '@select': '?t', '@where': [
              { '@id': 'test', '@type': 'Account', project: { '@id': 'test/pr1' } },
              { '@id': '?t', '@type': 'Timesheet', project: { '@id': 'test/pr1' } }
            ]
          }))).toMatchObject([{ '?t': { '@id': 'test/ts1' } }]);
        });
      });

      describe('import', () => {
        test('inserts timesheet', async () => {
          await expect(acc.import(consume([{
            '@id': 'test/ts1', '@type': 'Timesheet'
          }]))).resolves.not.toThrow();
          await expect(gateway.domain.get('test')).resolves.toMatchObject({
            timesheet: { '@id': 'test/ts1' }
          });
          await expect(gateway.domain.get('test/ts1')).resolves.toMatchObject({
            '@type': 'Timesheet'
          });
        });

        test('inserts timesheet to org', async () => {
          await acc.write({
            '@id': 'org1',
            '@type': 'Account',
            'vf:primaryAccountable': { '@id': 'test' }
          });
          await expect(acc.import(consume([{
            '@id': 'org1/ts1', '@type': 'Timesheet'
          }]))).resolves.not.toThrow();
          await expect(gateway.domain.get('org1')).resolves.toMatchObject({
            timesheet: { '@id': 'org1/ts1' }
          });
          await expect(gateway.domain.get('org1/ts1')).resolves.toMatchObject({
            '@type': 'Timesheet'
          });
        });

        test('updates timesheet', async () => {
          await acc.import(consume([{
            '@id': 'test/ts1', '@type': 'Timesheet'
          }]));
          // Re-get the account because of the change to its data
          acc = await gateway.account('test');
          await expect(acc.import(consume([{
            '@id': 'test/ts1', '@type': 'Timesheet', project: [{ '@id': 'test/pr1' }]
          }]))).resolves.not.toThrow();
          await expect(gateway.domain.get('test/ts1')).resolves.toMatchObject({
            '@type': 'Timesheet', project: { '@id': 'test/pr1' }
          });
        });

        test('rejects malformed timesheet', async () => {
          await expect(acc.import(consume([{
            '@id': 'ts1', '@type': 'Timesheet'
          }]))).rejects.toThrowError(errors.BadRequestError);
          await expect(acc.import(consume([{
            '@id': 'test/ts1!', '@type': 'Timesheet'
          }]))).rejects.toThrowError(errors.BadRequestError);
          await expect(acc.import(consume([{
            '@id': 'test/ts1', '@type': 'Garbage'
          }]))).rejects.toThrowError(errors.BadRequestError);
          await expect(acc.import(consume([{
            '@id': 'test/ts1'
          }]))).rejects.toThrowError(errors.BadRequestError);
          await expect(acc.import(consume([{
            '@id': 'test/ts1', '@type': 'Timesheet', project: 'garbage'
          }]))).rejects.toThrowError(errors.BadRequestError);
        });

        test('rejects unauthorised timesheet', async () => {
          await expect(acc.import(consume([{
            '@id': 'org/ts1', '@type': 'Timesheet'
          }]))).rejects.toThrowError(errors.ForbiddenError);
        });

        test.todo('rejects change to external timesheet ID');

        test('inserts project', async () => {
          await expect(acc.import(consume([{
            '@id': 'test/pr1', '@type': 'Project'
          }]))).resolves.not.toThrow();
          await expect(gateway.domain.get('test')).resolves.toMatchObject({
            project: { '@id': 'test/pr1' }
          });
          await expect(gateway.domain.get('test/pr1')).resolves.toMatchObject({
            '@type': 'Project'
          });
        });

        test('updates project', async () => {
          await gateway.domain.write({
            '@id': 'test', project: { '@id': 'test/pr1', '@type': 'Project' }
          });
          // Re-get the account because of the change to its data
          acc = await gateway.account('test');
          await expect(acc.import(consume([{
            '@id': 'test/pr1', '@type': 'Project', duration: 10
          }]))).resolves.not.toThrow();
          await expect(gateway.domain.get('test/pr1')).resolves.toMatchObject({
            '@type': 'Project', duration: 10
          });
        });

        test('rejects malformed project', async () => {
          await expect(acc.import(consume([{
            '@id': 'pr1', '@type': 'Project'
          }]))).rejects.toThrowError(errors.BadRequestError);
          await expect(acc.import(consume([{
            '@id': 'test/pr1!', '@type': 'Project'
          }]))).rejects.toThrowError(errors.BadRequestError);
          await expect(acc.import(consume([{
            '@id': 'test/pr1', '@type': 'Project', duration: 'garbage'
          }]))).rejects.toThrowError(errors.BadRequestError);
        });

        test('rejects unauthorised project', async () => {
          await expect(acc.import(consume([{
            '@id': 'org/pr1', '@type': 'Project'
          }]))).rejects.toThrowError(errors.ForbiddenError);
        });

        test.todo('rejects change external project ID');

        test('inserts entries', async () => {
          await expect(acc.import(consume([{
            '@id': 'test/ts1', '@type': 'Timesheet'
          }, {
            '@type': 'Entry',
            session: { '@id': 'test/ts1' },
            activity: 'testing',
            'vf:provider': { '@id': 'test' },
            start: dateJsonLd(new Date)
          }]))).resolves.not.toThrow();
          const report = await gateway.report(gateway.ownedId('test', 'ts1'));
          await expect(drain(report)).resolves.toMatchObject([
            { '@id': 'test/ts1', '@type': 'Timesheet' },
            {
              '@id': expect.stringMatching(/\w+\/1/),
              '@type': 'Entry',
              session: { '@id': expect.stringMatching(/\w+/) }
            } // Plus a lot more
          ]);
        });

        test('rejects malformed entry', async () => {
          await acc.import(consume([{
            '@id': 'test/ts1', '@type': 'Timesheet'
          }]));
          // Missing details
          await expect(acc.import(consume([{
            '@type': 'Entry'
          }]))).rejects.toThrow();
          // Malformed date
          await expect(acc.import(consume([{
            '@type': 'Entry',
            session: { '@id': 'test/ts1' },
            activity: 'testing',
            'vf:provider': { '@id': 'test' },
            start: dateJsonLd(new Date)['@value']
          }]))).rejects.toThrow();
        });

        test('rejects orphaned entry', async () => {
          await expect(acc.import(consume([{
            '@type': 'Entry',
            session: { '@id': 'test/ts1' }, // Does not exist
            activity: 'testing',
            'vf:provider': { '@id': 'test' },
            start: dateJsonLd(new Date)
          }]))).rejects.toThrow();
        });

        test('cannot specify entry ID', async () => {
          await expect(acc.import(consume([{
            '@id': 'test/ts1', '@type': 'Timesheet'
          }, {
            '@id': 'garbage',
            '@type': 'Entry',
            session: { '@id': 'test/ts1' },
            activity: 'testing',
            'vf:provider': { '@id': 'test' },
            start: dateJsonLd(new Date)
          }]))).rejects.toThrow();
        });

        test('merges using external ID', async () => {
          await acc.import(consume([{
            '@id': 'test/ts1', '@type': 'Timesheet'
          }, {
            '@type': 'Entry',
            session: { '@id': 'test/ts1' },
            activity: 'testing',
            'vf:provider': { '@id': 'test' },
            start: dateJsonLd(new Date),
            external: { '@id': 'http://ex.org/ts/entry/1' }
          }]));
          await acc.import(consume([{
            '@type': 'Entry',
            session: { '@id': 'test/ts1' },
            activity: 'more testing',
            'vf:provider': { '@id': 'test' },
            start: dateJsonLd(new Date),
            external: { '@id': 'http://ex.org/ts/entry/1' }
          }]));
          const report = await gateway.report(gateway.ownedId('test', 'ts1'));
          await expect(drain(report)).resolves.toMatchObject([
            { '@id': 'test/ts1', '@type': 'Timesheet' },
            {
              '@id': expect.stringMatching(/\w+\/1/),
              '@type': 'Entry',
              activity: 'more testing'
            } // Plus a lot more
          ]);
        });
      });
    });
  });
});