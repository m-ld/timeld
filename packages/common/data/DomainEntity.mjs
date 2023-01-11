import { isReference, withDoc } from '../lib/util.mjs';
import { Optional, Reference, propertyValue } from '@m-ld/m-ld';

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
      externalId: propertyValue(src, 'external', Optional, Reference)?.['@id']
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