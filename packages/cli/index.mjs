#!/usr/bin/env node
import Cli from './lib/Cli.mjs';
import { Env } from 'timeld-common';

/**
 * @typedef {import('@m-ld/m-ld/dist/ably').MeldAblyConfig} TimeldConfig
 * @property {string | URL | false} [gateway]
 * @property {string} account
 * @property {import('@m-ld/m-ld').Reference} principal
 * @property {string} timesheet
 * @property {boolean} [create]
 */

// By default, do not read environment variables into config,
// and support override of config path (for testing)
const env = new Env({
  env: false,
  config: process.env.TIMELD_CLI_CONFIG_PATH
});
await new Cli(env).start();
