// noinspection NpmUsedModulesInstalled
import { jest } from '@jest/globals';
import { clone, uuid } from '@m-ld/m-ld';
import { MemoryLevel } from 'memory-level';
import { DeadRemotes } from './fixtures.mjs';
import { BaseGateway } from '../index.mjs';
import { consume } from 'rx-flowable/consume';
import { flatMap } from 'rx-flowable/operators';

/**
 * @typedef {object} MockAccount
 * @property {string} name
 * @property {(query: Query) => Promise<Results>} read
 * @property {(query: Query) => Promise<void>} write
 * @property {() => *} toJSON
 */

// noinspection JSUnusedGlobalSymbols
/**
 * Pretends to be both a gateway client to CLI components, and a gateway to
 * server components
 */
export default class MockGateway extends BaseGateway {
  /**
   * @param {object} config
   * @param {string} config.domainName
   */
  constructor(config) {
    super(config.domainName);
    this.config = config;
  }

  /**
   * @param {MockAccount} account
   * @returns {Promise<MockGateway>}
   */
  async initialise(account) {
    this.account = account;
    // noinspection JSCheckFunctionSignatures
    this.domain = await clone(new MemoryLevel(), DeadRemotes, {
      '@id': uuid(), '@domain': this.domainName, genesis: true, logLevel: 'debug'
    });
    await this.domain.write(this.account.toJSON());
    return this;
  }

  get user() {
    return this.account.name;
  }

  /**
   * @param {Read} pattern
   * @returns {Results} results
   */
  read(pattern) {
    return consume(this.account.read(json(pattern)))
      .pipe(flatMap(res => res));
  }

  /**
   * @param {Query} pattern
   */
  async write(pattern) {
    return this.account.write(json(pattern));
  }

  initTimesheet = jest.fn();
  isGenesisTs = jest.fn();
}

/** Sanitisation of JSON */
function json(pattern) {
  return JSON.parse(JSON.stringify(pattern));
}
