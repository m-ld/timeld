import env_paths from 'env-paths';
import { Repl } from '@m-ld/m-ld-cli/lib/Repl.js';
import fileCmd from '@m-ld/m-ld-cli/cmd/repl/file.js';
import { uuid } from '@m-ld/m-ld';

const envPaths = env_paths('timeld');

export class TimeldSession extends Repl {
  /**
   * @param {object} opts
   * @param {string | number} [opts.logLevel]
   * @param {string} opts.organisation
   * @param {string} opts.timesheet
   * @param {boolean} opts.create
   */
  constructor(opts) {
    super({ logLevel: opts.logLevel, prompt: 'time>' });
    this.config = {
      ...opts,
      '@id': uuid(),
      '@domain': `${opts.timesheet}.${opts.organisation}.timeld.org`,
      genesis: !!opts.create
    }
  }

  buildCommands(yargs, ctx) {
    // noinspection JSCheckFunctionSignatures
    return yargs
      .command(fileCmd(ctx));
  }

  async start(opts) {
    console.log('Starting', this.config);
    super.start(opts);
  }

  async close() {
    await super.close();
  }
}