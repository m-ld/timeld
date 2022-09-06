// noinspection JSCheckFunctionSignatures,NpmUsedModulesInstalled
import { describe, expect, jest, test } from '@jest/globals';
import IntegrationExtension from '../lib/Integration.mjs';
import { AccountOwnedId } from 'timeld-common';
import { of } from 'rxjs';
import { exampleEntryJson } from 'timeld-common/test/fixtures.mjs';

describe('Integration extension', () => {
  let /**@type Gateway*/gateway;
  let /**@type IntegrationExtension*/ ext;
  let /**@type Mock*/syncTimesheet;
  let /**@type Mock*/entryUpdate;
  let /**@type Mock*/reportTimesheet;
  let mockTimesheet;

  beforeEach(async () => {
    // noinspection JSCheckFunctionSignatures
    ext = IntegrationExtension.fromJSON({
      '@id': 'mockIntegration',
      '@type': 'Integration',
      module: 'timeld-common/test/MockIntegration.mjs',
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
      domain: { write: jest.fn().mockResolvedValue({}) }
    };
    await ext.initialise(gateway);
  });

  test('constructs the integration module', async () => {
    expect(ext.contentType).toBe('application/x-mock');
  });

  test('updates after sync', async () => {
    const insertEntry = { '@insert': exampleEntryJson };
    syncTimesheet.mockImplementation(async () => {
      ext.src.testing = true;
      return of(insertEntry);
    });
    const tsId = AccountOwnedId.fromString('test/ts1@ex.org');
    await ext.syncTimesheet(tsId, {});
    expect(syncTimesheet).toHaveBeenCalledWith(tsId, {});
    await ext.asyncTasks;
    expect(mockTimesheet.write).toHaveBeenCalledWith(insertEntry);
    expect(gateway.domain.write).toHaveBeenCalledWith({
      '@insert': { '@id': 'mockIntegration', testing: true }
    });
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
      '@insert': { '@id': 'mockIntegration', testing: 'ts1:config' }
    });
    expect(ext.toJSON()).toEqual({
      '@id': 'mockIntegration',
      '@type': 'Integration',
      module: 'timeld-common/test/MockIntegration.mjs',
      config: [],
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
      '@delete': { '@id': 'mockIntegration', customProp1: 'hello', customProp2: 'hi' },
      '@insert': { '@id': 'mockIntegration', customProp1: 'goodbye' }
    });
    expect(ext.toJSON()).toEqual({
      '@id': 'mockIntegration',
      '@type': 'Integration',
      module: 'timeld-common/test/MockIntegration.mjs',
      config: [],
      appliesTo: { '@id': 'test/ts1' },
      customProp1: 'goodbye'
      // customProp2 has been removed
    });
  });
});