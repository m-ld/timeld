import { describe, expect, jest, test } from '@jest/globals';
import Authorization from '../lib/Authorization.mjs';
import { AccountOwnedId } from 'timeld-common';

describe('Authorization helper', () => {
  let gateway, account;

  beforeEach(() => {
    account = ({
      verifyJwt: jest.fn(),
      verifyKey: jest.fn()
    });
    gateway = {
      account: jest.fn().mockResolvedValue(account)
    };
  });

  test('initialises from bearer', async () => {
    // noinspection JSCheckFunctionSignatures
    const auth = new Authorization({
      params: { user: 'test' },
      authorization: { scheme: 'Bearer', credentials: 'token' }
    });
    expect(auth.user).toBe('test');
    expect(auth.jwt).toBe('token');
    const ownedId = AccountOwnedId.fromString('acc/test@ex.org');
    await auth.verifyUser(gateway, ownedId);
    expect(account.verifyJwt).toBeCalledWith('token', ownedId);
  });

  test('initialises from basic', async () => {
    // noinspection JSCheckFunctionSignatures
    const auth = new Authorization({
      params: {},
      authorization: {
        scheme: 'Basic',
        basic: { username: 'test', password: 'key' }
      }
    });
    expect(auth.user).toBe('test');
    expect(auth.key).toBe('key');
    const ownedId = AccountOwnedId.fromString('acc/test@ex.org');
    await auth.verifyUser(gateway, ownedId);
    expect(account.verifyKey).toBeCalledWith('key', ownedId);
  });
});