/**
 * Output required secrets
 * @param {CalDavConfig} config.caldav
 */
export default function (config) {
  console.log(`TIMELD_GATEWAY_CALDAV__OWNER=${config.caldav.owner}`);
  console.log(`TIMELD_GATEWAY_CALDAV__URI=${config.caldav.uri}`);
  console.log(`TIMELD_GATEWAY_CALDAV__AUTH__USER=${config.caldav.auth.user}`);
  console.log(`TIMELD_GATEWAY_CALDAV__AUTH__PASS=${config.caldav.auth.pass}`);
}