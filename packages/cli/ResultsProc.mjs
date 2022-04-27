import { Readable } from 'stream';
import { SyncProc } from '@m-ld/m-ld-cli/lib/Proc.js';

/**
 * @typedef {object} Format
 * @property {string} [opening]
 * @property {string} [closing]
 * @property {string} separator
 * @property {(s: import('@m-ld/m-ld').GraphSubject) => string | Promise<string>} stringify
 */

export class ResultsProc extends SyncProc {
  /**
   * @param {import('@m-ld/m-ld').ReadResult} results
   * @param {Format} format
   */
  constructor(results, format) {
    // noinspection JSCheckFunctionSignatures
    super(new class extends Readable {
      constructor(opts) {
        super(opts);
        this.index = -1;
        const openIfRequired = () => {
          if (this.index === -1) {
            if (format.opening != null)
              this.push(Buffer.from(format.opening));
            this.index = 0;
          }
        };
        this.subs = results.consume.subscribe({
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
    }());
  }
}