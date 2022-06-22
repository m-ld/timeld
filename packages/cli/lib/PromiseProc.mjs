import { Proc } from '@m-ld/m-ld-cli/lib/Proc.js';

export class PromiseProc extends Proc {
  /** @param {Promise} promise */
  constructor(promise) {
    super();
    promise.then(() => this.setDone(), this.setDone);
  }
}