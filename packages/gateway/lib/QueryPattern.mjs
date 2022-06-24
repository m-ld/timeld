import { validate } from 'jtd';

/**
 * @typedef {import('@m-ld/m-ld').Query} Query
 * @typedef {import('jtd').Schema} Schema
 */

/**
 * @param {Schema} schema
 * @param {Query} query
 * @returns {boolean}
 */
function matches(schema, query) {
  // noinspection JSCheckFunctionSignatures
  const errors = validate(schema, query, { maxErrors: 1 });
  return errors.length === 0;
}

export const isVariable = { type: 'string' };

export class QueryPattern {
  /**
   * @param {Schema} schema
   * @param {Schema} schemas alternative schemas (OR)
   */
  constructor(schema, ...schemas) {
    this.schemas = [schema].concat(schemas);
  }

  /**
   * Does this query pattern match the given query?
   *
   * @param {Query} query
   * @returns {boolean}
   */
  matches(query) {
    return this.schemas.some(schema => matches(schema, query));
  }

  /**
   * Checks the given query against the given state. This method may throw if
   * the query is forbidden; it may also modify the query.
   *
   * This method is deliberately named to match m-ld constraint checks, which
   * have a similar role.
   *
   * @param {import('@m-ld/m-ld').MeldReadState}state the current domain state
   * @param {Query} query the query to check
   * @returns {Query | Promise<Query>} the (maybe modified) query to execute
   * @throws {import('restify-errors').ForbiddenError} if query not allowed
   */
  async check(state, query) {
    return query;
  }
}

export class ReadPattern extends QueryPattern {
  /**
   * @param {Schema} whereSchema first or only join
   * @param {Schema} joinSchemas additional joins, in a @where array
   */
  constructor(whereSchema, ...joinSchemas) {
    super({
      properties: { '@where': joinSchemas.length ? { elements: {} } : whereSchema },
      additionalProperties: true // @describe, @construct, @select
    });
    this.joinSchemas = /**@type {Schema[]}*/[whereSchema].concat(joinSchemas);
  }

  matches(query) {
    // Check that every join in the where clause matches a join schema
    return super.matches(query) &&
      (this.joinSchemas.length === 1 || this.matchJoins(query));
  }

  matchJoins(query) {
    const joinSchemas = [...this.joinSchemas];
    return query['@where'].every(join => matches(joinSchemas.shift(), join));
  }
}
