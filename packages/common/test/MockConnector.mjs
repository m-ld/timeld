// noinspection NpmUsedModulesInstalled, JSUnusedGlobalSymbols
import { jest } from '@jest/globals';

/**
 * @implements Connector
 */
export default class MockConnector {
  static configKey = 'mock';
  static contentType = 'application/x-mock';
  static created/**@type MockConnector*/;

  /**
   * @param {object} config
   * @param {GraphSubject} ext
   */
  constructor(config, ext) {
    this.config = config;
    this.ext = ext;
    // Abusing the config to pass in mock methods
    this.syncTimesheet = config.syncTimesheet || jest.fn();
    this.entryUpdate = config.entryUpdate || jest.fn();
    this.reportTimesheet = config.reportTimesheet || jest.fn();
    MockConnector.created = this;
  }
}