import { SyncProc } from '@m-ld/m-ld-cli/lib/Proc.js';
import { ResultsReadable } from 'timeld-common';

export class ResultsProc extends SyncProc {
  /**
   * @param {Results} results
   * @param {Format} format
   */
  constructor(results, format) {
    super(new ResultsReadable(results, format));
  }
}

