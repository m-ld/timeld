// noinspection NpmUsedModulesInstalled
import { describe, expect, test } from '@jest/globals';
import { UserKey } from '../data/index.mjs';
import TimeldApp from '../lib/TimeldApp.mjs';
import AuthKey from '../lib/AuthKey.mjs';

describe('Timeld App', () => {
  test('construct', () => {
    const userKey = UserKey.generate('app.keyid:secret');
    const app = TimeldApp({
      '@domain': 'ex.org',
      ...userKey.toConfig(AuthKey.fromString('app.keyid:secret'))
    }, { '@id': 'http://ex.org/test' });
    expect(app.principal['@id']).toBe('http://ex.org/test');
    // noinspection JSCheckFunctionSignatures unused state parameter on sign
    expect(app.transportSecurity.sign(Buffer.from('hello'))).toMatchObject({
      pid: 'http://ex.org/test',
      sig: expect.any(Buffer)
    });
  });
});