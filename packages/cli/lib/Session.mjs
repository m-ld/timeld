import { Repl } from '@m-ld/m-ld-cli/lib/Repl.js';
import { Proc, SyncProc } from '@m-ld/m-ld-cli/lib/Proc.js';
import fileCmd from '@m-ld/m-ld-cli/cmd/repl/file.js';
import { createReadStream } from 'fs';
import { truncate as truncateFile } from 'fs/promises';
import { ResultsProc } from './ResultsProc.mjs';
import { dateJsonLd, parseDate, parseDuration } from './util.mjs';
import { Entry } from './Entry.mjs';
import { DefaultFormat, jsonLdFormat } from './Format.mjs';

export class Session extends Repl {
  /**
   * @param {string} spec.id
   * @param {string} spec.timesheet
   * @param {string} spec.providerId
   * @param {import('@m-ld/m-ld').MeldClone} spec.meld
   * @param {string} spec.logFile
   * @param {string|number} spec.logLevel
   */
  constructor(spec) {
    super({ logLevel: spec.logLevel, prompt: `${(spec.timesheet)}>` });
    this.id = spec.id;
    this.timesheet = spec.timesheet;
    this.providerId = spec.providerId;
    this.meld = spec.meld;
    this.logFile = spec.logFile;
    this.startTime = new Date;
    this.nextEntryId = 1;
  }

  buildCommands(yargs, ctx) {
    const COMPLETES_ENTRY = '. Using this option will mark the entry complete.';
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
          .conflicts('truncate', 'status'),
        argv => ctx.exec(
          () => this.logProc(argv))
      )
      .command(
        ['add <activity> [duration]', 'a', '+'],
        'Add a new timesheet entry',
        yargs => yargs
          .positional('activity', {
            describe: 'The name of the activity being worked on',
            type: 'string'
          })
          .positional('duration', {
            describe: 'The duration of the activity e.g. 1h' + COMPLETES_ENTRY,
            type: 'string',
            coerce: parseDuration
          })
          .option('start', {
            describe: 'The start date/time of the activity',
            type: 'array',
            default: ['now'],
            coerce: parseDate
          })
          .option('end', {
            describe: 'The end date & time of the activity' + COMPLETES_ENTRY,
            type: 'array',
            coerce: parseDate
          }),
        argv => ctx.exec(
          () => this.addEntryProc(argv))
      )
      .command(
        ['modify <selector> [duration]', 'mod', 'm'],
        'Change the value of an existing entry',
        yargs => yargs
          .positional('selector', {
            // TODO: entry by [activity and] date-time e.g. "work yesterday 12pm"
            describe: 'Entry to modify, using a number or a activity name'
          })
          .positional('duration', {
            describe: 'The new duration of the activity e.g. 1h',
            type: 'string',
            coerce: parseDuration
          })
          .option('start', {
            describe: 'The new start date & time of the activity',
            type: 'array',
            coerce: parseDate
          })
          .option('end', {
            describe: 'The new end date & time of the activity',
            type: 'array',
            coerce: parseDate
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
          () => this.listEntriesProc(argv))
      );
  }

  /**
   * @param {string} selector
   * @param {'default'|'JSON-LD'} format
   * @returns {Proc}
   */
  listEntriesProc({ selector, format }) {
    // TODO: selectors
    return new ResultsProc(this.meld.read({
      '@describe': '?activity',
      '@where': { '@id': '?activity', '@type': 'Entry' }
    }), {
      'JSON-LD': jsonLdFormat,
      'json-ld': jsonLdFormat,
      ld: jsonLdFormat
    }[format] || new DefaultFormat(this));
  }

  /**
   * @param {string | number} selector Entry to modify, using a number or a activity name
   * @param {number} [duration] in minutes
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
        if (end != null && duration == null)
          entry.duration = Entry.durationFromInterval(entry.start, end);
        if (duration != null)
          entry.duration = duration;
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
          throw 'No such activity sequence number found in this session.';
      } else {
        for (let src of await state.read({
          '@describe': '?id',
          '@where': {
            '@id': '?id',
            '@type': 'Entry',
            activity: selector
          }
        })) {
          state = await updateEntry(src);
        }
      }
    }));
    return proc;
  }

  /**
   * @param {string} activity
   * @param {number} [duration] in minutes
   * @param {Date} start
   * @param {Date} [end]
   * @returns {Proc}
   */
  addEntryProc({ activity, duration, start, end }) {
    // TODO: Replace use of console with proc 'message' events
    if (end != null && duration == null)
      duration = Entry.durationFromInterval(end, start);
    const entry = new Entry({
      seqNo: `${this.nextEntryId++}`,
      sessionId: this.id,
      activity,
      providerId: this.providerId,
      start,
      duration
    });
    const proc = new PromiseProc(this.meld.write({
      '@graph': [entry.toJSON(), this.toJSON()]
    }).then(() => {
      proc.emit('message', entry.toString());
      proc.emit('message', 'Use a "modify" command if this is wrong.');
    }));
    return proc;
  }

  /**
   * @param {boolean} [truncate]
   * @param {boolean} [status]
   * @returns {Proc}
   */
  logProc({ truncate, status }) {
    if (truncate) {
      return new PromiseProc(truncateFile(this.logFile));
    } else if (status) {
      const proc = new PromiseProc(Promise.resolve().then(() => {
        proc.emit('message', 'Status:', this.meld.status.value);
      }));
      return proc;
    } else {
      return new SyncProc(createReadStream(this.logFile));
    }
  }

  toJSON() {
    return {
      '@id': this.id,
      '@type': 'Session',
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
