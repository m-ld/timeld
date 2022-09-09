import ScrapeGoat from 'scrapegoat';
import { durationFromInterval, Entry, Session } from 'timeld-common';
import { concatMap, filter, interval, skipWhile } from 'rxjs';
import LOG from 'loglevel';

/**
 * @typedef {object} CalDavConfig
 * @property {string} uri API URL e.g. https://p116-caldav.icloud.com/151157399/calendars/work
 * @property {string} [owner] Calendar owner IRI
 * @property {object} [auth] CalDAV authorisation
 * @property {object} [auth.user] WebDAV user
 * @property {object} [auth.pass] WebDAV password
 * @property {number} [pollInterval] CalDAV polling interval millis
 */

/**
 * @implements Connector
 */
export default class CalDavConnector {
  // noinspection JSUnusedGlobalSymbols used to provide the configuration
  static configKey = 'caldav';
  // noinspection JSUnusedGlobalSymbols used to negotiate content types
  static contentType = 'text/calendar';

  /**
   * Construct with configuration parameters
   * @param {CalDavConfig} config
   * @param {GraphSubject} ext
   * @param {function(new:Calendar, config: CalDavConfig)} Calendar
   */
  constructor(
    config,
    ext,
    Calendar = ScrapeGoat
  ) {
    const missingConfig = ['uri'].filter(k => !config[k]);
    if (missingConfig.length)
      throw new Error(`Missing CalDAV config: ${missingConfig.join(', ')}`);
    this.uri = new URL(config.uri);
    this.owner = config.owner;
    this.calendar = new Calendar(config);
    this.pollInterval = config.pollInterval || 10000;
    this.ext = ext;
  }

  async syncTimesheet(tsId, state) {
    const session = new Session();
    if (state) {
      const events = /**@type {object[]}*/await this.calendar.getAllEvents();
      await state.write({ '@insert': this.eventsInsert(tsId, events, session) });
    }
    let running = false; // To prevent buffer overflow in concatMap
    return interval(this.pollInterval).pipe(
      skipWhile(() => running),
      concatMap(async () => {
        running = true;
        try {
          const eventIdsToDelete = new Set(Object.keys(this.ext)
            .filter(prop => prop.startsWith(this.uri.origin)));
          const eventsToLoad = (await this.calendar.getEtags())
            .filter(eventMeta => {
              const eventId = this.getEventId(eventMeta);
              eventIdsToDelete.delete(eventId);
              return this.ext[eventId] !== eventMeta.etag;
            })
            .map(eventMeta => ({ ics: eventMeta.ics }));
          if (eventsToLoad.length > 0 || eventIdsToDelete.size > 0) {
            let uid = eventsToLoad.length; // No conflict with events to re-load
            const update = {
              '@delete': [...eventIdsToDelete].map(eventId =>
                this.eventDelete(eventId, uid++, true)),
              '@insert': []
            };
            if (eventsToLoad.length > 0) {
              const events = /**@type {object[]}*/await this.calendar.getEvents(eventsToLoad);
              update['@delete'].push(...events.map((event, i) =>
                this.eventDelete(this.getEventId(event), i)));
              update['@insert'].push(...this.eventsInsert(tsId, events, session));
            }
            return update;
          }
        } catch (e) {
          LOG.warn('CalDAV update failed', e);
        } finally {
          running = false;
        }
      }),
      filter(update => update)
    );
  }

  /**
   * @param {string} eventId
   * @param {*} uid unique token for the deletion variable
   * @param {boolean} permanent `true` if the event will not be re-inserted
   */
  eventDelete(eventId, uid, permanent = false) {
    if (permanent)
      this.ext[eventId] = [];
    return ({
      // Note re-use of ?event variable in eventsInsert when an update
      '@id': `?event${uid}`, [`?p${uid}`]: `?o${uid}`,
      external: { '@id': eventId }
    });
  }

  /**
   * @param {AccountOwnedId} tsId
   * @param {object[]} events
   * @param {Session} session
   * @returns {*[]}
   */
  eventsInsert(tsId, events, session) {
    return [
      session.toJSON(),
      ...events.map((event, i) => {
        const start = new Date(event.data.start);
        const end = new Date(event.data.end);
        const eventId = this.getEventId(event);
        const activity = [event.data.title, event.data.description].filter(s => s).join(': ');
        LOG.debug('Saving entry', activity);
        const src = new Entry({
          seqNo: session.claimEntryId(),
          sessionId: session.id,
          activity,
          start,
          duration: durationFromInterval(start, end),
          providerId: this.owner || tsId.ownerIri(),
          externalId: eventId
        }).toJSON();
        if (this.ext[eventId]) // We already have it, so it's an update
          src['@id'] = `?event${i}`; // See eventDelete
        this.ext[eventId] = event.etag;
        return src;
      })
    ];
  }

  getEventId(eventMeta) {
    return new URL(eventMeta.ics, this.uri).toString();
  }

  entryUpdate(tsId, update, state) {
    // This connector is inbound-only
  }

  reportTimesheet(tsId, state) {
    // TODO: Would be a useful feature in future!
  }
}