/**
 * Output required secrets
 * @param {TikiConfig} config.tiki
 */
export default function (config) {
  console.log(`TIMELD_GATEWAY_TIKI__API=${config.tiki.api}`);
  console.log(`TIMELD_GATEWAY_TIKI__TOKEN=${config.tiki.token}`);
}