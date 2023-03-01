export default class Principal {
  /**
   * @param {string} spec.id absolute principal ID
   * @param {'Gateway'|'Account'} spec.type note vocab is common to Gateway and Timesheet
   * @param {UserKey} spec.key
   */
  constructor(spec) {
    this['@id'] = spec.id;
    this['@type'] = spec.type;
    this.key = spec.key;
  }

  toJSON() {
    return {
      '@id': this['@id'],
      '@type': this['@type'],
      key: this.key.toJSON(true)
    }
  }
}