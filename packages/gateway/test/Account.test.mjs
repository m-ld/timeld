import { describe, expect, jest, test } from '@jest/globals';
import { clone as meldClone, uuid } from '@m-ld/m-ld';
import { MeldMemDown } from '@m-ld/m-ld/dist/memdown';
import { DeadRemotes } from 'timeld-common/test/fixtures.mjs';
import { AccountOwnedId, BaseGateway, timeldContext } from 'timeld-common';
import Account from '../lib/Account.mjs';

/**
 * NB: Account reads and writes are tested in the Gateway tests because they
 * need a live gateway m-ld domain.
 */
describe('Gateway account', () => {
  let gateway;

  beforeEach(async () => {
    const config = {
      '@id': uuid(),
      '@domain': 'ex.org',
      '@context': timeldContext,
      genesis: true
    };
    // noinspection JSCheckFunctionSignatures
    const domain = await meldClone(new MeldMemDown(), DeadRemotes, config);
    gateway = new class extends BaseGateway {
      config = config;
      domain = domain;
      ablyApi = {
        createAppKey: jest.fn(),
        updateAppKey: jest.fn()
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
      keyid: ['keyid'],
      timesheet: [{ '@id': 'test/ts1' }],
      project: []
    });
  });

  test('activate', async () => {
    const acc = new Account(gateway, { name: 'test' });
    gateway.ablyApi.createAppKey.mockImplementation(
      ({ name, capability }) => Promise.resolve({
        id: 'keyid', key: 'appid.keyid:secret', name, capability
      }));
    const key = await acc.activate('test@ex.org');
    expect(gateway.ablyApi.createAppKey).toBeCalledWith({
      name: 'test@ex.org',
      capability: { 'ex.org:notify': ['subscribe'] }
    });
    expect(acc.emails).toEqual(new Set(['test@ex.org']));
    expect(acc.keyids).toEqual(new Set(['keyid']));
    expect(key).toBe('appid.keyid:secret');
    await expect(gateway.domain.get('test')).resolves.toEqual({
      '@id': 'test',
      '@type': 'Account',
      email: 'test@ex.org',
      keyid: 'keyid'
    });
  });

  test('authorise user for no particular owned object', async () => {
    await gateway.domain.write({
      '@id': 'test', '@type': 'Account', keyid: 'keyid'
    });
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.ablyApi.updateAppKey.mockImplementation((keyid, { capability }) => Promise.resolve({
      id: keyid, key: 'appid.keyid:secret', name: 'test@ex.org', capability
    }));
    await expect(acc.authorise('keyid')).resolves.toMatchObject({});
    expect(gateway.ablyApi.updateAppKey).toBeCalledWith('keyid', {
      capability: { 'ex.org:notify': ['subscribe'] }
    });
  });

  test('authorise new timesheet in user account', async () => {
    await gateway.domain.write({
      '@id': 'test', '@type': 'Account', keyid: 'keyid'
    });
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.ablyApi.updateAppKey.mockImplementation((keyid, { capability }) => Promise.resolve({
      id: keyid, key: 'appid.keyid:secret', name: 'test@ex.org', capability
    }));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('test/ts1@ex.org'), forWrite: true
    })).resolves.toMatchObject({});
    expect(gateway.ablyApi.updateAppKey).toBeCalledWith('keyid', {
      capability: {
        'ex.org:notify': ['subscribe'],
        'ts1.test.ex.org:*': ['publish', 'subscribe', 'presence']
      }
    });
  });

  test('authorise existing timesheet in user account', async () => {
    await gateway.domain.write({
      '@id': 'test', '@type': 'Account', keyid: 'keyid',
      timesheet: [
        { '@id': 'test/ts1', '@type': 'Timesheet' },
        { '@id': 'test/ts2', '@type': 'Timesheet' }
      ]
    });
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.ablyApi.updateAppKey.mockImplementation((keyid, { capability }) => Promise.resolve({
      id: keyid, key: 'appid.keyid:secret', name: 'test@ex.org', capability
    }));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('test/ts1@ex.org'), forWrite: true
    })).resolves.toMatchObject({});
    expect(gateway.ablyApi.updateAppKey).toBeCalledWith('keyid', {
      capability: {
        'ex.org:notify': ['subscribe'],
        'ts2.test.ex.org:*': ['publish', 'subscribe', 'presence'],
        'ts1.test.ex.org:*': ['publish', 'subscribe', 'presence']
      }
    });
  });

  test('authorise new timesheet in organisation account', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', keyid: 'keyid'
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'test' }
    }]);
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.ablyApi.updateAppKey.mockImplementation((keyid, { capability }) => Promise.resolve({
      id: keyid, key: 'appid.keyid:secret', name: 'test@ex.org', capability
    }));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/ts1@ex.org'), forWrite: true
    })).resolves.toMatchObject({});
    expect(gateway.ablyApi.updateAppKey).toBeCalledWith('keyid', {
      capability: {
        'ex.org:notify': ['subscribe'],
        'ts1.org1.ex.org:*': ['publish', 'subscribe', 'presence']
      }
    });
  });

  test('authorise existing timesheet in organisation account', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', keyid: 'keyid',
      timesheet: { '@id': 'test/ts1', '@type': 'Timesheet' }
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'test' },
      timesheet: { '@id': 'org1/ts1', '@type': 'Timesheet' }
    }]);
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.ablyApi.updateAppKey.mockImplementation((keyid, { capability }) => Promise.resolve({
      id: keyid, key: 'appid.keyid:secret', name: 'test@ex.org', capability
    }));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/ts1@ex.org'), forWrite: true
    })).resolves.toMatchObject({});
    expect(gateway.ablyApi.updateAppKey).toBeCalledWith('keyid', {
      capability: {
        'ex.org:notify': ['subscribe'],
        'ts1.test.ex.org:*': ['publish', 'subscribe', 'presence'],
        'ts1.org1.ex.org:*': ['publish', 'subscribe', 'presence']
      }
    });
  });

  test('authorise to read organisation timesheet in user project', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', keyid: 'keyid',
      project: { '@id': 'test/pr1', '@type': 'Project' }
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'someone-else' },
      timesheet: { '@id': 'org1/ts1', '@type': 'Timesheet', project: { '@id': 'test/pr1' } }
    }]);
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.ablyApi.updateAppKey.mockImplementation((keyid, { capability }) => Promise.resolve({
      id: keyid, key: 'appid.keyid:secret', name: 'test@ex.org', capability
    }));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/ts1@ex.org')
    })).resolves.toMatchObject({});
  });

  test('authorise to read organisation timesheet in organisation project', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', keyid: 'keyid'
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'test' },
      project: { '@id': 'org1/pr1', '@type': 'Project' }
    }, {
      '@id': 'org2', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'someone-else' },
      timesheet: { '@id': 'org2/ts1', '@type': 'Timesheet', project: { '@id': 'org1/pr1' } }
    }]);
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.ablyApi.updateAppKey.mockImplementation((keyid, { capability }) => Promise.resolve({
      id: keyid, key: 'appid.keyid:secret', name: 'test@ex.org', capability
    }));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org2/ts1@ex.org')
    })).resolves.toMatchObject({});
  });

  test('unauthorised to write timesheet in organisation project', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', keyid: 'keyid',
      project: { '@id': 'test/pr1', '@type': 'Project' }
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'someone-else' },
      timesheet: { '@id': 'org1/ts1', '@type': 'Timesheet', project: { '@id': 'test/pr1' } }
    }]);
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.ablyApi.updateAppKey.mockImplementation((keyid, { capability }) => Promise.resolve({
      id: keyid, key: 'appid.keyid:secret', name: 'test@ex.org', capability
    }));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/ts1@ex.org'), forWrite: true
    })).rejects.toThrowError();
  });

  test('unauthorised if not an organisation admin', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', keyid: 'keyid'
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'fred' },
      timesheet: { '@id': 'org1/ts1', '@type': 'Timesheet' }
    }]);
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.ablyApi.updateAppKey.mockImplementation((keyid, { capability }) => Promise.resolve({
      id: keyid, key: 'appid.keyid:secret', name: 'test@ex.org', capability
    }));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/ts1@ex.org'), forWrite: true
    })).rejects.toThrowError();
  });

  test('unauthorised for create if not an organisation admin', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', keyid: 'keyid'
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'fred' }
    }]);
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.ablyApi.updateAppKey.mockImplementation((keyid, { capability }) => Promise.resolve({
      id: keyid, key: 'appid.keyid:secret', name: 'test@ex.org', capability
    }));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/ts1@ex.org'), forWrite: true
    })).rejects.toThrowError();
  });

  test('unauthorised if not registered keyid', async () => {
    const acc = new Account(gateway, {
      name: 'test', keyids: [], timesheets: [{ '@id': 'test/ts1' }]
    });
    gateway.ablyApi.updateAppKey.mockImplementation((keyid, { capability }) => Promise.resolve({
      id: keyid, key: 'appid.keyid:secret', name: 'test@ex.org', capability
    }));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('test/ts1@ex.org'), forWrite: true
    })).rejects.toThrowError();
  });

  test('unauthorised if Ably has no keyid', async () => {
    const acc = new Account(gateway, {
      name: 'test', keyids: ['keyid'], timesheets: [{ '@id': 'test/ts1' }]
    });
    gateway.ablyApi.updateAppKey.mockImplementation(() => Promise.reject('Not Found'));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('test/ts1@ex.org'), forWrite: true
    })).rejects.toThrowError();
  });

  test('authorise project for read in user account', async () => {
    await gateway.domain.write({
      '@id': 'test', '@type': 'Account', keyid: 'keyid',
      project: { '@id': 'test/pr1', '@type': 'Project' }
    });
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.ablyApi.updateAppKey.mockImplementation((keyid, { capability }) => Promise.resolve({
      id: keyid, key: 'appid.keyid:secret', name: 'test@ex.org', capability
    }));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('test/pr1@ex.org')
    })).resolves.toMatchObject({});
  });

  test('authorise project for read in organisation account', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', keyid: 'keyid'
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'test' },
      project: { '@id': 'org1/pr1', '@type': 'Project' }
    }]);
    const acc = Account.fromJSON(gateway, await gateway.domain.get('test'));
    gateway.ablyApi.updateAppKey.mockImplementation((keyid, { capability }) => Promise.resolve({
      id: keyid, key: 'appid.keyid:secret', name: 'test@ex.org', capability
    }));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/pr1@ex.org')
    })).resolves.toMatchObject({});
  });
});