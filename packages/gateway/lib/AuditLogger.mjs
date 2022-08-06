import { createLogger } from 'logzio-nodejs';

export default class AuditLogger {
  /**
   * @param {string} key Logz.io key
   */
  constructor({ key }) {
    this.logz = createLogger({
      token: key, protocol: 'https', type: 'timesheet'
    });
  }

  /**
   * @param {AccountOwnedId} tsId
   * @param {import('@m-ld/m-ld').MeldUpdate} update
   */
  log(tsId, update) {
    this.logz.log({ ...tsId.toJSON(), update });
  }

  async close() {
    return new Promise((resolve, reject) =>
      this.logz.sendAndClose(err => err ? reject(err) : resolve()));
  }
}