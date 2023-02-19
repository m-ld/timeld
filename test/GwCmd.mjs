import Cmd from './Cmd.mjs';
import path from 'path';

export default class GwCmd extends Cmd {
  constructor(name = 'gw') {
    super(name);
  }

  async start() {
    const dataDir = this.createDir();
    await this.run(
      path.join(process.cwd(), 'packages', 'gateway', 'server.mjs'),
      '--genesis', 'true', {
        env: { TIMELD_GATEWAY_DATA_PATH: dataDir, LOG_LEVEL: 'trace' }
      }
    );
// gw.debug = true
    await this.findByText('Gateway initialised');
  }
}