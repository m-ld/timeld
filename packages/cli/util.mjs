/**
 * @param {Date} date
 * @returns {{'@value': string, '@type': string}}
 */
export function dateJsonLd(date) {
  return {
    '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
    '@value': date.toISOString()
  };
}