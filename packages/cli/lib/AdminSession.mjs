import { Repl } from '@m-ld/m-ld-cli/lib/Repl.js';
import { ResultsProc } from './ResultsProc.mjs';
import { PromiseProc } from './PromiseProc.mjs';
import { TableFormat } from './DisplayFormat.mjs';

export default class AdminSession extends Repl {
  /**
   * @param {GatewayClient} gateway
   * @param {string} account
   * @param {string|number} logLevel
   */
  constructor({ gateway, account, logLevel }) {
    super({ logLevel, prompt: 'admin>' });
    this.gateway = gateway;
    this.account = account;
  }

  buildCommands(yargs, ctx) {
    return yargs
      .command(
        ['add <detail> <value>', 'a', '+'],
        'Add details to this account',
        yargs => yargs
          .positional('detail', {
            describe: 'Details to add',
            choices: ['email']
          })
          .positional('value', {
            describe: 'email address'
          }),
        argv => ctx.exec(() => this.addDetailProc(argv))
      )
      .command(
        ['list <detail>', 'ls'],
        'List details of this account',
        yargs => yargs
          .positional('detail', {
            describe: 'Details to list',
            choices: ['email']
          }),
        argv => ctx.exec(() => this.listDetailProc(argv))
      );
  }

  /**
   * @param {string} detail
   * @param {string} value
   * @returns {Proc}
   */
  addDetailProc({ detail, value }) {
    return new PromiseProc(Promise.reject(undefined));
  }

  /**
   * @param {string} detail
   * @param {string} value
   * @returns {Proc}
   */
  listDetailProc({ detail }) {
    return new ResultsProc(this.gateway.read({
      '@select': '?value', '@where': { '@id': this.account, [detail]: '?value' }
    }), new TableFormat('?value'));
  }
}