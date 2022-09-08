
export default class MiteFormat {
  /**
   * @param account_name configured account name
   * @see https://mite.yo.lk/en/api/
   */
  constructor({ account_name }) {
    if (!account_name)
      throw new Error('Mite connector needs account_name configuration');
    // Not including the format suffix for purity
    this.idIri = path => `https://${account_name}.mite.yo.lk/users/${path}`;
  }

  import(json) {
    // noinspection JSUnresolvedVariable
    return {
      external: this.idIri(`time_entries/${json.time_entry.id}`),
      activity: json.time_entry.note,
      provider: this.idIri(`users/${json.time_entry.user_id}`),
      start: json.time_entry.date_at,
      duration: json.time_entry.minutes
      // TODO: project, customer, billable, rate
    }
  }
}