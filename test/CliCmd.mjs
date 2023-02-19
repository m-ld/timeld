import Cmd from './Cmd.mjs';
import path from 'path';
import { readFileSync } from 'fs';

export default class CliCmd extends Cmd {
  /**
   * @param {string} username
   * @param {string} [device]
   */
  constructor(username, ...device) {
    super(username, ...device);
    this.username = username;
    this.dataDir = this.createDir();
    this.configDir = this.createDir();
  }

  run(...args) {
    this.log('⇐', 'timeld', ...args);
    return super.run(
      path.join(process.cwd(), 'packages', 'cli', 'index.mjs'),
      ...args, {
        env: {
          TIMELD_CLI_CONFIG_PATH: this.configDir,
          TIMELD_CLI_DATA_PATH: this.dataDir,
          LOG_LEVEL: 'debug'
        }
      });
  }

  async configure() {
    await this.run('config',
      '--gateway', 'http://timeld.ex.org@localhost:8080',
      '--user', this.username);
    await this.waitForExit();
  }

  /**
   * Wait for next prompt and optionally type a command there
   * @param [command] to type at the prompt
   */
  async nextPrompt(command) {
    await this.findByText(/\w+>[\s\n]*$/);
    if (command)
      this.type(`${command}`);
  }

  /** Convenience to exit a CLI normally */
  async exit() {
    await this.nextPrompt('exit');
    await this.waitForExit();
  }

  /**
   * Convenience to activate a CLI with a new user key
   * @param {Cmd} gw
   */
  async activate(gw) {
    await this.run('admin');
    await this.findByText('enter your email address');
    const email = `${this.username}@ex.org`;
    this.type(`${email}`);
    let code = null;
    await gw.findByText(content => {
      [, code] = content.match(`ACTIVATION ${email} (\\d{6})`) ?? [];
      return code != null;
    });
    gw.clear();
    await this.findByText('enter the activation code');
    this.type(`${code}`);
    await this.exit();
  }

  /**
   * Convenience to get config
   */
  readConfig() {
    const configFilePath = path.join(this.configDir, 'config.json');
    return JSON.parse(/**@type string*/readFileSync(configFilePath, 'utf8'));
  }
}