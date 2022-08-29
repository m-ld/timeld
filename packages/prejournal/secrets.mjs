/**
 * Output required secrets
 * @param {PrejournalConfig} config.prejournal
 */
export default function (config) {
  console.log(`TIMELD_GATEWAY_PREJOURNAL__KEY=${config.prejournal.key}`);
  console.log(`TIMELD_GATEWAY_PREJOURNAL__USER=${config.prejournal.user}`);
  console.log(`TIMELD_GATEWAY_PREJOURNAL__CLIENT=${config.prejournal.client}`);
  console.log(`TIMELD_GATEWAY_PREJOURNAL__API=${config.prejournal.api}`);
}