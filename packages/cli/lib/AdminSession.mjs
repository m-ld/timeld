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
    // noinspection JSCheckFunctionSignatures
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
   * @param {'email'} detail
   * @param {string} value
   * @returns {Proc}
   */
  addDetailProc({ detail, value }) {
    const pattern = /**@type {import('@m-ld/m-ld').Write}*/{
      '@id': this.account, [detail]: value
    };
    return new PromiseProc(this.gateway.write(pattern));
  }

  /**
   * @param {'email'} detail
   * @param {string} value
   * @returns {Proc}
   */
  listDetailProc({ detail }) {
    const pattern = /**@type {import('@m-ld/m-ld').Read}*/{
      '@select': '?value', '@where': { '@id': this.account, [detail]: '?value' }
    };
    return new ResultsProc(this.gateway.read(pattern), new TableFormat('?value'));
  }
}