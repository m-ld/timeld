// noinspection JSCheckFunctionSignatures,NpmUsedModulesInstalled
import { describe, expect, jest, test } from '@jest/globals';
import ConnectorExtension from '../lib/Connector.mjs';
import { AccountOwnedId, TimeldPrincipal } from 'timeld-common';
import { of } from 'rxjs';
import { exampleEntryJson } from 'timeld-common/test/fixtures.mjs';
import MockConnector from 'timeld-common/test/MockConnector.mjs';

/**
 * Stable key generated with genkey.mjs
 */
const keyConfig = {
  auth: { key: 'd0242544.VEk6vG:syRmYDS3oB6siZzVb5s1FUtOuhvPrShmg2QmLLWIKNQaeZ3Q==' },
  key: {
    public: 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDEF/YRuYf5qlI29iDkJcurYv4X/TAGFK2+4pna6EBm4wV' +
      'mIf0zlRGcucBL44oC+Fw/hol8qBcQF8mOVaZPw6ywCJcoLazZWd8zFkVNGd7u0a+z81CJy8JOOB6bFdbNT6UHSt1m' +
      'T9beFda/j64NgUpxbLuU2L8k/KuwAXaXrOfCiQIDAQAB',
    private: 'MIIC3TBXBgkqhkiG9w0BBQ0wSjApBgkqhkiG9w0BBQwwHAQIC/g6iWaswAsCAggAMAwGCCqGSIb3DQIJBQ' +
      'AwHQYJYIZIAWUDBAEqBBCwyZiT4Njwi2oUTbJ1IXTRBIICgIRJ/TsIk5c+0XHbAZwfbmKWDs7O7oINWBBDfTQ0YQW' +
      '+bZgNCkhsqFKWuqy659lSTAu1Hx6dXv3i7DSCtwZRS8fkotUxThRMq8lyxWNuZxX0GnQATLPznjQsk2Y3cIxhZC2Z' +
      'sgxWOFJud8vMrvtYbSX3Vmul8qiaSMeNp2AqLLQV15cNbElsNochMgmd3sWDhNiYFNEo5W3UPRV9wqey5fZ6nxiRI' +
      '7k+SzgQGETujf8RS2O2omwaSoCZX+UvOMnsBQffjq9C5R3EVUWf89Qr+szpocSJTFLAHyYw5x48aYuq+SL2txWI06' +
      '4vwQjTyJKV3YQvxvAHjKXocA3GzV7kEOfLiYCgP7JwMN8v7bFvw/cYpy6fBRM0Hnq8uFnuoffmMwVvNbyScsUZq+b' +
      '1ePPegmggIrgf8iL8IStrBsssKfWD8zcRvvcNjvwPF0aVM0m5FY9HRC5l3sY0DBWsesbthLEvftdsrAX8kVStMmQg' +
      'W59SzKLRTJx49CfalYwCs/4qRIFbj+zyZ16bzTJEcL7XiJuMgBzWqM3jaeQ6Gb+P9MkR/fX4iRhG7eRUjw8igfU8W' +
      'DpDZ5PFBakXl/9BPKewsqBgUHHII5rrA41DyrC22AriudbKUyZhLutCOIuBHVLMGPBg9BPWU0Xf+ftTRKxP4dEAVH' +
      'eP5rlNymUrWwFpu7cShoTaesoZxBhir12ZrZvCKezhvler8ZjPyPy1IkDc7qHDQ3gHyuL5wASgBlQi+pQKSknNSzZ' +
      'K3rya93D6rFbQDe8mol68HBN/Z7ODP7i4adGRpvkhmfcUENsBTuw8A4kMJ1MJoB4UAboey4OGLxlbpS0DlJgSo/la' +
      '75qoQV7VleE='
  }
};

describe('Connector extension', () => {
  let /**@type Gateway*/gateway;
  let /**@type ConnectorExtension*/ ext;
  let /**@type Mock*/syncTimesheet;
  let /**@type Mock*/entryUpdate;
  let /**@type Mock*/reportTimesheet;
  let mockTimesheet;

  beforeEach(async () => {
    // noinspection JSCheckFunctionSignatures
    ext = ConnectorExtension.fromJSON({
      '@id': 'mockConnector',
      '@type': 'Connector',
      module: 'timeld-common/test/MockConnector.mjs',
      config: '{"uri":"https://ex.org/api/"}',
      appliesTo: { '@id': 'test/ts1' },
      customProp1: 'hello',
      customProp2: 'hi'
    });
    entryUpdate = jest.fn();
    reportTimesheet = jest.fn();
    syncTimesheet = jest.fn();
    mockTimesheet = { write: jest.fn() };
    // noinspection JSValidateTypes,JSCheckFunctionSignatures
    gateway = {
      initTimesheet: jest.fn().mockResolvedValue(mockTimesheet),
      config: { mock: { testing: 'config', syncTimesheet, entryUpdate, reportTimesheet } },
      domain: { write: jest.fn().mockResolvedValue({}) },
      me: new TimeldPrincipal('http://ex.org/', keyConfig)
    };
    await ext.initialise(gateway);
  });

  test('constructs the connector module', async () => {
    expect(ext.contentType).toBe('application/x-mock');
    expect(MockConnector.created.config).toMatchObject({
      testing: 'config',
      'uri': 'https://ex.org/api/'
    });
  });

  test('signs an HTTP request', async () => {
    // The http-message-signatures library cannot do verification, se here we
    // look for a verbatim signature from a known starting-point.
    // If modifying this test, verify using https://httpsig.org/
    await expect(ext.signHttp(gateway, {
      url: 'http://ext.org/target',
      method: 'POST',
      headers: { 'X-State-ID': 'test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ great: 'yes' })
    }, { created: 1669379993 })).resolves.toEqual({
      url: 'http://ext.org/target',
      body: '{"great":"yes"}',
      headers: {
        'X-State-ID': 'test',
        'Content-Digest': 'mh=uEiBMnzoN9uIHOIljFyEmTbzmZdvvAtzbey6OZ5UvAaTLJQ',
        'Content-Type': 'application/json',
        'Signature': 'sig1=:ZjK0JWCkoZFhmcvjeVj/X7QpkeKLolWvuLOgIUZHHfcv5QTur3MzSm/5In574N8gS6xj' +
          '5zJEDofU0t59QVLFozrvB9S3Ild0TQI/fnRFW3y7eUmzoLLRdIhYn9QCg0h8AbivDnzvSh67IN1PL9RVKYM63' +
          '0SPbGiYqilXWwzYbUE=:',
        'Signature-Input': 'sig1=("@method" "@request-target" "content-type" "content-digest");' +
          'created=1669379993;keyid="VEk6vG";alg="rsa-v1_5-sha256"'
      },
      method: 'POST'
    });
  });

  test('updates after sync', async () => {
    const insertEntry = { '@insert': exampleEntryJson };
    syncTimesheet.mockImplementation(async () => {
      ext.src.testing = true;
      return of(insertEntry);
    });
    const tsId = AccountOwnedId.fromString('test/ts1@ex.org');
    await ext.syncTimesheet(tsId);
    expect(syncTimesheet).toHaveBeenCalledWith(tsId, undefined, undefined);
    await ext.asyncTasks;
    expect(mockTimesheet.write).toHaveBeenCalledWith(insertEntry);
    expect(gateway.domain.write).toHaveBeenCalledWith({
      '@insert': { '@id': 'mockConnector', testing: true }
    });
  });

  test('does not update after stateful sync', async () => {
    const insertEntry = { '@insert': exampleEntryJson };
    syncTimesheet.mockImplementation(async () => {
      ext.src.testing = true;
      return of(insertEntry);
    });
    const tsId = AccountOwnedId.fromString('test/ts1@ex.org');
    await ext.syncTimesheet(tsId, {}, 0);
    expect(syncTimesheet).toHaveBeenCalledWith(tsId, {}, 0);
    await ext.asyncTasks;
    expect(mockTimesheet.write).not.toHaveBeenCalledWith(insertEntry);
  });

  test('reports new data to be stored', async () => {
    const tsUpdate = {}, tsState = {}; // Only used for identity
    entryUpdate.mockImplementation(function (tsId) {
      // Report something new to the extension subject for storage
      this.ext.testing = `${tsId['name']}:${this.config.testing}`;
    });
    await ext.entryUpdate(
      AccountOwnedId.fromString('test/ts1@ex.org'), tsUpdate, tsState);
    expect(gateway.domain.write).toHaveBeenCalledWith({
      '@insert': { '@id': 'mockConnector', testing: 'ts1:config' }
    });
    expect(ext.toJSON()).toEqual({
      '@id': 'mockConnector',
      '@type': 'Connector',
      module: 'timeld-common/test/MockConnector.mjs',
      config: '{"uri":"https://ex.org/api/"}',
      appliesTo: { '@id': 'test/ts1' },
      testing: 'ts1:config',
      customProp1: 'hello',
      customProp2: 'hi'
    });
  });

  test('reports updated data to be stored', async () => {
    const tsUpdate = {}, tsState = {}; // Only used for identity
    entryUpdate.mockImplementation(function () {
      // Report something changed to the extension subject for storage
      this.ext.customProp1 = 'goodbye';
      // Delete something
      this.ext.customProp2 = [];
    });
    await ext.entryUpdate(
      AccountOwnedId.fromString('test/ts1@ex.org'), tsUpdate, tsState);
    // Expect config to have been reported for update
    expect(gateway.domain.write).toHaveBeenCalledWith({
      '@delete': { '@id': 'mockConnector', customProp1: 'hello', customProp2: 'hi' },
      '@insert': { '@id': 'mockConnector', customProp1: 'goodbye' }
    });
    expect(ext.toJSON()).toEqual({
      '@id': 'mockConnector',
      '@type': 'Connector',
      module: 'timeld-common/test/MockConnector.mjs',
      config: '{"uri":"https://ex.org/api/"}',
      appliesTo: { '@id': 'test/ts1' },
      customProp1: 'goodbye'
      // customProp2 has been removed
    });
  });
});