// noinspection NpmUsedModulesInstalled
import { describe, expect, jest, test } from '@jest/globals';
import { resolveGateway } from '..';

describe('Gateway resolution', ()=> {
  test('resolves domain name', () => {
    const gw = resolveGateway('timeld.org');
    expect(gw.root.toString()).toBe('https://timeld.org/');
    expect(gw.domainName).toBe('timeld.org');
  });

  test('resolves local address with protocol', async () => {
    const gw = resolveGateway('http://my-iMac.local',
      jest.fn().mockResolvedValue('127.0.0.1'));
    expect((await gw.root).toString()).toBe('http://127.0.0.1/');
    expect(gw.domainName).toBe('my-imac.local');
  });

  test('resolves separate domain and host', () => {
    const gw = resolveGateway('http://timeld.org@ex.org');
    expect(gw.root.toString()).toBe('http://ex.org/');
    expect(gw.domainName).toBe('timeld.org');
  });
});
