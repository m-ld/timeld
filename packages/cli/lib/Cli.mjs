import { hideBin } from 'yargs/helpers';
import createYargs from 'yargs';
import Config from './Config.mjs';
import { createWriteStream } from 'fs';
import { once } from 'events';
import TimesheetId from './TimesheetId.mjs';
import Gateway from './Gateway.mjs';
import DomainConfigurator from './DomainConfigurator.mjs';
import { clone } from '@m-ld/m-ld';
import leveldown from 'leveldown';
import { getInstance as ably } from '@m-ld/m-ld-cli/ext/ably.js';
import Session from './Session.mjs';

export default class Cli {
  constructor(
    args = hideBin(process.argv),
    config = new Config(),
    console = global.console
  ) {
    this.args = args;
    this.config = config;
    this.console = console;
  }

  start() {
    return this.baseYargs()
      .env('TIMELD')
      .config(this.config.read())
      .option('logLevel', { default: process.env.LOG })
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
      const gateway = argv.gateway ? new Gateway(argv.gateway) : null;
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

  /**
   * @param {TimeldConfig} config
   * @returns {Promise<{meld: import('@m-ld/m-ld').MeldClone, logFile: string}>}
   */
  async createMeldClone(config) {
    const tsId = TimesheetId.fromDomain(config['@domain']);
    const logFile = await this.setUpLogging(tsId.toPath());
    // noinspection JSCheckFunctionSignatures
    return {
      meld: await clone(
        leveldown(this.config.readyEnvPath('data', tsId.toPath())),
        await ably(config),
        config),
      logFile
    };
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

  loadMeldConfig(argv, gateway) {
    return new DomainConfigurator(argv, gateway).load();
  }

  /**
   * @param {string[]} path
   * @returns {Promise<string>} the log file being used
   */
  async setUpLogging(path) {
    // Substitute the global console so we don't get m-ld logging
    const logFile = `${this.config.readyEnvPath('log', path)}.log`;
    const logStream = createWriteStream(logFile, { flags: 'a' });
    await once(logStream, 'open');
    global.console = new console.Console(logStream, logStream);
    return logFile;
  }

  /**
   * `config` command handler for setting or showing configuration
   * @param {object} argv
   */
  configCmd(argv) {
    // Determine what the options would be without env and config
    const cliArgv = this.baseYargs().argv;
    if (Object.keys(cliArgv).some(Config.isConfigKey)) {
      // Setting one or more config options
      this.config.write(this.config.merge(this.config.read(), cliArgv));
    } else {
      // Showing config options
      const allArgv = { ...argv }; // yargs not happy if argv is edited
      for (let key in cliArgv)
        delete allArgv[key];
      this.console.log('Current configuration:', allArgv);
    }
  }

  listCmd() {
    for (let dir of this.config.envDirs('data'))
      this.console.log(TimesheetId.fromPath(dir).toString());
  }

  /**
   * @param {*} argv.timesheet as tmId
   * @param {boolean} [argv.really]
   */
  removeCmd(argv) {
    const { timesheet, account, gateway } = TimesheetId.fromString(argv.timesheet);
    const pattern = new RegExp(
      `${account || '[\\w-]+'}/${timesheet || '[\\w-]+'}@${gateway ||  '[\\w-.]*'}`,
      'g');
    if (!argv.really)
      this.console.info('If you use --really, ' +
        'these local timesheets will be deleted:');
    for (let path of this.config.envDirs('data')) {
      const tsId = TimesheetId.fromPath(path);
      if (tsId.toString().match(pattern)) {
        if (argv.really) {
          this.config.delEnvDir('data', path, { force: true });
          this.config.delEnvFile('log', (path.join('/') + '.log').split('/'));
        } else {
          this.console.log(tsId.toString());
        }
      }
    }
  }

  /**
   * @private
   * @returns {yargs.Argv<{}>}
   */
  baseYargs() {
    return createYargs(this.args)
      .parserConfiguration({ 'strip-dashed': true, 'strip-aliased': true });
  }
}