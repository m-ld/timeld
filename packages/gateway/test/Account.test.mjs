import { describe, expect, jest, test } from '@jest/globals';
import { clone as meldClone, uuid } from '@m-ld/m-ld';
import { MeldMemDown } from '@m-ld/m-ld/dist/memdown';
import { DeadRemotes } from 'timeld-common/test/fixtures.mjs';
import { AccountOwnedId, BaseGateway, timeldContext } from 'timeld-common';
import Account from '../lib/Account.mjs';
import jsonwebtoken from 'jsonwebtoken';

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
    expect([...acc.tsIds()].map(tsId => tsId.toString())).toEqual(['test/ts1@ex.org']);
    expect(acc.toJSON()).toEqual({
      '@id': 'test',
      '@type': 'Account',
      email: ['test@ex.org'],
      'vf:primaryAccountable': [{ '@id': 'user1' }],
      keyid: ['keyid'],
      timesheet: [{ '@id': 'test/ts1' }]
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

  test('verify account JWT', async () => {
    const acc = new Account(gateway, {
      name: 'test', keyids: ['keyid'], timesheets: [{ '@id': 'test/ts1' }]
    });
    const jwt = jsonwebtoken.sign({}, 'secret', {
      expiresIn: '1m', keyid: 'keyid', subject: 'test'
    });
    gateway.ablyApi.updateAppKey.mockImplementation((keyid, { capability }) => Promise.resolve({
      id: keyid, key: 'appid.keyid:secret', name: 'test@ex.org', capability
    }));
    await expect(acc.verifyJwt(jwt, AccountOwnedId.fromString('test/ts1@ex.org')))
      .resolves.toMatchObject({});
    expect(gateway.ablyApi.updateAppKey).toBeCalledWith('keyid', {
      capability: {
        'ex.org:notify': ['subscribe'],
        'ts1.test.ex.org:*': ['publish', 'subscribe', 'presence']
      }
    });
  });
  test('reject account JWT if not registered keyid', async () => {
    const acc = new Account(gateway, {
      name: 'test', keyids: [], timesheets: [{ '@id': 'test/ts1' }]
    });
    const jwt = jsonwebtoken.sign({}, 'secret', {
      expiresIn: '1m', keyid: 'keyid'
    });
    gateway.ablyApi.updateAppKey.mockImplementation((keyid, { capability }) => Promise.resolve({
      id: keyid, key: 'appid.keyid:secret', name: 'test@ex.org', capability
    }));
    await expect(acc.verifyJwt(jwt, AccountOwnedId.fromString('test/ts1@ex.org')))
      .rejects.toThrowError();
  });

  test('reject account JWT if Ably has no keyid', async () => {
    const acc = new Account(gateway, {
      name: 'test', keyids: ['keyid'], timesheets: [{ '@id': 'test/ts1' }]
    });
    const jwt = jsonwebtoken.sign({}, 'secret', {
      expiresIn: '1m', keyid: 'keyid'
    });
    gateway.ablyApi.updateAppKey.mockImplementation(() => Promise.reject('Not Found'));
    await expect(acc.verifyJwt(jwt, AccountOwnedId.fromString('test/ts1@ex.org')))
      .rejects.toThrowError();
  });


  test('verify account key', async () => {
    const acc = new Account(gateway, {
      name: 'test', keyids: ['keyid'], timesheets: [{ '@id': 'test/ts1' }]
    });
    const key = 'appid.keyid:secret';
    gateway.ablyApi.updateAppKey.mockImplementation((keyid, { capability }) => Promise.resolve({
      id: keyid, key: 'appid.keyid:secret', name: 'test@ex.org', capability
    }));
    await expect(acc.verifyKey(key, AccountOwnedId.fromString('test/ts1@ex.org')))
      .resolves.not.toThrow();
    expect(gateway.ablyApi.updateAppKey).toBeCalledWith('keyid', {
      capability: {
        'ex.org:notify': ['subscribe'],
        'ts1.test.ex.org:*': ['publish', 'subscribe', 'presence']
      }
    });
  });
});