import { Repl } from '@m-ld/m-ld-cli/lib/Repl.js';
import { Proc, SyncProc } from '@m-ld/m-ld-cli/lib/Proc.js';
import fileCmd from '@m-ld/m-ld-cli/cmd/repl/file.js';
import { clone, uuid } from '@m-ld/m-ld';
import { join } from 'path';
import { getInstance as ably } from '@m-ld/m-ld-cli/ext/ably.js';
import leveldown from 'leveldown';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, truncate as truncateFile } from 'fs/promises';
import { once } from 'events';
import parseDuration from 'parse-duration';
import parseDate from 'date.js';
import { format as timeAgo } from 'timeago.js';
import { ResultsProc } from './ResultsProc.mjs';
import { envPaths } from './config.mjs';

export class TimeldSession extends Repl {
  /**
   * @param {Partial<import('@m-ld/m-ld').MeldConfig>} opts
   * @param {string} opts.organisation
   * @param {string} opts.timesheet
   * @param {boolean} opts.create
   */
  constructor(opts) {
    super({ logLevel: opts.logLevel, prompt: `${opts.timesheet}>` });
    const { timesheet, organisation } = opts;
    this.sessionId = uuid();
    this.config = {
      '@id': this.sessionId,
      // TODO: specify gateway to use
      // TODO: how to prevent conflicts, if offline?
      '@domain': `${timesheet}.${organisation}.timeld.org`,
      genesis: !!opts.create,
      ...opts
    };
    this.timesheet = timesheet;
    this.organisation = organisation;
    this.console = console;
    this.nextId = 1;
  }

  async start(opts) {
    try {
      await this.setUpLogging();
      // TODO: If no Ably, fork a socket.io server?
      // Start the m-ld clone
      // noinspection JSCheckFunctionSignatures
      this.meld = await clone(
        leveldown(await this.getUserPath('data')),
        await ably(this.config),
        this.config);
      super.start({ console: this.console });
    } catch (e) {
      if (e.status === 5031)
        this.console.log('This timesheet does not exist. ' +
          'Did you mean to use the --create flag?');
      else
        this.console.log(e.message || e);
    }
  }

  buildCommands(yargs, ctx) {
    const COMPLETES_TASK = '. Using this option will mark the task complete.';
    // noinspection JSCheckFunctionSignatures
    return yargs
      .command(fileCmd(ctx))
      .command(
        'log',
        'fetch the timesheet system log',
        yargs => yargs
          .boolean('truncate'),
        argv => ctx.exec(
          () => this.logProc(argv))
      )
      .command(
        ['add <task> [duration]', 'a', '+'],
        'Add a new timesheet entry',
        yargs => yargs
          .positional('task', {
            describe: 'The task being worked on',
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
        ['modify <entry> <field> <value>', 'mod', 'm'],
        'Change the value of an existing entry',
        yargs => yargs
          .positional('entry', {
            describe: 'Entry to modify, using a number or a date/time',
            type: 'string',
            default: 'now',
            coerce: arg => Number(arg) > 0 ? Number(arg) : parseDate(arg)
          })
          .positional('field', {
            describe: 'The entry information field to change',
            choices: ['start', 'end', 'duration']
          })
          .positional('value', {
            describe: 'The new value',
            type: 'string'
          }),
        argv => ctx.exec(
          () => this.modifyTaskProc(argv))
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
            choices: ['default', 'JSON-LD'],
            default: 'default'
          }),
        argv => ctx.exec(
          () => this.listTasksProc(argv))
      );
  }

  /**
   * @param {string} selector
   * @param {string} format
   * @returns {Proc}
   */
  listTasksProc({ selector, format }) {
    // TODO: selectors and formats
    return new ResultsProc(this.meld.read({
      '@describe': '?task',
      '@where': { '@id': '?task', '@type': 'http://timeld.org/#TimesheetEntry' }
    }), {
      opening: '[', closing: ']', separator: ',\n',
      stringify: JSON.stringify // TODO: beautify
    });
  }

  /**
   * @param {string} entry Entry to modify, using a number or a date/time
   * @param {string} field The entry information field to change
   * @param {string} value The new value
   * @returns {Proc}
   */
  modifyTaskProc({ entry, field, value }) {
    // TODO: If entry is not specific enough, prompt with options
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
    this.console.info('Task:', task);
    this.console.info('start:', start.toLocaleString(), `(${timeAgo(start)})`);
    if (end == null && duration != null)
      end = new Date(start.getTime() + duration);
    if (end != null)
      this.console.info('end:', end.toLocaleString(), `(${timeAgo(end)})`);
    this.console.info('#:', this.nextId);
    this.console.info('Use a "modify" command if this is wrong.');
    const entry = {
      '@id': `${this.sessionId}/${this.nextId++}`,
      '@type': 'http://timeld.org/#TimesheetEntry',
      'http://timeld.org/#start': {
        '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
        '@value': start.toISOString()
      },
      'http://timeld.org/#end': end != null ? {
        '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
        '@value': end.toISOString()
      } : undefined
    };
    return new PromiseProc(this.meld.write(entry));
  }

  /**
   * @param {boolean} truncate
   * @returns {Proc}
   */
  logProc({ truncate }) {
    if (truncate) {
      return new PromiseProc(truncateFile(this.logFile));
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
   * @param {keyof import('env-paths').Paths} key
   */
  async getUserPath(key) {
    const orgDir = join(envPaths[key], this.organisation);
    await mkdir(orgDir, { recursive: true });
    return join(orgDir, this.timesheet);
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