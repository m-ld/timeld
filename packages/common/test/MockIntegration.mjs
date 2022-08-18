// noinspection NpmUsedModulesInstalled, JSUnusedGlobalSymbols
import { jest } from '@jest/globals';

/**
 * @implements Integration
 */
export default class MockIntegration {
  static configKey = 'mock';
  static contentType = 'application/x-mock';
  static created/**@type MockIntegration*/;

  /**
   * @param {object} config
   * @param {GraphSubject} ext
   */
  constructor(config, ext) {
    this.config = config;
    this.ext = ext;
    // Abusing the config to pass in mock methods
    this.entryUpdate = config.entryUpdate || jest.fn();
    this.reportTimesheet = config.reportTimesheet || jest.fn();
    MockIntegration.created = this;
  }
}