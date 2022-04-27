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

const timeldContext = JSON.parse(
  await readFile(new URL('./context.json', import.meta.url), 'utf8'));

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
    this.id = uuid();
    this.startTime = new Date;
    this.config = {
      '@id': this.id,
      // TODO: specify gateway to use
      // TODO: how to prevent conflicts, if offline?
      '@domain': `${timesheet}.${organisation}.timeld.org`,
      '@context': timeldContext,
      genesis: !!opts.create,
      ...opts
    };
    this.timesheet = timesheet;
    this.organisation = organisation;
    this.console = console;
    this.nextTaskId = 1;
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
      .updateStrings({ 'Positionals:': 'Details:' })
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
        ['modify <selector> <field> <value..>', 'mod', 'm'],
        'Change the value of an existing entry',
        yargs => yargs
          .positional('selector', {
            // TODO: entry by [task and] date-time e.g. "work yesterday 12pm"
            describe: 'Entry to modify, using a number or a task name'
          })
          .positional('field', {
            describe: 'The entry information field to change',
            choices: ['start', 'end', 'duration']
          })
          .positional('value', {
            describe: 'The new value',
            coerce: arg => [].concat(arg).join(' ')
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
   * @param {'start'|'end'|'duration'} field The entry information field to change
   * @param {string} value The new value
   * @returns {Proc}
   */
  modifyEntryProc({ selector, field, value }) {
    // TODO: selector is not specific enough?
    const proc = new PromiseProc(this.meld.write(async state => {
      async function updateEntry(src) {
        const entry = Entry.fromJSON(src);
        switch (field) {
          case 'start':
            // noinspection JSCheckFunctionSignatures
            entry.start = parseDate(value);
            break;
          case 'end':
            // noinspection JSCheckFunctionSignatures
            entry.end = parseDate(value);
            break;
          case 'duration':
            entry.end = new Date(entry.start.getTime() + parseDuration(value));
        }
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
