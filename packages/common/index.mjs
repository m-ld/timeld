import Env from './lib/Env.mjs';
import CloneFactory from './lib/CloneFactory.mjs';
import AccountOwnedId from './lib/AccountOwnedId.mjs';
import AuthKey from './lib/AuthKey.mjs';
import ResultsReadable from './lib/ResultsReadable.mjs';
import BaseGateway from './lib/BaseGateway.mjs';

/**
 * Useful m-ld types
 * @typedef {import('@m-ld/m-ld').MeldClone} MeldClone
 * @typedef {import('@m-ld/m-ld').ConstructRemotes} ConstructRemotes
 * @typedef {import('@m-ld/m-ld').MeldConfig} MeldConfig
 * @typedef {import('@m-ld/m-ld').AppPrincipal} AppPrincipal
 * @typedef {import('@m-ld/m-ld').GraphSubject} GraphSubject
 * @typedef {import('@m-ld/m-ld').Subject} Subject
 * @typedef {import('@m-ld/m-ld').Reference} Reference
 * @typedef {import('@m-ld/m-ld').Update} Update
 * @typedef {import('@m-ld/m-ld').MeldState} MeldState
 * @typedef {import('@m-ld/m-ld').MeldReadState} MeldReadState
 * @typedef {import('@m-ld/m-ld').MeldUpdate} MeldUpdate
 * @typedef {import('@m-ld/m-ld').Query} Query
 * @typedef {import('@m-ld/m-ld').Read} Read
 */

/**
 * The basic config used by both CLI and gateway
 * @typedef {object} _TimeldConfig
 * @property {string} auth.key Authorisation key
 * @typedef {_TimeldConfig & MeldConfig} TimeldConfig
 */

export {
  CloneFactory,
  Env,
  AccountOwnedId,
  AuthKey,
  ResultsReadable,
  BaseGateway
};

export {
  timeldContext,
  isDomainEntity,
  Entry,
  Project,
  Timesheet,
  Session
} from './data/index.mjs';

export {
  idSet,
  mustBe,
  dateJsonLd,
  safeRefsIn,
  isReference,
  resolveGateway,
  domainRelativeIri,
  lastPathComponent,
  durationFromInterval
} from './lib/util.mjs';