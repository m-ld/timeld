import Entry from './Entry.mjs';
import Project from './Project.mjs';
import Timesheet from './Timesheet.mjs';
import Session from './Session.mjs';
import UserKey from './UserKey.mjs';
import Principal from './Principal.mjs';

export { Entry, Project, Timesheet, Session, UserKey, Principal };

export const timeldContext = {
  '@vocab': 'http://timeld.org/#',
  'foaf': 'http://xmlns.com/foaf/0.1/',
  'vf': 'https://w3id.org/valueflows#'
};

/**
 * Obtains absolute IRIs in the Timeld vocabulary
 * @returns {string}
 */
export const timeldVocab = iri => {
  if (iri.startsWith('vf:'))
    return `${timeldContext['vf']}${iri.slice(3)}`;
  if (iri.startsWith('foaf:'))
    return `${timeldContext['foaf']}${iri.slice(5)}`;
  else
    return `${timeldContext['@vocab']}${iri}`;
};

timeldVocab.entryType = timeldVocab('Entry');
timeldVocab.keyProp = timeldVocab('key');
timeldVocab.publicProp = timeldVocab('public');
timeldVocab.providerProp = timeldVocab('vf:provider');

/** @typedef {import('jtd').SchemaFormProperties['properties']} JtdProperties */

/** @type {import('jtd').SchemaFormDiscriminator} */
export const isDomainEntity = {
  discriminator: '@type',
  mapping: {
    'Entry': Entry.SCHEMA,
    'Project': Project.SCHEMA,
    'Timesheet': Timesheet.SCHEMA
  }
};