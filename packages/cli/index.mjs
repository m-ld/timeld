#!/usr/bin/env node
import createYargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { Session } from './lib/Session.mjs';
import {
  delEnvDir, delEnvFile, envDirs, isConfigKey, mergeConfig, readConfig, readyEnvPath, writeConfig
} from './lib/config.mjs';
import { DomainConfigurator } from './lib/DomainConfigurator.mjs';
import { createWriteStream } from 'fs';
import { once } from 'events';
import { clone } from '@m-ld/m-ld';
import leveldown from 'leveldown';
import { getInstance as ably } from '@m-ld/m-ld-cli/ext/ably.js';
import { TimesheetId } from './lib/TimesheetId.mjs';
import { Gateway } from './lib/Gateway.mjs';

// Pull variables from .env file into process.env
dotenv.config();

/**
 * @typedef {import('@m-ld/m-ld').MeldConfig} SessionConfig
 * @property {string | false} [gateway]
 * @property {string} account
 * @property {import('@m-ld/m-ld').Reference} principal
 * @property {string} timesheet
 * @property {boolean} [create]
 */

baseYargs()
  .env('TIMELD')
  .config(readConfig())
  .option('logLevel', { default: process.env.LOG })
  .option('account', { alias: 'acc', type: 'string' })
  .option('gateway', { alias: 'gw' /*no type, allows --no-gateway*/ })
  .option('principal.@id', { alias: 'user', type: 'string' })
  .command(
    ['config', 'cfg'],
    'Inspect or set local configuration',
    yargs => yargs,
    argv => configCmd(argv)
  )
  .command(
    ['list', 'ls'],
    'List local timesheets',
    yargs => yargs,
    () => listCmd()
  )
  .command(
    ['remove <timesheet>', 'rm'],
    'Remove a local timesheet',
    yargs => yargs
      .boolean('really')
      .positional('timesheet', { type: 'string' }),
    argv => removeCmd(argv)
  )
  .command(
    ['open <timesheet>', 'o'],
    'begin a timesheet session',
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
    async argv => {
      const gateway = argv.gateway ? new Gateway(argv.gateway) : null;
      const config = await new DomainConfigurator(argv, gateway).load();
      const tsId = TimesheetId.fromDomain(config['@domain']);
      const { logFile, commandConsole } = await setUpLogging(tsId.toPath());
      try {
        // Start the m-ld clone
        // noinspection JSCheckFunctionSignatures
        const meld = await clone(
          leveldown(readyEnvPath('data', tsId.toPath())),
          await ably(config),
          config);
        return new Session({
          id: config['@id'],
          timesheet: config.timesheet,
          providerId: config.principal['@id'],
          meld,
          logFile,
          logLevel: config.logLevel
        }).start({ console: commandConsole });
      } catch (e) {
        if (e.status === 5031) {
          commandConsole.info('This timesheet does not exist.');
          commandConsole.info('Use the --create flag to create it');
        } else {
          commandConsole.error(e.message || e);
        }
      }
    })
  .demandCommand()
  .strictCommands()
  .help()
  .parse();

function baseYargs() {
  return createYargs(hideBin(process.argv))
    .parserConfiguration({ 'strip-dashed': true, 'strip-aliased': true });
}

/**
 * @param {string[]} path
 * @returns {Promise<{logFile: string, commandConsole: Console}>} the log file being used
 */
async function setUpLogging(path) {
  // Substitute the global console so we don't get m-ld logging
  const logFile = `${readyEnvPath('log', path)}.log`;
  const logStream = createWriteStream(logFile, { flags: 'a' });
  await once(logStream, 'open');
  const commandConsole = console;
  console = new console.Console(logStream, logStream);
  return { logFile, commandConsole };
}

/**
 * `config` command handler for setting or showing configuration
 * @param {object} argv
 */
function configCmd(argv) {
  // Determine what the options would be without env and config
  const cliArgv = baseYargs().argv;
  if (Object.keys(cliArgv).some(isConfigKey)) {
    // Setting one or more config options
    writeConfig(mergeConfig(readConfig(), cliArgv));
  } else {
    // Showing config options
    const allArgv = { ...argv }; // yargs not happy if argv is edited
    for (let key in cliArgv) delete allArgv[key];
    console.log('Current configuration:', allArgv);
  }
}

function listCmd() {
  for (let dir of envDirs('data'))
    console.log(TimesheetId.fromPath(dir).toString());
}

/**
 * @param {*} argv.timesheet as tmId
 * @param {boolean} [argv.really]
 */
function removeCmd(argv) {
  const { timesheet, account, gateway } = TimesheetId.fromString(argv.timesheet);
  const pattern = new RegExp(
    `${account || '[\\w-]+'}/${timesheet || '[\\w-]+'}@${gateway ||  '[\\w-.]*'}`,
    'g');
  if (!argv.really)
    console.info('If you use --really, ' +
      'these local timesheets will be deleted:');
  for (let path of envDirs('data')) {
    const tsId = TimesheetId.fromPath(path);
    if (tsId.toString().match(pattern)) {
      if (argv.really) {
        delEnvDir('data', path, { force: true });
        delEnvFile('log', (path.join('/') + '.log').split('/'));
      } else {
        console.log(tsId.toString());
      }
    }
  }
}
