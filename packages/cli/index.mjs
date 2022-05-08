#!/usr/bin/env node
import dotenv from 'dotenv';
import Cli from './lib/Cli.mjs';

// Pull variables from .env file into process.env
dotenv.config();

/**
 * @typedef {import('@m-ld/m-ld').MeldConfig} TimeldConfig
 * @property {string | false} [gateway]
 * @property {string} account
 * @property {import('@m-ld/m-ld').Reference} principal
 * @property {string} timesheet
 * @property {boolean} [create]
 */

await new Cli().start();
