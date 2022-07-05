import { isReference, optionalPropertyValue, withDoc } from '../lib/util.mjs';

export default class DomainEntity {
  /** @type {import('jtd').SchemaFormProperties} */
  static SCHEMA = {
    optionalProperties: {
      external: {
        ...withDoc('External identity for this subject. ' +
          'This property can only be written for a new subject, ' +
          'and cannot change thereafter'),
        ...isReference
      }
    }
  }

  static specFromJson(src) {
    return {
      externalId: optionalPropertyValue(src, 'external', Object)?.['@id']
    }
  }

  /**
   *
   * @param {string} [spec.externalId] external IRI of this entity
   */
  constructor(spec) {
    this.externalId = spec.externalId;
  }

  toJSON() {
    return {
      'external': this.externalId ? { '@id': this.externalId } : undefined
    }
  }
}