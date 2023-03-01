import Cmd from './Cmd.mjs';
import path from 'path';
import { createWriteStream } from 'fs';

export default class GwCmd extends Cmd {
  constructor(name = 'gw') {
    super(name);
  }

  async start() {
    const dataDir = this.createDir('data');
    const logDir = this.createDir('log');
    this.logger = new console.Console({
      stdout: createWriteStream(path.join(logDir, 'stdout.log')),
      stderr: createWriteStream(path.join(logDir, 'stderr.log'))
    });
    this.debug = true;
    await this.run(
      path.join(process.cwd(), 'packages', 'gateway', 'server.mjs'),
      '--genesis', 'true', {
        env: { TIMELD_GATEWAY_DATA_PATH: dataDir, LOG_LEVEL: 'trace' }
      }
    );
    await this.findByText('Gateway initialised');
  }
}