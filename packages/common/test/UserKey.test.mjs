import { describe, expect, test } from '@jest/globals';
import { AblyKey, UserKey } from '..';

describe('User key', () => {
  test('key identity', () => {
    expect(() => UserKey.keyidFromRef({ '@id': 'garbage' })).toThrow(TypeError);
    expect(() => UserKey.keyidFromRef({ '@id': '.foo' })).toThrow(TypeError); // Too short
    expect(UserKey.keyidFromRef({ '@id': '.sorted' })).toBe('sorted');
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
    const loaded = UserKey.fromConfig(original.toConfig('app.keyid1:secret'));
    expect(loaded.keyid).toBe(original.keyid);
    expect(loaded.publicKey.equals(original.publicKey)).toBe(true);
    expect(loaded.privateKey.equals(original.privateKey)).toBe(true);
  });

  test('signing', () => {
    const ablyKey = new AblyKey('app.keyid1:secret');
    const userKey = UserKey.generate(ablyKey);
    const data = Buffer.from('Hello!');
    const sig = userKey.sign(data, ablyKey);
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
    const ablyKey = new AblyKey('app.keyid1:secret');
    const userKey = UserKey.generate(ablyKey);
    const data = Buffer.from('Hello!');
    const sig = userKey.sign(data, ablyKey);
    const [, cryptoSig] = UserKey.splitSignature(sig);
    expect(userKey.verify(cryptoSig, data)).toBe(false);
  });

  test('wrong keyid', () => {
    const ablyKey = new AblyKey('app.keyid1:secret');
    const userKey = UserKey.generate(ablyKey);
    const data = Buffer.from('Hello!');
    const sig = userKey.sign(data, ablyKey);
    const [, cryptoSig] = UserKey.splitSignature(sig);
    let badSig = Buffer.concat([Buffer.from('keyid2:'), cryptoSig]);
    expect(userKey.verify(badSig, data)).toBe(false);
  });
});