#!/usr/bin/env node
import createYargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { TimeldSession } from './Session.mjs';
import {
  delEnvDir, delEnvFile, envDirs, isConfigKey, mergeConfig, readConfig, writeConfig
} from './config.mjs';

// Pull variables from .env file into process.env
dotenv.config();

baseYargs()
  .env('TIMELD')
  .config(readConfig())
  .option('logLevel', { default: process.env.LOG })
  .option('organisation', { alias: 'org', type: 'string' })
  .option('gateway', { alias: 'gw' /*no type, allows --no-gateway*/ })
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
          'organisation as `organisation/timesheet`',
        type: 'string'
      })
      .middleware(argv => {
        const { timesheet, organisation, gateway } = splitTsId(argv.timesheet);
        if (gateway != null)
          argv.gateway = gateway;
        if (organisation != null)
          argv.organisation = organisation;
        argv.timesheet = timesheet;
      }, true)
      .option('create', {
        type: 'boolean', describe: 'Force creation of new timesheet'
      })
      .demandOption('organisation')
      .check(argv => {
        if (typeof argv.gateway == 'string')
          argv.gateway.split('.').forEach(checkId);
        checkId(argv.organisation);
        checkId(argv.timesheet);
        return true;
      }),
    argv => new TimeldSession(argv).start())
  .demandCommand()
  .strictCommands()
  .help()
  .parse();

function checkId(id) {
  if (!id.match(/[\w-]+/g))
    throw `${id} should contain only alphanumerics & dashes`;
}

function baseYargs() {
  return createYargs(hideBin(process.argv))
    .parserConfiguration({ 'strip-dashed': true, 'strip-aliased': true });
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

function makeTsId({ organisation, timesheet, gateway }) {
  return `${organisation}/${timesheet}@${gateway}`;
}

/**
 * @param {string} tsId
 * @returns {{ timesheet: string, organisation?: string, gateway?: string }}
 */
function splitTsId(tsId) {
  const [orgTs, gateway] = tsId.split('@');
  const [organisation, timesheet] = orgTs.split('/');
  if (timesheet != null) // Organisation included
    return { organisation, timesheet, gateway };
  else // No organisation included
    return { timesheet: organisation, gateway };
}

function tsIdFromDir(dir) {
  const [timesheet, organisation, ...gateway] = [...dir].reverse();
  return makeTsId({
    organisation,
    timesheet,
    gateway: gateway.join('.')
  });
}

function listCmd() {
  for (let dir of envDirs('data'))
    console.log(tsIdFromDir(dir));
}

/**
 * @param {string} argv.timesheet as tmId
 * @param {boolean} argv.really
 */
function removeCmd(argv) {
  const { timesheet, organisation, gateway } = splitTsId(argv.timesheet);
  const pattern = new RegExp(
    `${organisation || '[\\w-]+'}/${timesheet || '[\\w-]+'}@${gateway ||  '[\\w-.]*'}`, 'g');
  if (!argv.really)
    console.info('If you use --really, ' +
      'these local timesheets will be deleted:');
  for (let path of envDirs('data')) {
    const tdId = tsIdFromDir(path);
    if (tdId.match(pattern)) {
      if (argv.really) {
        // TODO: co-dependent with Session user paths
        delEnvDir('data', path, { force: true });
        delEnvFile('log', (path.join('/') + '.log').split('/'));
      } else {
        console.log(tdId);
      }
    }
  }
}
