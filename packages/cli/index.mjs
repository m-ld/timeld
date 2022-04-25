#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { TimeldSession } from './Session.mjs';

dotenv.config();
function checkId(id) {
  if (!id.match(/[\w-]+/g))
    throw `${id} should contain only alphanumerics & dashes`;
}

yargs(hideBin(process.argv))
  .option('logLevel', {
    default: process.env.LOG,
    global: true
  })
  .option('dryRun', {
    describe: 'Show request but do not execute',
    type: 'boolean',
    global: true
  })
  .option('organisation', {
    alias: 'org',
    type: 'string',
    global: true
  })
  .env('CLI')
  // TODO: config command to set/get config in env_paths, e.g. ably keys
  .command(
    '$0 <timesheet>',
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
  .help()
  .parse();
