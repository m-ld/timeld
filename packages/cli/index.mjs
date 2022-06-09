#!/usr/bin/env node
import Cli from './lib/Cli.mjs';
import { Env } from 'timeld-common';

/**
 * @typedef {import('@m-ld/m-ld/dist/ably').MeldAblyConfig} TimeldConfig
 * @property {string | URL | false} [gateway]
 * @property {string} user User account (may not be the same as timesheet account)
 * @property {string} account Timesheet account (default in config)
 * @property {string} timesheet Timesheet name
 * @property {boolean} [create]
 */

// Support override of config path for testing
const env = new Env({
  config: process.env.TIMELD_CLI_CONFIG_PATH
});
await new Cli(env).start();
