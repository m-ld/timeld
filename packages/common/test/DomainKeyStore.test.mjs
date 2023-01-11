// noinspection NpmUsedModulesInstalled
import { describe, test } from '@jest/globals';
import DomainKeyStore from '../ext/m-ld/DomainKeyStore.mjs';
import { shortId, uuid } from '@m-ld/m-ld';

describe('m-ld domain key store', () => {
  let /**@type {DomainKeyStore}*/ks;

  beforeEach(async () => {
    ks = new DomainKeyStore({
      '@id': uuid(),
      '@domain': 'test.ex.org',
      genesis: false
    });
  });

  test('mints key', async () => {
    const key = await ks.mintKey('name');
    expect(key.name).toBe('name');
    expect(key.revoked).toBe(false);
    expect(key.key.appId).toBe(shortId('test.ex.org'));
    expect(key.key.keyid).toMatch(/.{6}/);
    expect(key.key.secret).toMatch(/.{20,}/);
  });

  test('pings key', async () => {
    const { key: { keyid } } = await ks.mintKey('name');
    const revoked = await ks.pingKey(keyid);
    expect(revoked).toBe(false);
  });
});