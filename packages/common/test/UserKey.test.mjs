// noinspection NpmUsedModulesInstalled
import { describe, expect, test } from '@jest/globals';
import { AuthKey, UserKey } from '..';

describe('User key', () => {
  test('key from ref', () => {
    expect(() => UserKey.keyidFromRef({ '@id': 'garbage' })).toThrow(TypeError);
    expect(() => UserKey.keyidFromRef({ '@id': '.foo' })).toThrow(TypeError); // Too short
    expect(UserKey.keyidFromRef({ '@id': '.sorted' })).toBe('sorted');
    expect(UserKey.keyidFromRef({ '@id': 'http://ex.org/.sorted' })).toBe('sorted');
  });

  test('ref from key', () => {
    expect(UserKey.refFromKeyid('keyid')).toEqual({ '@id': '.keyid' });
    expect(UserKey.refFromKeyid('keyid', 'ex.org'))
      .toEqual({ '@id': 'http://ex.org/.keyid' });
  });

  test('JSON serialisation', () => {
    const userKey = UserKey.generate('app.keyid1:secret');
    let src = userKey.toJSON();
    expect(src['@id']).toBe('.keyid1');
    expect(src['public']).toMatchObject({
      '@type': 'http://www.w3.org/2001/XMLSchema#base64Binary',
      '@value': expect.any(String)
    });
    expect(src['private']).toMatchObject({
      '@type': 'http://www.w3.org/2001/XMLSchema#base64Binary',
      '@value': expect.any(String)
    });
    expect(UserKey.fromJSON(src)).toMatchObject(userKey);
  });

  test('Config serialisation', () => {
    const original = UserKey.generate('app.keyid1:secret');
    const loaded = UserKey.fromConfig(
      original.toConfig(AuthKey.fromString('app.keyid1:secret')));
    expect(loaded.keyid).toBe(original.keyid);
    expect(loaded.publicKey.equals(original.publicKey)).toBe(true);
    expect(loaded.privateKey.equals(original.privateKey)).toBe(true);
  });

  test('signing', () => {
    const authKey = AuthKey.fromString('app.keyid1:secret');
    const userKey = UserKey.generate(authKey);
    const data = Buffer.from('Hello!');
    const sig = userKey.sign(data, authKey);
    const [keyid] = UserKey.splitSignature(sig);
    expect(keyid).toBe('keyid1');
    expect(userKey.verify(sig, data)).toBe(true);
  });

  test('garbage sig', () => {
    const userKey = UserKey.generate('app.keyid1:secret');
    const data = Buffer.from('Hello!');
    const sig = Buffer.from('garbage');
    expect(userKey.verify(sig, data)).toBe(false);
  });

  test('missing keyid', () => {
    const authKey = AuthKey.fromString('app.keyid1:secret');
    const userKey = UserKey.generate(authKey);
    const data = Buffer.from('Hello!');
    const sig = userKey.sign(data, authKey);
    const [, cryptoSig] = UserKey.splitSignature(sig);
    expect(userKey.verify(cryptoSig, data)).toBe(false);
  });

  test('wrong keyid', () => {
    const authKey = AuthKey.fromString('app.keyid1:secret');
    const userKey = UserKey.generate(authKey);
    const data = Buffer.from('Hello!');
    const sig = userKey.sign(data, authKey);
    const [, cryptoSig] = UserKey.splitSignature(sig);
    let badSig = Buffer.concat([Buffer.from('keyid2:'), cryptoSig]);
    expect(userKey.verify(badSig, data)).toBe(false);
  });
});