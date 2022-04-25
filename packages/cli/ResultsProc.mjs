import { Readable } from 'stream';
import { SyncProc } from '@m-ld/m-ld-cli/lib/Proc.js';

export class ResultsProc extends SyncProc {
  /**
   * @param {import('@m-ld/m-ld').ReadResult} results
   * @param {string} opening
   * @param {string} closing
   * @param {string} separator
   * @param {(s: import('@m-ld/m-ld').GraphSubject) => string} stringify
   */
  constructor(
    results,
    { opening, closing, separator, stringify }
  ) {
    // noinspection JSCheckFunctionSignatures
    super(new class extends Readable {
      constructor(opts) {
        super(opts);
        this.index = -1;
        const openIfRequired = () => {
          if (this.index === -1) {
            this.push(Buffer.from(opening));
            this.index = 0;
          }
        };
        this.subs = results.consume.subscribe({
          next: bite => {
            openIfRequired();
            this.next = bite.next;
            this.push(Buffer.from(
              (this.index++ ? separator : '') + stringify(bite.value)));
          },
          complete: () => {
            openIfRequired();
            this.push(Buffer.from(closing));
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