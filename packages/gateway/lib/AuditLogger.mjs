import { createLogger } from 'logzio-nodejs';

export default class AuditLogger {
  /**
   * @param {string} domain gateway domain
   * @param {string} key Logz.io key
   */
  constructor({ '@domain': domain, logz: { key } }) {
    this.logz = createLogger({
      token: key, protocol: 'https', type: domain
    });
  }

  /**
   * @param {import('@m-ld/m-ld').MeldUpdate} update
   */
  log = update => {
    this.logz.log(update);
  };

  async close() {
    return new Promise((resolve, reject) =>
      this.logz.sendAndClose(err => err ? reject(err) : resolve()));
  }
}