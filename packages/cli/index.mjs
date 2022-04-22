#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { TimeldSession } from './Session.mjs';

dotenv.config();
const idPattern = /[\w-]+/g;

yargs(hideBin(process.argv))
  .option('logLevel', {
    default: process.env.LOG,
    global: true
  })
  .option('organisation', {
    alias: 'org',
    type: 'string',
    global: true
  })
  .env('CLI')
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
        const checkId = id => {
          if (!id.match(idPattern))
            throw `${id} should contain only alphanumerics & dashes`;
        };
        checkId(argv.organisation);
        checkId(argv.timesheet);
        return true;
      }),
    argv => new TimeldSession(argv).start())
  .help()
  .parse();
