import { AccountOwnedId, clone, Env } from 'timeld-common';
import { createWriteStream } from 'fs';
import { once } from 'events';
import GatewayClient from './GatewayClient.mjs';
import DomainConfigurator from './DomainConfigurator.mjs';
import TimesheetSession from './TimesheetSession.mjs';
import readline from 'readline';
import { promisify } from 'util';
import AdminSession from './AdminSession.mjs';

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
    return this.addOptions(await this.env.yargs(this.args))
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
        'Open a timesheet session',
        yargs => yargs
          .positional('timesheet', {
            describe: 'Timesheet identity, can include ' +
              'account as `account/timesheet`',
            type: 'string'
          })
          .middleware(argv => {
            // Interpret a timesheet with account and/or gateway
            const { name, account, gateway } =
              AccountOwnedId.fromString(argv.timesheet);
            if (gateway != null)
              argv.gateway = gateway;
            if (account != null)
              argv.account = account;
            argv.timesheet = name;
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
            const { timesheet, account } = argv;
            new AccountOwnedId({ name: timesheet, account }).validate();
            return true;
          }),
        argv => this.openCmd(argv)
      )
      .command(
        ['admin', 'a'],
        'Start an administration session',
        yargs => yargs
          .middleware(argv => {
            // If a user is provided but no account, use the user account
            if (argv.account == null)
              argv.account = argv.user;
          }, true)
          .demandOption('gateway')
          .demandOption('account')
          .demandOption('user'),
        argv => this.adminCmd(argv)
      )
      .demandCommand()
      .strictCommands()
      .help()
      .parseAsync();
  }

  /**
   * @param {yargs.Argv<{}>} argv
   * @returns {yargs.Argv<{}>} provided yargs with options added
   */
  addOptions(argv) {
    return argv
      .option('account', {
        alias: 'acc',
        type: 'string',
        describe: 'The default account for creating timesheets or admin'
      })
      .option('gateway', {
        alias: 'gw',
        /*no type, allows --no-gateway*/
        describe: 'The timeld Gateway, as a URL or domain name'
      })
      .option('user', {
        alias: 'u',
        type: 'string',
        describe: 'The user account, as a URL or a name'
      });
  }

  /**
   * @param {Partial<TimeldConfig>} argv
   * @returns {Promise<void>}
   */
  async openCmd(argv) {
    const gateway = argv.gateway ? await this.openGatewayClient(argv) : null;
    const { config, principal } = await new DomainConfigurator(argv, gateway).load();
    try {
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

  async adminCmd(argv) {
    const gateway = await this.openGatewayClient(argv);
    const { account, logLevel } = argv;
    new AdminSession({ gateway, account, logLevel })
      .start({ console: this.console });
  }

  async openGatewayClient(argv) {
    const { input, output } = this;
    const rl = readline.createInterface({ input, output });
    try {
      const ask = promisify(rl.question).bind(rl);
      const gateway = new GatewayClient(argv);
      await gateway.activate(ask);
      await this.env.updateConfig(gateway.accessConfig);
      return gateway;
    } finally {
      rl.close();
    }
  }

  /**
   * @param {TimeldConfig} config
   * @param {import('@m-ld/m-ld').AppPrincipal} principal
   * @returns {Promise<{meld: import('@m-ld/m-ld').MeldClone, logFile: string}>}
   */
  async createMeldClone(config, principal) {
    const tsId = AccountOwnedId.fromDomain(config['@domain']);
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
   * @returns {TimesheetSession}
   */
  createSession(config, principal, meld, logFile) {
    return new TimesheetSession({
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
    // Substitute the global console, so we don't get m-ld logging
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
    const cliArgv = this.addOptions(this.env.baseYargs(this.args)).argv;
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
      this.console.log(AccountOwnedId.fromPath(dir).toString());
  }
  /**
   * @param {*} argv.timesheet as tmId
   * @param {boolean} [argv.force]
   */
  async removeCmd(argv) {
    const { name, account, gateway } = AccountOwnedId.fromString(argv.timesheet);
    const pattern = new RegExp(
      `${account || '[\\w-]+'}/${name || '[\\w-]+'}@${gateway ||  '[\\w-.]*'}`,
      'g');
    if (!argv.force)
      this.console.info('If you use --force, ' +
        'these local timesheets will be deleted:');
    for (let path of await this.env.envDirs('data')) {
      const tsId = AccountOwnedId.fromPath(path);
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