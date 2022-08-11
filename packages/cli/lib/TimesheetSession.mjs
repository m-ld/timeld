import { Repl } from '@m-ld/m-ld-cli/lib/Repl.js';
import { JsonSinkProc, SyncProc } from '@m-ld/m-ld-cli/lib/Proc.js';
import fileCmd from '@m-ld/m-ld-cli/cmd/repl/file.js';
import { createReadStream } from 'fs';
import { truncate as truncateFile } from 'fs/promises';
import { ResultsProc } from './ResultsProc.mjs';
import {
  durationFromInterval, parseDate, parseDuration, toDate, toDuration, toIri
} from './util.mjs';
import { Entry, Session } from 'timeld-common';
import { DefaultFormat, ENTRY_FORMAT_OPTIONS, getSubjectFormat } from './DisplayFormat.mjs';
import { PromiseProc } from './PromiseProc.mjs';
import { Writable } from 'stream';

export default class TimesheetSession extends Repl {
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
    this.session = new Session(spec.id);
    this.name = spec.timesheet;
    this.providerId = spec.providerId;
    this.meld = spec.meld;
    this.logFile = spec.logFile;
  }

  buildCommands(yargs, ctx) {
    const COMPLETES_ENTRY = '. Using this option will mark the entry complete.';
    // noinspection JSCheckFunctionSignatures
    return yargs
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
          .option('activity', {
            describe: 'The new name of the activity being worked on',
            type: 'string',
            alias: 'task'
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
            if (argv.start == null && argv.end == null && argv.duration == null && argv.activity == null)
              return 'Please specify something to modify: duration, --activity, --start, or --end';
            return true;
          }),
        argv => ctx.exec(
          () => this.modifyEntryProc(argv))
      )
      .command(
        ['report [selector]', 'list', 'ls'],
        'Report on a selection of time entries',
        yargs => yargs
          .positional('selector', {
            describe: 'A time range, like "today" or "this month"',
            type: 'string',
            default: 'today'
          })
          .option('format', ENTRY_FORMAT_OPTIONS),
        argv => ctx.exec(
          () => this.reportEntriesProc(argv))
      )
      .command(
        'import [path]',
        'Import time entries.\n' +
        'Used with piped input, see examples',
        yargs => yargs
          .example([
            ['entries.json > $0', 'Import from a JSON-LD file containing an array'],
            ['entry.json > $0 $', 'Import from a file containing just one entry'],
            ['$0 --data \'{"activity": "trying it out", "start": "now"}\'', 'Import data'],
            ['fetch my-time-tracker > $0', 'Import from another system (coming soon!)']
          ])
          .positional('path', {
            default: '*',
            describe: 'JSONPath to pick out data from the input.\n' +
              'For example, to transact just one entry, use "$"'
          })
          .option('data', {
            describe: 'literal data to import',
            type: 'string'
          })
          .option('dry-run', {
            describe: 'Just read the first few entries and echo them',
            type: 'boolean'
          }),
        argv => ctx.exec(
          () => this.importEntriesProc(ctx.stdin, argv))
      );
  }

  /**
   * @param {string} selector
   * @param {EntryFormatName} format
   * @returns {Proc}
   */
  reportEntriesProc({ selector, format }) {
    // TODO: selectors
    return new ResultsProc(
      this.meld.read({
        '@describe': '?entry',
        '@where': { '@id': '?entry', '@type': 'Entry' }
      }).consume,
      getSubjectFormat(format, this.getSession));
  }

  /**
   * @type {GetSession}
   */
  getSession = entry =>
    entry.sessionId === this.session.id ? 'This session' : this.meld.get(entry.sessionId);

  /**
   * @param {string | number} selector Entry to modify, using a number or a activity name
   * @param {number} [duration] in minutes
   * @param {string} [activity]
   * @param {Date} [start]
   * @param {Date} [end]
   * @returns {Proc}
   */
  modifyEntryProc({ selector, duration, activity, start, end }) {
    // TODO: selector is not specific enough?
    const proc = new PromiseProc(this.meld.write(async state => {
      async function updateEntry(src) {
        const entry = Entry.fromJSON(src);
        if (activity)
          entry.activity = activity;
        if (start != null)
          entry.start = start;
        if (end != null && duration == null)
          entry.duration = durationFromInterval(entry.start, end);
        if (duration != null)
          entry.duration = duration;
        proc.emit('message', DefaultFormat.entryLabel(entry));
        return state.write({
          '@delete': src,
          '@insert': entry.toJSON()
        });
      }
      if (typeof selector == 'number') {
        const src = await state.get(`${this.session.id}/${selector}`);
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
   * Tries to construct a valid entry from the given object. Accepts valid entry
   * JSON-LD and also looser constructs; see implementation for details.
   *
   * @param {*} activity
   * @param {*} provider
   * @param {*} start
   * @param {*} [duration]
   * @param {*} [end]
   * @param {*} [external]
   * @returns {Entry}
   */
  toEntry({ activity, provider, start, duration, end, external }) {
    if (typeof activity != 'string')
      throw new RangeError('Activity must be a string');
    start = toDate(start);
    if (duration != null)
      duration = toDuration(duration);
    else if (end != null)
      duration = durationFromInterval(start, toDate(end));
    return new Entry({
      seqNo: `${this.session.claimEntryId()}`,
      sessionId: this.session.id,
      providerId: toIri(provider) ?? this.providerId,
      activity, start, duration,
      externalId: toIri(external)
    });
  }

  /**
   * @param {Entry} entry
   * @returns {Promise<Entry>}
   */
  async addEntry(entry) {
    await this.meld.write({
      '@graph': [entry.toJSON(), this.session.toJSON()]
    });
    return entry;
  }

  /**
   * @param {object} argv
   * @returns {Proc}
   */
  addEntryProc(argv) {
    const proc = new PromiseProc(this.addEntry(this.toEntry(argv)).then(entry => {
      proc.emit('message', DefaultFormat.entryLabel(entry));
      proc.emit('message', 'Use a "modify" command if this is wrong.');
    }));
    return proc;
  }

  /**
   * @param {import('stream').Readable} stdin
   * @param {string} path JSONPath path into the input stream or data
   * @param {string} [data] literal data (overrides stdin)
   * @param {boolean} [dryRun] just echo some entries
   * @returns {Proc}
   */
  importEntriesProc(stdin, { path, data, dryRun }) {
    const echo = new DefaultFormat(this.getSession);
    const proc = new JsonSinkProc(new Writable({
      objectMode: true,
      write: async (object, encoding, callback) => {
        try {
          const entry = this.toEntry(object);
          if (dryRun)
            proc.emit('message', echo.entryDescription(entry));
          else
            await this.addEntry(entry);
          callback();
        } catch (e) {
          callback(e);
        }
      }
    }), path, stdin, data);
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

  async close() {
    await this.meld?.close();
    await super.close();
  }
}