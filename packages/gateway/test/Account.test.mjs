import { describe, expect, jest, test } from '@jest/globals';
import { clone as meldClone, uuid } from '@m-ld/m-ld';
import { MeldMemDown } from '@m-ld/m-ld/dist/memdown';
import DeadRemotes from './DeadRemotes.mjs';
import { AblyKey, timeldContext } from 'timeld-common';
import Account from '../lib/Account.mjs';
import jsonwebtoken from 'jsonwebtoken';

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
    gateway = {
      config,
      ablyApi: {
        listAppKeys: jest.fn(),
        createAppKey: jest.fn()
      },
      domain: await meldClone(new MeldMemDown(), DeadRemotes, config)
    };
  });

  test('to & from JSON', () => {
    const acc = new Account(gateway, {
      name: 'test',
      emails: new Set(['test@ex.org']),
      keyids: new Set(['keyid']),
      timesheets: new Set([{ '@id': 'https://ex.org/test/ts1' }])
    });
    expect(acc.name).toBe('test');
    expect(acc.emails).toEqual(new Set(['test@ex.org']));
    expect(acc.keyids).toEqual(new Set(['keyid']));
    expect(acc.timesheets).toEqual(new Set([{ '@id': 'https://ex.org/test/ts1' }]));
    expect(acc.toJSON()).toEqual({
      '@id': 'test',
      '@type': 'Account',
      email: ['test@ex.org'],
      keyid: ['keyid'],
      timesheet: [{ '@id': 'https://ex.org/test/ts1' }]
    });
  });

  test('activate', async () => {
    const acc = new Account(gateway, { name: 'test' });
    gateway.ablyApi.createAppKey.mockImplementation(
      (name, capability) => Promise.resolve({
        id: 'keyid', key: 'appid.keyid:secret', name, capability
      }));
    const key = await acc.activate('test@ex.org', 'ts1');
    expect(gateway.ablyApi.createAppKey).toBeCalledWith('test@ex.org', {
      'ts1.test.ex.org:*': ['publish', 'subscribe', 'presence']
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
    const acc = new Account(gateway, { name: 'test' });
    gateway.ablyApi.createAppKey.mockImplementation(
      (name, capability) => Promise.resolve({
        id: 'keyid', key: 'appid.keyid:secret', name, capability
      }));
    const key = new AblyKey(await acc.activate('test@ex.org', 'ts1'));
    const jwt = jsonwebtoken.sign({}, key.secret, {
      expiresIn: '1m', keyid: 'keyid'
    });
    const keyDetail = await gateway.ablyApi.createAppKey.mock.results[0].value;
    gateway.ablyApi.listAppKeys.mockImplementation(() => Promise.resolve([keyDetail]));
    await expect(acc.verify(jwt)).resolves.toMatchObject({});
  });
});