import ScrapeGoat from 'scrapegoat';
import { durationFromInterval, Entry, Session } from 'timeld-common';
import { concatMap, filter, interval, skipWhile } from 'rxjs';
import LOG from 'loglevel';

/**
 * @typedef {object} CalDavConfig
 * @property {string} owner Calendar owner IRI
 * @property {string} uri API URL e.g. https://p116-caldav.icloud.com/151157399/calendars/work
 * @property {object} [auth] CalDAV authorisation
 * @property {object} [auth.user] WebDAV user
 * @property {object} [auth.pass] WebDAV password
 * @property {number} pollInterval CalDAV polling interval millis
 */

/**
 * @implements Integration
 */
export default class CalDavIntegration {
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
    const missingConfig = ['uri', 'owner'].filter(k => !config[k]);
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
      await state.write({ '@insert': this.eventsInsert(events, session) });
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
              update['@insert'].push(...this.eventsInsert(events, session));
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
      '@id': `?s${uid}`, [`?p${uid}`]: `?o${uid}`,
      external: { '@id': eventId }
    });
  }

  eventsInsert(events, session) {
    return [
      session.toJSON(),
      ...events.map(event => {
        const start = new Date(event.data.start);
        const end = new Date(event.data.end);
        const eventId = this.getEventId(event);
        this.ext[eventId] = event.etag;
        const activity = [event.data.title, event.data.description].filter(s => s).join(': ');
        LOG.debug('Saving entry', activity);
        return new Entry({
          seqNo: session.claimEntryId(),
          sessionId: session.id,
          activity,
          start,
          duration: durationFromInterval(start, end),
          providerId: this.owner,
          externalId: eventId
        }).toJSON();
      })
    ];
  }

  getEventId(eventMeta) {
    return new URL(eventMeta.ics, this.uri).toString();
  }

  entryUpdate(tsId, update, state) {
    // This integration is inbound-only
  }

  reportTimesheet(tsId, state) {
    // TODO: Would be a useful feature in future!
  }
}