#!/usr/bin/env node
import createYargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { TimeldSession } from './Session.mjs';
import { isConfigKey, mergeConfig, readConfig, writeConfig } from './config.mjs';

// Pull variables from .env file into process.env
dotenv.config();

baseYargs()
  .env('TIMELD')
  .config(readConfig())
  .option('logLevel', {
    default: process.env.LOG
  })
  .option('organisation', {
    alias: 'org',
    type: 'string'
  })
  .command(
    ['config', 'cfg'],
    'Inspect or set local configuration',
    yargs => yargs,
    argv => configCmd(argv)
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
        const [org, ts] = argv.timesheet.split('/');
        if (ts != null) {
          argv.timesheet = ts;
          argv.organisation = org;
        }
      }, true)
      .demandOption('organisation')
      .option('create', {
        describe: 'Create the timesheet if it doesn\'t already exist',
        type: 'boolean'
      })
      .check(argv => {
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

