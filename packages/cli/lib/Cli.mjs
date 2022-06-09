import { clone, Env, TimesheetId } from 'timeld-common';
import { createWriteStream } from 'fs';
import { once } from 'events';
import GatewayClient from './GatewayClient.mjs';
import DomainConfigurator from './DomainConfigurator.mjs';
import Session from './Session.mjs';
import readline from 'readline';
import { promisify } from 'util';

export default class Cli {
  /**
   * @param {Env} env
   * @param {string[]} [args]
   * @param input
   * @param output
   * @param console
   */
  constructor(env, {
    args = undefined,
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
      .option('account', {
        alias: 'acc',
        type: 'string',
        describe: 'The default account for creating timesheets'
      })
      .option('gateway', {
        alias: 'gw',
        /*no type, allows --no-gateway*/
        describe: 'The timeld Gateway, as a URL or domain name'
      })
      .option('user', {
        alias: 'u',
        type: 'string',
        describe: 'The user account, as a URL or a name',
      })
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
          .boolean('force')
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
            // Interpret a timesheet with account and/or gateway
            const { timesheet, account, gateway } =
              TimesheetId.fromString(argv.timesheet);
            if (gateway != null)
              argv.gateway = gateway;
            if (account != null)
              argv.account = account;
            argv.timesheet = timesheet;
            // If a user is provided but no account, use the user account
            if (argv.gateway != null && argv.account == null)
              argv.account = argv.user;
          }, true)
          .option('create', {
            type: 'boolean', describe: 'Force creation of new timesheet'
          })
          // Timesheet account must exist; user account checked in domain config
          .demandOption('account')
          .demandOption('user')
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
      const { config, principal } = await this.loadMeldConfig(argv, gateway);
      // Start the m-ld clone
      const { meld, logFile } = await this.createMeldClone(config, principal);
      return this.createSession(config, principal, meld, logFile)
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
      const { config, principal } = await new DomainConfigurator(argv, gateway, ask).load();
      // Save any new globally-applicable config
      await this.env.updateConfig(...Cli.globalConfigs(config));
      return { config, principal };
    } finally {
      rl.close();
    }
  }

  /** Picks out configuration that makes sense to store as global defaults */
  static *globalConfigs(config) {
    yield { user: config.user };
    yield { ably: { key: config['ably']?.key } };
  }

  /**
   * @param {TimeldConfig} config
   * @param {import('@m-ld/m-ld').AppPrincipal} principal
   * @returns {Promise<{meld: import('@m-ld/m-ld').MeldClone, logFile: string}>}
   */
  async createMeldClone(config, principal) {
    const tsId = TimesheetId.fromDomain(config['@domain']);
    const logFile = await this.setUpLogging(tsId.toPath());
    const dataDir = await this.env.readyPath('data', ...tsId.toPath());
    // noinspection JSCheckFunctionSignatures
    return { meld: await clone(config, dataDir, principal), logFile };
  }

  /**
   * @param {TimeldConfig} config
   * @param {import('@m-ld/m-ld').AppPrincipal} principal
   * @param {import('@m-ld/m-ld').MeldClone} meld
   * @param {string} logFile
   * @returns {Session}
   */
  createSession(config, principal, meld, logFile) {
    return new Session({
      id: config['@id'],
      timesheet: config.timesheet,
      providerId: principal['@id'],
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
   * @param {boolean} [argv.force]
   */
  async removeCmd(argv) {
    const { timesheet, account, gateway } = TimesheetId.fromString(argv.timesheet);
    const pattern = new RegExp(
      `${account || '[\\w-]+'}/${timesheet || '[\\w-]+'}@${gateway ||  '[\\w-.]*'}`,
      'g');
    if (!argv.force)
      this.console.info('If you use --force, ' +
        'these local timesheets will be deleted:');
    for (let path of await this.env.envDirs('data')) {
      const tsId = TimesheetId.fromPath(path);
      if (tsId.toString().match(pattern)) {
        if (argv.force) {
          await this.env.delEnvDir('data', path, { force: true });
          await this.env.delEnvFile('log', (path.join('/') + '.log').split('/'));
        } else {
          this.console.log(tsId.toString());
        }
      }
    }
  }
}