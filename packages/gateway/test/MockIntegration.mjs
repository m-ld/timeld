/**
 * @implements Integration
 */
export default class MockIntegration {
  static configKey = 'mock';
  static contentType = 'application/x-mock';

  /**
   * @param {object} config
   * @param {GraphSubject} ext
   */
  constructor(config, ext) {
    this.config = config;
    this.ext = ext;
    // Abusing the config to pass in mock methods
    this.entryUpdate = config.entryUpdate;
    this.reportTimesheet = config.reportTimesheet;
  }
}