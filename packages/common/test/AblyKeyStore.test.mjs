// noinspection NpmUsedModulesInstalled
import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import AblyKeyStore from '../ext/ably/AblyKeyStore.mjs';
import { AccountOwnedId } from '../index.mjs';

describe('Ably as a key store', () => {
  let keyStore/**@type {AblyKeyStore}*/;

  beforeEach(() => {
    keyStore = new AblyKeyStore({
      '@domain': 'ex.org', ably: { key: 'appid.topId.topSecret', apiKey: 'apiKey' }
    });
    keyStore.fetchJson = jest.fn();
  });

  test('mint key sets base capability', async () => {
    await keyStore.mintKey('hello');
    expect(keyStore.fetchJson).toBeCalledWith('keys', {}, {
      method: 'POST', body: { name: 'hello', capability: { 'ex.org:notify': ['subscribe'] } }
    });
  });

  test('ping key updates capability', async () => {
    await keyStore.pingKey('keyid', async () => [AccountOwnedId.fromString('test/ts1@ex.org')]);
    expect(keyStore.fetchJson).toBeCalledWith(`keys/keyid`, {}, {
      method: 'PATCH', body: {
        capability: {
          'ex.org:notify': ['subscribe'],
          'ts1.test.ex.org:*': ['publish', 'subscribe', 'presence']
        }
      }
    });
  });
});