import Entry from './Entry.mjs';
import Project from './Project.mjs';
import Timesheet from './Timesheet.mjs';

export { Entry, Project, Timesheet };

export const timeldContext = {
  '@vocab': 'http://timeld.org/#',
  'foaf': 'http://xmlns.com/foaf/0.1/',
  'vf': 'https://w3id.org/valueflows#'
};

/** @typedef {import('jtd').SchemaFormProperties['properties']} JtdProperties */

/** @type {import('jtd').SchemaFormDiscriminator} */
export const isTimeldType = {
  discriminator: '@type',
  mapping: {
    'Entry': Entry.SCHEMA,
    'Project': Project.SCHEMA,
    'Timesheet': Timesheet.SCHEMA
  }
};