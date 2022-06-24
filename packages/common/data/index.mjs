import Entry from './Entry.mjs';
import Project from './Project.mjs';
import Timesheet from './Timesheet.mjs';

export { Entry, Project, Timesheet };

export const timeldContext = {
  '@vocab': 'http://timeld.org/#',
  'om2': 'http://www.ontology-of-units-of-measure.org/resource/om-2/',
  'foaf': 'http://xmlns.com/foaf/0.1/',
  'vf': 'https://w3id.org/valueflows#'
};

/** @typedef {import('jtd').SchemaFormProperties['properties']} JtdProperties */

/** @type {import('jtd').Schema} */
export const isTimeldType = {
  discriminator: '@type',
  mapping: {
    Entry: Entry.SCHEMA,
    Project: Project.SCHEMA,
    Timesheet: Timesheet.SCHEMA
  }
};