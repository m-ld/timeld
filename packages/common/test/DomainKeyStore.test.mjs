// noinspection NpmUsedModulesInstalled
import { describe, test } from '@jest/globals';
import DomainKeyStore from '../ext/m-ld/DomainKeyStore.mjs';
import { clone as meldClone, uuid } from '@m-ld/m-ld';
import { timeldContext } from '../data/index.mjs';
import { MeldMemDown } from '@m-ld/m-ld/dist/memdown';
import { DeadRemotes } from './fixtures.mjs';

describe('m-ld domain key store', () => {
  let /**@type {DomainKeyStore}*/ks;

  beforeEach(async () => {
    ks = new DomainKeyStore({ appId: 'app1' });
    // noinspection JSCheckFunctionSignatures
    ks.state = await meldClone(new MeldMemDown(), DeadRemotes, {
      '@id': uuid(),
      '@domain': 'ex.org',
      '@context': timeldContext,
      genesis: true
    });
  });

  test('mints key', async () => {
    const key = await ks.mintKey('name');
    expect(key.name).toBe('name');
    expect(key.revoked).toBe(false);
    expect(key.key.appId).toBe('app1');
    expect(key.key.keyid).toMatch(/.{6}/);
    expect(key.key.secret).toMatch(/.{20,}/);
  });

  test('pings key', async () => {
    const { key: { keyid } } = await ks.mintKey('name');
    const key = await ks.pingKey(keyid);
    expect(key.name).toBe('name');
    expect(key.revoked).toBe(false);
    expect(key.key.appId).toBe('app1');
    expect(key.key.keyid).toMatch(/.{6}/);
    expect(key.key.secret).toMatch(/.{20,}/);
  });
});