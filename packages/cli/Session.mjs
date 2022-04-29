import { Repl } from '@m-ld/m-ld-cli/lib/Repl.js';
import { Proc, SyncProc } from '@m-ld/m-ld-cli/lib/Proc.js';
import fileCmd from '@m-ld/m-ld-cli/cmd/repl/file.js';
import { clone, uuid } from '@m-ld/m-ld';
import { join } from 'path';
import { getInstance as ably } from '@m-ld/m-ld-cli/ext/ably.js';
import leveldown from 'leveldown';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, readFile, truncate as truncateFile } from 'fs/promises';
import { once } from 'events';
import parseDuration from 'parse-duration';
import { parseDate } from 'chrono-node';
import { ResultsProc } from './ResultsProc.mjs';
import { envPaths } from './config.mjs';
import { dateJsonLd } from './util.mjs';
import { Entry } from './Entry.mjs';
import { DefaultFormat, jsonLdFormat } from './Format.mjs';
import { fetchJson } from '@m-ld/io-web-runtime/dist/server/fetch';

const timeldContext = JSON.parse(
  await readFile(new URL('./context.json', import.meta.url), 'utf8'));

export class TimeldSession extends Repl {
  /**
   * @param {Partial<import('@m-ld/m-ld').MeldConfig>} argv
   * @param {string | false} [argv.gateway]
   * @param {string} argv.organisation
   * @param {string} argv.timesheet
   * @param {boolean} [argv.create]
   */
  constructor(argv) {
    super({ logLevel: argv.logLevel, prompt: `${argv.timesheet}>` });
    this.id = uuid();
    this.startTime = new Date;
    this.argv = argv;
    this.console = console;
    this.nextTaskId = 1;
  }

  async start(opts) {
    try {
      // Fetch configuration from the gateway
      this.config = {
        ...await this.fetchGatewayConfig(),
        // Command-line options override gateway config
        // TODO: sounds dangerous
        ...this.argv,
        // These items cannot be overridden
        '@id': this.id,
        '@context': timeldContext
      };
      await this.setUpLogging();
      // Start the m-ld clone
      // noinspection JSCheckFunctionSignatures
      this.meld = await clone(
        leveldown(await this.getUserPath('data')),
        await ably(this.config),
        this.config);
      super.start({ console: this.console });
    } catch (e) {
      if (e.status === 5031) {
        this.console.info('This timesheet does not exist.');
        this.console.info('Use the --create flag to create it');
      } else {
        this.console.error(e.message || e);
      }
    }
  }

  /**
   * Fetch the config from the gateway (if specified). Options:
   * - Remote gateway is reachable and provides base config, e.g. domain,
   * genesis & API keys
   * - Specified gateway is not reachable: we don't know whether the requested
   * timesheet is genesis, so rely on --create flag. If it was set and later
   * turns out to have been wrong, we will go to "merge" behaviour TODO
   * - --no-gateway requires long-lived ably key and uses Ably App ID as base
   * domain
   *
   * @returns {Promise<Partial<import('@m-ld/m-ld').MeldConfig>>}
   */
  async fetchGatewayConfig() {
    const { gateway, organisation, timesheet, create } = this.argv;
    if (!gateway) { // could be false or undefined
      // see https://faqs.ably.com/how-do-i-find-my-app-id
      const appId = /**@type string*/this.argv['ably']?.key?.split('.')[0];
      if (appId == null)
        throw 'Gateway-less use requires an Ably API key.\n' +
        'See https://faqs.ably.com/what-is-an-app-api-key';
      // The domain is scoped to the Ably App. We use "timeld" and the app key
      // just in case there are other real apps running in the same Ably App.
      return this.noGatewayConfig(`timeld.${appId.toLowerCase()}`);
    } else {
      let gatewayConfig;
      try {
        gatewayConfig = await fetchJson(
          `https://${gateway}/api/${organisation}/${timesheet}/config`);
      } catch (e) {
        this.console.info(`Gateway ${gateway} is not reachable (${e})`);
        return this.noGatewayConfig(gateway);
      }
      if (create && !gatewayConfig.genesis)
        throw 'This timesheet already exists';
      return gatewayConfig;
    }
  }

  noGatewayConfig(rootDomain) {
    const { organisation, timesheet, create } = this.argv;
    return {
      genesis: create, // Will be ignored if true but domain exists locally
      '@domain': `${timesheet}.${organisation}.${rootDomain}`
    };
  }

  buildCommands(yargs, ctx) {
    const COMPLETES_TASK = '. Using this option will mark the task complete.';
    // noinspection JSCheckFunctionSignatures
    return yargs
      .updateStrings({ 'Positionals:': 'Details:' })
      .command(fileCmd(ctx))
      .command(
        'log',
        'fetch the timesheet system log',
        yargs => yargs
          .boolean('truncate')
          .boolean('status')
          .boolean('config')
          .conflicts('truncate', 'config')
          .conflicts('truncate', 'status'),
        argv => ctx.exec(
          () => this.logProc(argv))
      )
      .command(
        ['add <task> [duration]', 'a', '+'],
        'Add a new timesheet entry',
        yargs => yargs
          .positional('task', {
            describe: 'The name of the task being worked on',
            type: 'string'
          })
          .positional('duration', {
            describe: 'The duration of the task e.g. 1h' + COMPLETES_TASK,
            type: 'string',
            coerce: arg => parseDuration(arg)
          })
          .option('start', {
            describe: 'The start date/time of the task',
            type: 'array',
            default: ['now'],
            coerce: arg => parseDate(arg.join(' '))
          })
          .option('end', {
            describe: 'The end date & time of the task' + COMPLETES_TASK,
            type: 'array',
            coerce: arg => parseDate(arg.join(' '))
          }),
        argv => ctx.exec(
          () => this.addTaskProc(argv))
      )
      .command(
        ['modify <selector> [duration]', 'mod', 'm'],
        'Change the value of an existing entry',
        yargs => yargs
          .positional('selector', {
            // TODO: entry by [task and] date-time e.g. "work yesterday 12pm"
            describe: 'Entry to modify, using a number or a task name'
          })
          .positional('duration', {
            describe: 'The new duration of the task e.g. 1h',
            type: 'string',
            coerce: arg => parseDuration(arg)
          })
          .option('start', {
            describe: 'The new start date & time of the task',
            type: 'array',
            coerce: arg => parseDate(arg.join(' '))
          })
          .option('end', {
            describe: 'The new end date & time of the task',
            type: 'array',
            coerce: arg => parseDate(arg.join(' '))
          })
          .check(argv => {
            if (argv.start == null && argv.end == null && argv.duration == null)
              return 'Please specify something to modify: duration, --start, or --end';
            return true;
          }),
        argv => ctx.exec(
          () => this.modifyEntryProc(argv))
      )
      .command(
        ['list [selector]', 'ls'],
        'List a selection of entries',
        yargs => yargs
          .positional('selector', {
            describe: 'A time range, like "today" or "this month"',
            type: 'string',
            default: 'today'
          })
          .option('format', {
            describe: 'Timesheet format to use',
            choices: [
              'default',
              'JSON-LD', 'json-ld', 'ld'
            ],
            default: 'default'
          }),
        argv => ctx.exec(
          () => this.listTasksProc(argv))
      );
  }

  /**
   * @param {string} selector
   * @param {'default'|'JSON-LD'} format
   * @returns {Proc}
   */
  listTasksProc({ selector, format }) {
    // TODO: selectors
    return new ResultsProc(this.meld.read({
      '@describe': '?task',
      '@where': { '@id': '?task', '@type': 'TimesheetEntry' }
    }), {
      'JSON-LD': jsonLdFormat,
      'json-ld': jsonLdFormat,
      ld: jsonLdFormat
    }[format] || new DefaultFormat(this));
  }

  /**
   * @param {string | number} selector Entry to modify, using a number or a task name
   * @param {number} [duration] in millis
   * @param {Date} [start]
   * @param {Date} [end]
   * @returns {Proc}
   */
  modifyEntryProc({ selector, duration, start, end }) {
    // TODO: selector is not specific enough?
    const proc = new PromiseProc(this.meld.write(async state => {
      async function updateEntry(src) {
        const entry = Entry.fromJSON(src);
        if (start != null)
          entry.start = start;
        if (end != null)
          entry.end = end;
        if (end == null && duration != null)
          entry.end = new Date(entry.start.getTime() + duration);
        proc.emit('message', entry.toString());
        return state.write({
          '@delete': src,
          '@insert': entry.toJSON()
        });
      }
      if (typeof selector == 'number') {
        const src = await state.get(`${this.id}/${selector}`);
        if (src != null)
          await updateEntry(src);
        else
          throw 'No such task sequence number found in this session.';
      } else {
        for (let src of await state.read({
          '@describe': '?id',
          '@where': {
            '@id': '?id',
            '@type': 'TimesheetEntry',
            task: selector
          }
        })) {
          state = await updateEntry(src);
        }
      }
    }));
    return proc;
  }

  /**
   * @param {string} task
   * @param {number} [duration] in millis
   * @param {Date} start
   * @param {Date} [end]
   * @returns {Proc}
   */
  addTaskProc({ task, duration, start, end }) {
    // TODO: Replace use of console with proc 'message' events
    if (end == null && duration != null)
      end = new Date(start.getTime() + duration);
    const entry = new Entry({
      seqNo: `${this.nextTaskId++}`, sessionId: this.id, task, start, end
    });
    this.console.info(entry.toString());
    this.console.info('Use a "modify" command if this is wrong.');
    return new PromiseProc(this.meld.write({
      '@graph': [entry.toJSON(), this.toJSON()]
    }));
  }

  /**
   * @param {boolean} [truncate]
   * @param {boolean} [status]
   * @param {boolean} [config]
   * @returns {Proc}
   */
  logProc({ truncate, status, config }) {
    if (truncate) {
      return new PromiseProc(truncateFile(this.logFile));
    } else if (status || config) {
      if (config)
        this.console.log('Config:', this.config);
      if (status)
        this.console.log('Status:', this.meld.status.value);
    } else {
      return new SyncProc(createReadStream(this.logFile));
    }
  }

  async setUpLogging() {
    // Substitute the global console so we don't get m-ld logging
    this.logFile = `${await this.getUserPath('log')}.log`;
    const logStream = createWriteStream(this.logFile, { flags: 'a' });
    await once(logStream, 'open');
    console = new console.Console(logStream, logStream);
  }

  /**
   * Gets the user-data environment path for the current timesheet and given
   * purpose. Ensures that the parent organisation directory exists.
   *
   * @param {'log' | 'data'} key
   */
  async getUserPath(key) {
    const [timesheet, ...root] = this.config['@domain'].split('.');
    const orgDir = join(envPaths[key], ...root.reverse());
    await mkdir(orgDir, { recursive: true });
    return join(orgDir, timesheet);
  }

  toJSON() {
    return {
      '@id': this.id,
      '@type': 'TimesheetSession',
      start: dateJsonLd(this.startTime)
    };
  }

  async close() {
    await this.meld?.close();
    await super.close();
  }
}

class PromiseProc extends Proc {
  /** @param {Promise} promise */
  constructor(promise) {
    super();
    promise.then(() => this.setDone(), this.setDone);
  }
}
