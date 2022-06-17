import { validate as matches } from 'jtd';

/**
 * @typedef {import('@m-ld/m-ld').Query} Query
 */

export class QueryPattern {
  /**
   * @param {import('jtd').Schema} schema
   */
  constructor(schema) {
    this.schema = schema;
  }

  /**
   * Does this query pattern match the given query?
   *
   * @param {Query} query
   * @returns {boolean}
   */
  matches(query) {
    // noinspection JSCheckFunctionSignatures
    return matches(this.schema, query, { maxErrors: 1 }).length === 0;
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
   * @returns {Promise<Query>} the (maybe modified) query to execute
   * @throws {import('restify-errors').ForbiddenError} if query not allowed
   */
  async check(state, query) {
    return query;
  }
}

export class ReadPattern extends QueryPattern {
  constructor(whereSchema) {
    super({
      properties: { '@where': whereSchema },
      additionalProperties: true // @describe, @construct, @select
    });
  }
}