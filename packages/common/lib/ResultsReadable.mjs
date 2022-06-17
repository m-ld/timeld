import { Readable } from 'stream';

/**
 * @typedef {object} Format
 * @property {string} [opening]
 * @property {string} [closing]
 * @property {string} separator
 * @property {(s: import('@m-ld/m-ld').GraphSubject) => string | Promise<string>} stringify
 */

/**
 * @typedef {import('@m-ld/m-ld').ReadResult['consume']} Results
 */

export default class ResultsReadable extends Readable {
  /**
   * @param {Results} results
   * @param {Format} format
   * @param {import('stream').ReadableOptions} [opts]
   */
  constructor(results, format, opts) {
    super(opts);
    this.index = -1;
    const openIfRequired = () => {
      if (this.index === -1) {
        if (format.opening != null)
          this.push(Buffer.from(format.opening));
        this.index = 0;
      }
    };
    this.subs = results.subscribe({
      next: async bite => {
        openIfRequired();
        const subjectStr = await format.stringify(bite.value);
        this.push(Buffer.from(`${this.index++ ? format.separator : ''}${subjectStr}`));
        this.next = bite.next;
      },
      complete: () => {
        openIfRequired();
        if (format.closing != null)
          this.push(Buffer.from(format.closing));
        this.push(null);
      },
      error: err => {
        this.destroy(err);
      }
    });
  }

  _read(size) {
    if (this.next) {
      this.next();
      delete this.next;
    }
  }

  _destroy(error, callback) {
    this.subs.unsubscribe();
    callback(error);
  }
}