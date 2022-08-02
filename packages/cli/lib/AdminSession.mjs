import { Repl } from '@m-ld/m-ld-cli/lib/Repl.js';
import { ResultsProc } from './ResultsProc.mjs';
import { PromiseProc } from './PromiseProc.mjs';
import { ENTRY_FORMAT_OPTIONS, getSubjectFormat, TableFormat } from './DisplayFormat.mjs';
import isEmail from 'validator/lib/isEmail.js';
import { AccountOwnedId } from 'timeld-common';
import { EMPTY } from 'rxjs';
import { any, normaliseValue } from '@m-ld/m-ld';
import { durationFromInterval, parseDate, parseDuration } from './util.mjs';
import { SyncProc } from '@m-ld/m-ld-cli/lib/Proc.js';
import { Readable } from 'stream';

/**
 * @typedef {object} DetailArgs
 * @property {string} detail
 * @property {string} value
 * @property {string} [project]
 * @property {string} [timesheet]
 */

export default class AdminSession extends Repl {
  /**
   * @param {GatewayClient} gateway
   * @param {string} account
   * @param {string|number} [logLevel]
   */
  constructor({ gateway, account, logLevel }) {
    // The only user account we are an admin of, is our own
    super({ prompt: `${account}>`, logLevel });
    this.gateway = gateway;
    this.account = account;
    this.isUserAccount = account === gateway.user;
    // TODO: Warn if the user is not an admin of the account
  }

  get detailParamChoices() {
    return ['ts', 'timesheet', 'project', 'link'].concat(this.isUserAccount ?
      ['email', 'org', 'organisation'] :
      // Technically you could admin emails and organisations from an org
      // account session by editing the logged-in user, but omit for clarity
      ['admin', 'administrator']);
  }

  get describeValueParam() {
    return this.isUserAccount ?
      'timesheet or project name, email address, or organisation name' :
      'timesheet or project name, or admin user name';
  }

  buildCommands(yargs, ctx) {
    // noinspection JSCheckFunctionSignatures
    return yargs
      .option('project', {
        type: 'string',
        describe: 'Project (use with "link" or "report")',
        conflicts: 'timesheet'
      })
      .option('timesheet', {
        alias: 'ts',
        type: 'string',
        describe: 'Timesheet (use with "link" or "report")',
        conflicts: 'project'
      })
      .check(argv => {
        if (argv.detail === 'link' && !argv.project && !argv.timesheet)
          return 'Link requires a "--project" or "--timesheet"';
        return true;
      })
      .command(
        'key',
        'Show your API access key',
      yargs => yargs,
        () => ctx.exec(() =>
          new SyncProc(Readable.from([this.gateway.ablyKey.toString()])))
      )
      .command(
        ['list <detail>', 'ls'],
        'List details of this account',
        yargs => yargs
          .positional('detail', {
            describe: 'Details to list',
            choices: this.detailParamChoices
          }),
        argv => ctx.exec(() =>
          this.getDetailHandler(argv).list())
      )
      .command(
        ['add <detail> <value>', 'a', '+'],
        'Add details to this account',
        yargs => yargs
          .positional('detail', {
            describe: 'Details to add',
            choices: this.detailParamChoices
          })
          .positional('value', {
            type: 'string',
            describe: this.describeValueParam
          })
          .option('start', {
            describe: 'The project start date/time',
            type: 'array',
            coerce: parseDate
          })
          .option('end', {
            describe: 'The project end date & time',
            type: 'array',
            coerce: parseDate
          })
          .option('duration', {
            describe: 'The project duration, e.g. 1w',
            type: 'string',
            coerce: parseDuration
          })
          .option('milestone', {
            describe: 'Project milestones',
            type: 'array'
          }),
        argv => ctx.exec(() =>
          this.getDetailHandler(argv).add())
      )
      .command(
        ['remove <detail> <value>', 'rm'],
        'Remove details from this account',
        yargs => yargs
          .positional('detail', {
            describe: 'Details to remove',
            choices: this.detailParamChoices
          })
          .positional('value', {
            type: 'string',
            describe: this.describeValueParam
          })
          .option('project', {
            type: 'string',
            describe: 'Project to unlink from timesheet (use with "link")'
          }),
        argv => ctx.exec(() =>
          this.getDetailHandler(argv).remove())
      )
      .command(
        'report <id>',
        'Report on the time entries in a timesheet or project',
        yargs => yargs
          .option('format', ENTRY_FORMAT_OPTIONS),
        argv => ctx.exec(
          () => this.reportEntriesProc(argv))
      );
  }

  /**
   * @param {DetailArgs} argv
   * @returns {AccountDetail}
   */
  getDetailHandler(argv) {
    switch (argv.detail) {
      case 'email':
        return this.emailDetail(argv);
      case 'org':
      case 'organisation':
        return this.orgDetail(argv);
      case 'admin':
      case 'administrator':
        return this.adminDetail(argv);
      case 'ts':
      case 'timesheet':
        return this.ownedDetail(argv, 'Timesheet');
      case 'project':
        return this.ownedDetail(argv, 'Project');
      case 'link':
        return this.linkDetail(argv);
      default:
        throw `${argv.detail} not available`;
    }
  }

  writeProc(pattern) {
    return new PromiseProc(this.gateway.write(pattern));
  }

  listProc(pattern, format) {
    return new ResultsProc(this.gateway.read(pattern), format);
  }

  /**
   * @param {EntryFormatName} format
   * @param {string} id timesheet or project to report on
   * @returns {Proc}
   */
  reportEntriesProc({ id, format }) {
    const ownedId = this.resolveId(id);
    return new ResultsProc(
      this.gateway.report(ownedId.account, ownedId.name),
      getSubjectFormat(format));
  }

  resolveId(owned) {
    if (owned) {
      // Projects share a namespace with timesheets
      let id = AccountOwnedId.fromString(owned);
      if (id.gateway && id.gateway !== this.gateway.domainName)
        throw `Cannot write to ${id.gateway}`;
      id.account ||= this.account;
      return id;
    }
  }

  userIsAdmin(accountId = this.account) {
    const isAdmin = {
      '@id': accountId,
      '@type': 'Account'
    };
    if (accountId !== this.gateway.user)
      isAdmin['vf:primaryAccountable'] = { '@id': this.gateway.user };
    return isAdmin;
  }

  /**
   * @param {string} email
   * @returns {AccountDetail}
   */
  emailDetail({ value: email }) {
    return new class extends AccountDetail {
      list() {
        return this.session.listProc({
          '@select': '?email', '@where': {
            ...this.session.userIsAdmin(), email: '?email'
          }
        }, new TableFormat('?email'));
      }

      add() {
        if (!isEmail(email)) // Check validity for inserts
          throw `${email} is not a valid email address`;
        return this.update('@insert');
      }

      update(verb) {
        return this.session.writeProc({
          [verb]: { '@id': this.session.account, email },
          '@where': this.session.userIsAdmin()
        });
      }
    }(this);
  }

  /**
   * @param {string} org
   * @returns {AccountDetail}
   */
  orgDetail({ value: org }) {
    return new class extends AccountDetail {
      list() {
        return this.session.listProc({
          '@select': '?org', '@where': this.session.userIsAdmin('?org')
        }, new TableFormat('?org'));
      }

      add() {
        if (!AccountOwnedId.isComponentId(org))
          throw `${org} is not a valid organisation ID`;
        // I am the admin of any org I create
        return this.session.writeProc(this.session.userIsAdmin(org));
      }

      remove() {
        return this.session.writeProc({
          '@delete': { '@id': org },
          '@where': this.session.userIsAdmin(org)
        });
      }
    }(this);
  }

  /**
   * @param {string} admin
   * @returns {AccountDetail}
   */
  adminDetail({ value: admin }) {
    return new class extends AccountDetail {
      list() {
        const where = this.session.userIsAdmin();
        where['vf:primaryAccountable'] = [where['vf:primaryAccountable'], '?admin'];
        return this.session.listProc({
          '@select': '?admin', '@where': where
        }, new TableFormat('?admin'));
      }

      update(verb) {
        if (!AccountOwnedId.isComponentId(admin))
          throw `${admin} is not a valid user name`;
        return this.session.writeProc({
          [verb]: {
            '@id': this.session.account,
            'vf:primaryAccountable': { '@id': admin }
          },
          '@where': this.session.userIsAdmin()
        });
      }
    }(this);
  }

  /**
   * @param {string} owned
   * @param {Date} [start]
   * @param {Date} [end]
   * @param {number} [duration]
   * @param {string[]} [milestone]
   * @param {'Timesheet'|'Project'} type
   * @returns {AccountDetail}
   */
  ownedDetail({
    value: owned,
    start, end, duration,
    milestone
  }, type) {
    return new class extends AccountDetail {
      list() {
        return this.session.listProc({
          '@select': '?owned', '@where': {
            ...this.session.userIsAdmin(), [type.toLowerCase()]: '?owned'
          }
        }, new TableFormat('?owned'));
      }

      add() {
        return this.updateOwned('@insert', subject => {
          if (type === 'Project') {
            // Fill out project properties
            if (start != null) {
              subject.start = normaliseValue(start);
              if (end != null && duration == null)
                duration = durationFromInterval(start, end);
              if (duration != null)
                subject.duration = duration;
            } else if (duration != null) {
              throw 'Please specify a start date';
            }
            subject.milestone = milestone?.map(m => `${m}`);
          }
        });
      }

      remove() {
        return this.updateOwned('@delete', (subject, where) => {
          // Delete must delete the owned subject in full
          const allProps = { [any()]: any() };
          Object.assign(subject, allProps);
          where[type.toLowerCase()] = { '@id': subject['@id'], ...allProps };
        });
      }

      /**
       * @param {'@insert'|'@delete'} verb update key
       * @param {(subject: object, where: object) => void} complete
       * @returns {PromiseProc}
       */
      updateOwned(verb, complete) {
        const ownedId = this.session.resolveId(owned);
        const subject = { '@id': ownedId.toIri(), '@type': type };
        const where = this.session.userIsAdmin(ownedId.account);
        complete(subject, where);
        return this.session.writeProc({
          [verb]: { '@id': ownedId.account, [type.toLowerCase()]: subject },
          '@where': where
        });
      }
    }(this);
  }

  /**
   * @param {object} argv
   * @param {string} [argv.project] command option, exclusive with timesheet
   * @param {string} [argv.timesheet] command option, exclusive with project
   * @param {string} [argv.value] the other id, one of project or timesheet
   * @returns {AccountDetail}
   */
  linkDetail(argv) {
    return new class extends AccountDetail {
      project = this.session.resolveId(argv.project || argv.value);
      timesheet = this.session.resolveId(argv.timesheet || argv.value);

      list() {
        if (this.project) {
          return this.session.listProc({
            '@select': '?timesheet',
            '@where': [{
              // I can see timesheets for projects that I admin
              ...this.session.userIsAdmin(this.project.account),
              project: this.project.toReference()
            }, {
              '@id': '?timesheet',
              '@type': 'Timesheet',
              project: this.project.toReference()
            }]
          }, new TableFormat('?timesheet'));
        } else if (this.timesheet) {
          return this.session.listProc({
            '@select': '?project',
            '@where': [{
              // I can see projects for timesheets that I admin
              ...this.session.userIsAdmin(this.timesheet.account),
              timesheet: this.timesheet.toReference()
            }, {
              ...this.timesheet.toReference(),
              '@type': 'Timesheet',
              project: { '@id': '?project' }
            }]
          }, new TableFormat('?project'));
        }
        throw new RangeError('Must provide timesheet or project');
      }

      update(verb) {
        // The given id is a timesheet or a project
        if (!this.project || !this.timesheet)
          throw new RangeError('Timesheet or project missing');
        return this.session.writeProc({
          [verb]: {
            ...this.timesheet.toReference(),
            project: this.project.toReference()
          },
          '@where': {
            // The account must own the timesheet (not necessarily the project)
            ...this.session.userIsAdmin(this.timesheet.account),
            timesheet: this.timesheet.toReference()
          }
        });
      }
    }(this);
  }
}

class AccountDetail {
  /**@type {AdminSession}*/session;

  /** @param {AdminSession} session */
  constructor(session) {
    this.session = session;
  }

  /**
   * @abstract
   * @returns {ResultsProc}
   */
  list() {
    return EMPTY;
  }

  /**
   * Called by {@link add} and {@link remove} for convenience, if the only
   * difference between the two is `verb`.
   * @param {'@insert'|'@delete'} verb update key
   */
  update(verb) {
    return new PromiseProc(Promise.reject(
      `Cannot ${verb === '@insert' ? 'add' : 'remove'} detail`));
  }

  /**
   * @returns {PromiseProc}
   */
  add() {
    return this.update('@insert');
  }

  /**
   * @returns {PromiseProc}
   */
  remove() {
    return this.update('@delete');
  }
}