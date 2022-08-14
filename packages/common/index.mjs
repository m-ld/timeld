import Env from './lib/Env.mjs';
import clone from './lib/clone.mjs';
import AccountOwnedId from './lib/AccountOwnedId.mjs';
import AblyKey from './lib/AblyKey.mjs';
import ResultsReadable from './lib/ResultsReadable.mjs';
import BaseGateway from './lib/BaseGateway.mjs';

/**
 * @typedef {import('@m-ld/m-ld/ext/ably').MeldAblyConfig & UserKeyConfig} TimeldConfig
 */

/**
 * Useful m-ld types
 * @typedef {import('@m-ld/m-ld').MeldClone} MeldClone
 * @typedef {import('@m-ld/m-ld').MeldConfig} MeldConfig
 * @typedef {import('@m-ld/m-ld').AppPrincipal} AppPrincipal
 * @typedef {import('@m-ld/m-ld').GraphSubject} GraphSubject
 * @typedef {import('@m-ld/m-ld').Subject} Subject
 * @typedef {import('@m-ld/m-ld').Reference} Reference
 * @typedef {import('@m-ld/m-ld').Update} Update
 * @typedef {import('@m-ld/m-ld').MeldReadState} MeldReadState
 * @typedef {import('@m-ld/m-ld').MeldUpdate} MeldUpdate
 * @typedef {import('@m-ld/m-ld').Query} Query
 */

export {
  clone,
  Env,
  AccountOwnedId,
  AblyKey,
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
  mustBe,
  dateJsonLd,
  safeRefsIn,
  isReference,
  domainRelativeIri
} from './lib/util.mjs';
