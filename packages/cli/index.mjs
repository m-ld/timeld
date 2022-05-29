#!/usr/bin/env node
import Cli from './lib/Cli.mjs';

/**
 * @typedef {import('@m-ld/m-ld/dist/ably').MeldAblyConfig} TimeldConfig
 * @property {string | URL | false} [gateway]
 * @property {string} account
 * @property {import('@m-ld/m-ld').Reference} principal
 * @property {string} timesheet
 * @property {boolean} [create]
 */

await new Cli().start();
