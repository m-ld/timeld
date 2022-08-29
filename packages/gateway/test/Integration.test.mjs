// noinspection JSCheckFunctionSignatures,NpmUsedModulesInstalled
import { describe, expect, jest, test } from '@jest/globals';
import IntegrationExtension from '../lib/Integration.mjs';
import { AccountOwnedId } from 'timeld-common';

describe('Integration extension', () => {
  let /**@type IntegrationExtension*/ ext;
  let /**@type Mock*/entryUpdate;
  let /**@type Mock*/reportTimesheet;

  beforeEach(async () => {
    // noinspection JSCheckFunctionSignatures
    ext = IntegrationExtension.fromJSON({
      '@id': 'mockIntegration',
      '@type': 'Integration',
      module: 'timeld-common/test/MockIntegration.mjs',
      appliesTo: { '@id': 'test/ts1' },
      before: 'hello'
    });
    entryUpdate = jest.fn();
    reportTimesheet = jest.fn();
    await ext.initialise({
      mock: { testing: 'config', entryUpdate, reportTimesheet }
    });
  });

  test('constructs the integration module',async () => {
    expect(ext.contentType).toBe('application/x-mock');
  });

  test('reports new data to be stored',async () => {
    const tsUpdate = {}, tsState = {}; // Only used for identity
    entryUpdate.mockImplementation(function (tsId) {
      // Report something new to the extension subject for storage
      this.ext.testing = `${tsId['name']}:${this.config.testing}`;
    });
    let gwUpdate = await ext.entryUpdate(
      AccountOwnedId.fromString('test/ts1@ex.org'), tsUpdate, tsState);
    // Expect config to have been reported for update
    expect(gwUpdate).toEqual({
      '@insert': { '@id': 'mockIntegration', testing: 'ts1:config' }
    });
    expect(ext.toJSON()).toEqual({
      '@id': 'mockIntegration',
      '@type': 'Integration',
      module: 'timeld-common/test/MockIntegration.mjs',
      appliesTo: { '@id': 'test/ts1' },
      testing: 'ts1:config',
      before: 'hello'
    });
  });

  test('reports updated data to be stored',async () => {
    const tsUpdate = {}, tsState = {}; // Only used for identity
    entryUpdate.mockImplementation(function () {
      // Report something changed to the extension subject for storage
      this.ext.before = 'goodbye';
    });
    let gwUpdate = await ext.entryUpdate(
      AccountOwnedId.fromString('test/ts1@ex.org'), tsUpdate, tsState);
    // Expect config to have been reported for update
    expect(gwUpdate).toEqual({
      '@delete': { '@id': 'mockIntegration', before: 'hello' },
      '@insert': { '@id': 'mockIntegration', before: 'goodbye' }
    });
    expect(ext.toJSON()).toEqual({
      '@id': 'mockIntegration',
      '@type': 'Integration',
      module: 'timeld-common/test/MockIntegration.mjs',
      appliesTo: { '@id': 'test/ts1' },
      before: 'goodbye'
    });
  });
});