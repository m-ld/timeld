import { SyncProc } from '@m-ld/m-ld-cli/lib/Proc.js';
import { ResultsReadable } from 'timeld-common';

export class ResultsProc extends SyncProc {
  /**
   * @param {Results} results
   * @param {ResultsFormat} format
   */
  constructor(results, format) {
    super(new ResultsReadable(results, format));
  }
}

