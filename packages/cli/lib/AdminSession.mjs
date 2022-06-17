import { Repl } from '@m-ld/m-ld-cli/lib/Repl.js';
import { ResultsProc } from './ResultsProc.mjs';
import { PromiseProc } from './PromiseProc.mjs';
import { TableFormat } from './DisplayFormat.mjs';
import isEmail from 'validator/lib/isEmail.js';
import { AccountSubId } from 'timeld-common';
import { EMPTY } from 'rxjs';

export default class AdminSession extends Repl {
  /**
   * @param {GatewayClient} gateway
   * @param {string} account
   * @param {string|number} logLevel
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
    return ['ts', 'timesheet', 'project'].concat(this.isUserAccount ?
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
      .command(
        ['list <detail>', 'ls'],
        'List details of this account',
        yargs => yargs
          .positional('detail', {
            describe: 'Details to list',
            choices: this.detailParamChoices
          }),
        argv => ctx.exec(() =>
          this.getDetailHandler(argv.detail).list())
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
            describe: this.describeValueParam
          }),
        argv => ctx.exec(() =>
          this.getDetailHandler(argv.detail).add(argv.value))
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
            describe: this.describeValueParam
          }),
        argv => ctx.exec(() =>
          this.getDetailHandler(argv.detail).remove(argv.value))
      );
  }

  /**
   *
   * @param {string} detail
   * @returns {AccountDetail}
   */
  getDetailHandler(detail) {
    switch (detail) {
      case 'email':
        return this.emailDetail;
      case 'org':
      case 'organisation':
        return this.orgDetail;
      case 'admin':
      case 'administrator':
        return this.adminDetail;
      case 'ts':
      case 'timesheet':
        return this.ownedDetail('timesheet');
      case 'project':
        return this.ownedDetail('project');
      default:
        throw `${detail} not available`;
    }
  }

  writeProc(pattern) {
    return new PromiseProc(this.gateway.write(pattern));
  }

  listProc(pattern, format) {
    return new ResultsProc(this.gateway.read(pattern), format);
  }

  userIsAdmin(accountId = this.session.account) {
    const isAdmin = {
      '@id': accountId,
      '@type': 'Account'
    };
    if (accountId !== this.gateway.user)
      isAdmin['vf:primaryAccountable'] = { '@id': this.gateway.user };
    return isAdmin;
  }

  get emailDetail() {
    return new class extends AccountDetail {
      list() {
        return this.session.listProc({
          '@select': '?email', '@where': {
            ...this.session.userIsAdmin(), email: '?email'
          }
        }, new TableFormat('?email'));
      }

      add(email) {
        if (!isEmail(email))
          throw `${email} is not a valid email address`;
        return this.session.writeProc({
          '@insert': { '@id': this.session.account, email },
          '@where': this.session.userIsAdmin()
        });
      }

      remove(email) {
        return this.session.writeProc({
          '@delete': { '@id': this.session.account, email },
          '@where': this.session.userIsAdmin()
        });
      }
    }(this);
  }

  get orgDetail() {
    return new class extends AccountDetail {
      list() {
        return this.session.listProc({
          '@select': '?org', '@where': this.session.userIsAdmin('?org')
        }, new TableFormat('?org'));
      }

      add(org) {
        if (!AccountSubId.isComponentId(org))
          throw `${org} is not a valid organisation ID`;
        // I am the admin of any org I create
        return this.session.writeProc(this.session.userIsAdmin(org));
      }

      remove(org) {
        return this.session.writeProc({
          '@delete': { '@id': org },
          '@where': this.session.userIsAdmin(org)
        });
      }
    }(this);
  }

  get adminDetail() {
    return new class extends AccountDetail {
      list() {
        const where = this.session.userIsAdmin();
        where['vf:primaryAccountable'] = [where['vf:primaryAccountable'], '?admin'];
        return this.session.listProc({
          '@select': '?admin', '@where': where
        }, new TableFormat('?admin'));
      }

      add(admin) {
        if (!AccountSubId.isComponentId(admin))
          throw `${admin} is not a valid user name`;
        return this.session.writeProc({
          '@insert': { '@id': this.session.account, 'vf:primaryAccountable': admin },
          '@where': this.session.userIsAdmin()
        });
      }

      remove(admin) {
        return this.session.writeProc({
          '@delete': { '@id': this.session.account, 'vf:primaryAccountable': admin },
          '@where': this.session.userIsAdmin()
        });
      }
    }(this);
  }

  /**
   * @param {'timesheet'|'project'} type
   * @returns {AccountDetail}
   */
  ownedDetail(type) {
    return new class extends AccountDetail {
      list() {
        return this.session.listProc({
          '@select': '?owned', '@where': {
            ...this.session.userIsAdmin(), [type]: '?owned'
          }
        }, new TableFormat('?owned'));
      }

      resolveId(owned) {
        // Projects share a namespace with timesheets
        let { name, account, gateway } = AccountSubId.fromString(owned);
        if (gateway && gateway !== this.session.gateway.domain)
          throw `Cannot write to ${gateway}`;
        account ||= this.session.account;
        return { account, id: `${account}/${name}` };
      }

      add(owned) {
        const { account, id } = this.resolveId(owned);
        return this.session.writeProc({
          '@insert': { '@id': account, [type]: { '@id': id } },
          '@where': this.session.userIsAdmin(account)
        });
      }

      remove(owned) {
        const { account, id } = this.resolveId(owned);
        return this.session.writeProc({
          '@delete': { '@id': account, [type]: { '@id': id } },
          '@where': this.session.userIsAdmin(account)
        });
      }
    }(this);
  }
}

class AccountDetail {
  /**@type {AdminSession}*/session;

  /**
   * @param {AdminSession} session
   */
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
   * @abstract
   * @param {string} value to add
   * @returns {PromiseProc}
   */
  add(value) {
    return new PromiseProc(Promise.reject('Cannot add detail'));
  }

  /**
   * @abstract
   * @param {string} value to remove
   * @returns {PromiseProc}
   */
  remove(value) {
    return new PromiseProc(Promise.reject('Cannot remove detail'));
  }
}