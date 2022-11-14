import { describe, expect, jest, test } from '@jest/globals';
import GatewayClient from '../lib/GatewayClient.mjs';
import { signJwt } from '@m-ld/io-web-runtime/dist/server/auth';
import Cryptr from 'cryptr';
import { Readable } from 'stream';
import { drain } from 'rx-flowable';

describe('Gateway Client', () => {
  test('init with key', async () => {
    const gw = new GatewayClient({
      gateway: 'timeld.org',
      user: 'user',
      auth: { key: 'app.id:secret' },
      key: { public: 'publicKey', private: 'privateKey' }
    });
    expect(gw.authKey).toMatchObject({ appId: 'app', keyid: 'id', secret: 'secret' });
    expect(gw.userKeyConfig).toEqual({ public: 'publicKey', private: 'privateKey' });
    expect(gw.domainName).toBe('timeld.org');
    expect(gw.principalId).toBe('http://timeld.org/user');
  });

  test('activate', async () => {
    const jwt = await signJwt({
      email: 'user@timeld.org'
    }, 'secret', {
      keyid: 'id', expiresIn: '10m'
    });
    const fetch = jest.fn(async (url, options) => {
      if (url === 'https://timeld.org/api/jwe/user?email=user%40timeld.org') {
        expect(options.headers?.Authorization).toBeUndefined();
        const jwe = new Cryptr('111111').encrypt(jwt);
        return { ok: true, json: async () => ({ jwe }) };
      } else if (url === 'https://timeld.org/api/key/user') {
        expect(options.headers.Authorization).toBe(`Bearer ${jwt}`);
        return {
          ok: true, json: async () => ({
            ably: { key: 'app.id:secret' },
            key: { public: 'publicKey', private: 'privateKey' }
          })
        };
      }
    });
    const gw = new GatewayClient({
      gateway: 'timeld.org', user: 'user'
    }, fetch);
    expect(gw.authKey).toBeNull();
    expect(gw.userKeyConfig).toBeNull();
    await gw.activate(jest.fn()
      .mockReturnValueOnce('user@timeld.org')
      .mockReturnValueOnce('111111'));
    expect(gw.authKey).toMatchObject({ appId: 'app', keyid: 'id', secret: 'secret' });
    expect(gw.userKeyConfig).toEqual({ public: 'publicKey', private: 'privateKey' });
  });

  test('config', async () => {
    const resJson = { '@domain': 'ts1.acc.timeld.org' };
    const fetch = jest.fn(async (url, options) => {
      if (url === 'https://timeld.org/api/cfg/acc/tsh/ts1?user=user') {
        expect(options.headers.Authorization).toMatch(/Bearer \S*/);
        return { ok: true, json: async () => resJson };
      }
    });
    const gw = new GatewayClient({
      gateway: 'timeld.org', user: 'user', auth: { key: 'app.id:secret' }
    }, fetch);
    await expect(gw.config('acc', 'ts1')).resolves.toEqual(resJson);
  });

  test('read', async () => {
    const resJson = [{ '@id': '1' }, { '@id': '2' }]; // Dummy
    const reqJson = { '@select': '*' }; // Dummy
    const fetch = jest.fn(async (url, options) => {
      if (url === 'https://timeld.org/api/read?user=user') {
        expect(options.method).toBe('POST');
        expect(options.headers.Authorization).toMatch(/Bearer \S*/);
        expect(options.body).toBe(JSON.stringify(reqJson));
        return { ok: true, body: Readable.from(resJson.map(j => JSON.stringify(j)).join('\n')) };
      }
    });
    const gw = new GatewayClient({
      gateway: 'timeld.org', user: 'user', auth: { key: 'app.id:secret' }
    }, fetch);
    // noinspection JSCheckFunctionSignatures
    await expect(drain(gw.read(reqJson))).resolves.toEqual(resJson);
  });
});