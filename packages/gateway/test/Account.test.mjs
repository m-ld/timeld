// noinspection NpmUsedModulesInstalled
import { describe, expect, jest, test } from '@jest/globals';
import { clone as meldClone, uuid } from '@m-ld/m-ld';
import { MemoryLevel } from 'memory-level';
import { DeadRemotes } from 'timeld-common/test/fixtures.mjs';
import { AccountOwnedId, AuthKey, BaseGateway, timeldContext, UserKey } from 'timeld-common';
import Account from '../lib/Account.mjs';

/**
 * NB: Account reads and writes are tested in the Gateway tests because they
 * need a live gateway m-ld domain.
 */
describe('Gateway account', () => {
  let gateway;
  let /**@type UserKey*/userKey;

  beforeAll(() => {
    userKey = UserKey.generate('appid.keyid:secret');
  });

  beforeEach(async () => {
    const config = {
      '@id': uuid(),
      '@domain': 'ex.org',
      '@context': timeldContext,
      genesis: true
    };
    // noinspection JSCheckFunctionSignatures
    const domain = await meldClone(new MemoryLevel(), DeadRemotes, config);
    gateway = new class extends BaseGateway {
      config = config;
      domain = domain;
      keyStore = {
        mintKey: jest.fn(),
        pingKey: jest.fn()
      };
    }('ex.org');
  });

  test('to & from JSON', () => {
    const acc = new Account(gateway, {
      name: 'test',
      emails: ['test@ex.org'],
      keyids: ['keyid'],
      admins: ['user1'],
      timesheets: [{ '@id': 'test/ts1' }]
    });
    expect(acc.name).toBe('test');
    expect(acc.emails).toEqual(new Set(['test@ex.org']));
    expect(acc.keyids).toEqual(new Set(['keyid']));
    expect(acc.admins).toEqual(new Set(['user1']));
    expect(acc.timesheets).toEqual([{ '@id': 'test/ts1' }]);
    expect(acc.toJSON()).toEqual({
      '@id': 'test',
      '@type': 'Account',
      email: ['test@ex.org'],
      'vf:primaryAccountable': [{ '@id': 'user1' }],
      key: [{ '@id': '.keyid' }],
      timesheet: [{ '@id': 'test/ts1' }],
      project: []
    });
  });

  test('activate', async () => {
    const acc = new Account(gateway, { name: 'test' });
    await gateway.domain.write(acc.toJSON());
    gateway.keyStore.mintKey.mockImplementation(name => Promise.resolve({
      key: AuthKey.fromString('appid.keyid:secret'), name, revoked: false
    }));
    const keyConfig = await acc.activate('test@ex.org');
    expect(gateway.keyStore.mintKey).toBeCalledWith('test@ex.org');
    expect(acc.emails).toEqual(new Set(['test@ex.org']));
    expect(acc.keyids).toEqual(new Set(['keyid']));
    expect(keyConfig.auth.key).toBe('appid.keyid:secret');
    await expect(gateway.domain.get('test')).resolves.toEqual({
      '@id': 'test',
      '@type': 'Account',
      email: 'test@ex.org',
      key: { '@id': '.keyid' }
    });
    await expect(gateway.domain.get('.keyid')).resolves.toEqual({
      '@id': '.keyid',
      '@type': 'UserKey',
      public: {
        '@type': 'http://www.w3.org/2001/XMLSchema#base64Binary',
        '@value': keyConfig.key.public
      },
      private: {
        '@type': 'http://www.w3.org/2001/XMLSchema#base64Binary',
        '@value': keyConfig.key.private
      },
      revoked: false
    });
  });

  test('authorise user for no particular owned object', async () => {
    await gateway.domain.write({
      '@id': 'test', '@type': 'Account', key: userKey.toJSON()
    });
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.keyStore.pingKey.mockImplementation(async (keyid, getAuthorisedTsIds) => {
      await expect(getAuthorisedTsIds()).resolves.toEqual([]);
      return false;
    });
    await expect(acc.authorise('keyid')).resolves.toMatchObject({});
    expect(gateway.keyStore.pingKey).toBeCalledWith('keyid', expect.any(Function));
  });

  test('authorise new timesheet in user account', async () => {
    await gateway.domain.write({
      '@id': 'test', '@type': 'Account', key: userKey.toJSON()
    });
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.keyStore.pingKey.mockImplementation(async (keyid, getAuthorisedTsIds) => {
      await expect(getAuthorisedTsIds()).resolves.toEqual(
        [AccountOwnedId.fromString('test/ts1@ex.org')]);
      return false;
    });
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('test/ts1@ex.org'), forWrite: 'Timesheet'
    })).resolves.toMatchObject({});
    expect(gateway.keyStore.pingKey).toBeCalledWith('keyid', expect.any(Function));
  });

  test('authorise existing timesheet in user account', async () => {
    await gateway.domain.write({
      '@id': 'test', '@type': 'Account', key: userKey.toJSON(),
      timesheet: [
        { '@id': 'test/ts1', '@type': 'Timesheet' },
        { '@id': 'test/ts2', '@type': 'Timesheet' }
      ]
    });
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.keyStore.pingKey.mockImplementation(async (keyid, getAuthorisedTsIds) => {
      await expect(getAuthorisedTsIds()).resolves.toEqual([
        AccountOwnedId.fromString('test/ts1@ex.org'),
        AccountOwnedId.fromString('test/ts2@ex.org')
      ]);
      return false;
    });
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('test/ts1@ex.org'), forWrite: 'Timesheet'
    })).resolves.toMatchObject({});
    expect(gateway.keyStore.pingKey).toBeCalledWith('keyid', expect.any(Function));
  });

  test('authorise new timesheet in organisation account', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', key: userKey.toJSON()
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'test' }
    }]);
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.keyStore.pingKey.mockImplementation(async (keyid, getAuthorisedTsIds) => {
      await expect(getAuthorisedTsIds()).resolves.toEqual([
        AccountOwnedId.fromString('org1/ts1@ex.org')
      ]);
      return false;
    });
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/ts1@ex.org'), forWrite: 'Timesheet'
    })).resolves.toMatchObject({});
    expect(gateway.keyStore.pingKey).toBeCalledWith('keyid', expect.any(Function));
  });

  test('authorise existing timesheet in organisation account', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', key: userKey.toJSON(),
      timesheet: { '@id': 'test/ts1', '@type': 'Timesheet' }
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'test' },
      timesheet: { '@id': 'org1/ts1', '@type': 'Timesheet' }
    }]);
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.keyStore.pingKey.mockImplementation(async (keyid, getAuthorisedTsIds) => {
      await expect(getAuthorisedTsIds()).resolves.toEqual([
        AccountOwnedId.fromString('test/ts1@ex.org'),
        AccountOwnedId.fromString('org1/ts1@ex.org')
      ]);
      return false;
    });
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/ts1@ex.org'), forWrite: 'Timesheet'
    })).resolves.toMatchObject({});
    expect(gateway.keyStore.pingKey).toBeCalledWith('keyid', expect.any(Function));
  });

  test('authorise to read organisation timesheet in user project', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', key: userKey.toJSON(),
      project: { '@id': 'test/pr1', '@type': 'Project' }
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'someone-else' },
      timesheet: { '@id': 'org1/ts1', '@type': 'Timesheet', project: { '@id': 'test/pr1' } }
    }]);
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.keyStore.pingKey.mockImplementation(() => Promise.resolve(false));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/ts1@ex.org')
    })).resolves.toMatchObject({});
  });

  test('authorise to read organisation timesheet in organisation project', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', key: userKey.toJSON()
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'test' },
      project: { '@id': 'org1/pr1', '@type': 'Project' }
    }, {
      '@id': 'org2', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'someone-else' },
      timesheet: { '@id': 'org2/ts1', '@type': 'Timesheet', project: { '@id': 'org1/pr1' } }
    }]);
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.keyStore.pingKey.mockImplementation(() => Promise.resolve(false));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org2/ts1@ex.org')
    })).resolves.toMatchObject({});
  });

  test('unauthorised to write timesheet in organisation project', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', key: userKey.toJSON(),
      project: { '@id': 'test/pr1', '@type': 'Project' }
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'someone-else' },
      timesheet: { '@id': 'org1/ts1', '@type': 'Timesheet', project: { '@id': 'test/pr1' } }
    }]);
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.keyStore.pingKey.mockImplementation(() => Promise.resolve(false));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/ts1@ex.org'), forWrite: 'Timesheet'
    })).rejects.toThrowError();
  });

  test('unauthorised if not an organisation admin', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', key: userKey.toJSON()
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'fred' },
      timesheet: { '@id': 'org1/ts1', '@type': 'Timesheet' }
    }]);
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.keyStore.pingKey.mockImplementation(() => Promise.resolve(false));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/ts1@ex.org'), forWrite: 'Timesheet'
    })).rejects.toThrowError();
  });

  test('unauthorised for create if not an organisation admin', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', key: userKey.toJSON()
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'fred' }
    }]);
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.keyStore.pingKey.mockImplementation(() => Promise.resolve(false));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/ts1@ex.org'), forWrite: 'Timesheet'
    })).rejects.toThrowError();
  });

  test('unauthorised if not registered keyid', async () => {
    const acc = new Account(gateway, {
      name: 'test', keyids: [], timesheets: [{ '@id': 'test/ts1' }]
    });
    gateway.keyStore.pingKey.mockImplementation(() => Promise.resolve(false));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('test/ts1@ex.org'), forWrite: 'Timesheet'
    })).rejects.toThrowError();
  });

  test('unauthorised if key store has no keyid', async () => {
    const acc = new Account(gateway, {
      name: 'test', keyids: ['keyid'], timesheets: [{ '@id': 'test/ts1' }]
    });
    gateway.keyStore.pingKey.mockImplementation(() => Promise.reject('Not Found'));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('test/ts1@ex.org'), forWrite: 'Timesheet'
    })).rejects.toThrowError();
  });

  test('unauthorised if key revoked', async () => {
    const acc = new Account(gateway, {
      name: 'test', keyids: ['keyid'], timesheets: [{ '@id': 'test/ts1' }]
    });
    gateway.keyStore.pingKey.mockImplementation(() => Promise.resolve(true));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('test/ts1@ex.org'), forWrite: 'Timesheet'
    })).rejects.toThrowError();
  });

  test('authorise project for read in user account', async () => {
    await gateway.domain.write({
      '@id': 'test', '@type': 'Account', key: userKey.toJSON(),
      project: { '@id': 'test/pr1', '@type': 'Project' }
    });
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.keyStore.pingKey.mockImplementation(() => Promise.resolve(false));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('test/pr1@ex.org')
    })).resolves.toMatchObject({});
  });

  test('authorise project for read in organisation account', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', key: userKey.toJSON()
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'test' },
      project: { '@id': 'org1/pr1', '@type': 'Project' }
    }]);
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.keyStore.pingKey.mockImplementation(() => Promise.resolve(false));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/pr1@ex.org')
    })).resolves.toMatchObject({});
  });
});