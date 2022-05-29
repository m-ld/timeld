import { clone, Env, TimesheetId } from 'timeld-common';
import { createWriteStream } from 'fs';
import { once } from 'events';
import GatewayClient from './GatewayClient.mjs';
import DomainConfigurator from './DomainConfigurator.mjs';
import Session from './Session.mjs';
import readline from 'readline';
import { promisify } from 'util';

export default class Cli {
  constructor({
    args = undefined,
    // By default, do not read environment variables into config
    env = new Env({ env: false }),
    input = process.stdin,
    output = process.stdout,
    console = global.console
  } = {}) {
    this.args = args;
    this.env = env;
    this.input = input;
    this.output = output;
    this.console = console;
  }

  async start() {
    return (await this.env.yargs(this.args))
      .option('account', { alias: 'acc', type: 'string' })
      .option('gateway', { alias: 'gw' /*no type, allows --no-gateway*/ })
      .option('principal.@id', { alias: 'user', type: 'string' })
      .command(
        ['config', 'cfg'],
        'Inspect or set local configuration',
        yargs => yargs,
        argv => this.configCmd(argv)
      )
      .command(
        ['list', 'ls'],
        'List local timesheets',
        yargs => yargs,
        () => this.listCmd()
      )
      .command(
        ['remove <timesheet>', 'rm'],
        'Remove a local timesheet',
        yargs => yargs
          .boolean('really')
          .positional('timesheet', { type: 'string' }),
        argv => this.removeCmd(argv)
      )
      .command(
        ['open <timesheet>', 'o'],
        'open a timesheet session',
        yargs => yargs
          .positional('timesheet', {
            describe: 'Timesheet identity, can include ' +
              'account as `account/timesheet`',
            type: 'string'
          })
          .middleware(argv => {
            const { timesheet, account, gateway } =
              TimesheetId.fromString(argv.timesheet);
            if (gateway != null)
              argv.gateway = gateway;
            if (account != null)
              argv.account = account;
            argv.timesheet = timesheet;
          }, true)
          .option('create', {
            type: 'boolean', describe: 'Force creation of new timesheet'
          })
          .demandOption('account')
          .check(argv => {
            new TimesheetId(argv).validate();
            return true;
          }),
        argv => this.openCmd(argv))
      .demandCommand()
      .strictCommands()
      .help()
      .parseAsync();
  }

  /**
   * @param {Partial<TimeldConfig>} argv
   * @returns {Promise<void>}
   */
  async openCmd(argv) {
    try {
      const gateway = argv.gateway ? new GatewayClient(argv.gateway) : null;
      const config = await this.loadMeldConfig(argv, gateway);
      // Start the m-ld clone
      const { meld, logFile } = await this.createMeldClone(config);
      return this.createSession(config, meld, logFile)
        .start({ console: this.console });
    } catch (e) {
      if (e.status === 5031) {
        this.console.info('This timesheet does not exist.');
        this.console.info('Use the --create flag to create it');
      }
      throw e;
    }
  }

  async loadMeldConfig(argv, gateway) {
    const { input, output } = this;
    const rl = readline.createInterface({ input, output });
    try {
      const ask = promisify(rl.question).bind(rl);
      const config = await new DomainConfigurator(argv, gateway, ask).load();
      // Save any new globally-applicable config
      await this.env.updateConfig(...Cli.globalConfigs(config));
      return config;
    } finally {
      rl.close();
    }
  }

  /** Picks out configuration that makes sense to store as global defaults */
  static *globalConfigs(config) {
    yield { ably: { key: config['ably']?.key } };
    yield { principal: { '@id': config['principal']?.['@id'] } };
  }

  /**
   * @param {TimeldConfig} config
   * @returns {Promise<{meld: import('@m-ld/m-ld').MeldClone, logFile: string}>}
   */
  async createMeldClone(config) {
    const tsId = TimesheetId.fromDomain(config['@domain']);
    const logFile = await this.setUpLogging(tsId.toPath());
    const dataDir = await this.env.readyPath('data', ...tsId.toPath());
    // noinspection JSCheckFunctionSignatures
    return { meld: await clone(config, dataDir), logFile };
  }

  /**
   * @param {TimeldConfig} config
   * @param {import('@m-ld/m-ld').MeldClone} meld
   * @param {string} logFile
   * @returns {Session}
   */
  createSession(config, meld, logFile) {
    return new Session({
      id: config['@id'],
      timesheet: config.timesheet,
      providerId: config.principal['@id'],
      meld,
      logFile,
      logLevel: config.logLevel
    });
  }

  /**
   * @param {string[]} path
   * @returns {Promise<string>} the log file being used
   * @private
   */
  async setUpLogging(path) {
    // Substitute the global console so we don't get m-ld logging
    const logFile = `${await this.env.readyPath('log', ...path)}.log`;
    const logStream = createWriteStream(logFile, { flags: 'a' });
    await once(logStream, 'open');
    global.console = new console.Console(logStream, logStream);
    return logFile;
  }

  /**
   * `config` command handler for setting or showing configuration
   * @param {object} argv
   */
  async configCmd(argv) {
    // Determine what the options would be without env and config
    const cliArgv = this.env.baseYargs(this.args).argv;
    if (Object.keys(cliArgv).some(Env.isConfigKey)) {
      // Setting one or more config options
      await this.env.updateConfig(cliArgv);
    } else {
      // Showing config options
      const allArgv = { ...argv }; // yargs not happy if argv is edited
      for (let key in cliArgv)
        delete allArgv[key];
      this.console.log('Current configuration:', allArgv);
    }
  }

  async listCmd() {
    for (let dir of await this.env.envDirs('data'))
      this.console.log(TimesheetId.fromPath(dir).toString());
  }

  /**
   * @param {*} argv.timesheet as tmId
   * @param {boolean} [argv.really]
   */
  async removeCmd(argv) {
    const { timesheet, account, gateway } = TimesheetId.fromString(argv.timesheet);
    const pattern = new RegExp(
      `${account || '[\\w-]+'}/${timesheet || '[\\w-]+'}@${gateway ||  '[\\w-.]*'}`,
      'g');
    if (!argv.really)
      this.console.info('If you use --really, ' +
        'these local timesheets will be deleted:');
    for (let path of await this.env.envDirs('data')) {
      const tsId = TimesheetId.fromPath(path);
      if (tsId.toString().match(pattern)) {
        if (argv.really) {
          await this.env.delEnvDir('data', path, { force: true });
          await this.env.delEnvFile('log', (path.join('/') + '.log').split('/'));
        } else {
          this.console.log(tsId.toString());
        }
      }
    }
  }
}