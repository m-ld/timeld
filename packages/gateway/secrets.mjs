import { Env, UserKey } from 'timeld-common';
import dotenv from 'dotenv';
import { join } from 'path';

////////////////////////////////////////////////////////////////////////////////
// Load local environment from first found .env
for (let i = 0; i < 3; i++) {
  if (!dotenv.config({
    path: join(process.cwd(), ...new Array(i).fill('..'), '.env')
  }).error) break;
}
const env = new Env({}, 'timeld-gateway');
// Parse command line, environment variables & configuration
const config = /**@type {TimeldGatewayConfig}*/(await env.yargs()).parse();

////////////////////////////////////////////////////////////////////////////////
// Generate a new key pair for the new Gateway
Object.assign(config, UserKey.generate(config.ably.key).toConfig());

////////////////////////////////////////////////////////////////////////////////
// Output required secrets
console.log(`TIMELD_GATEWAY_KEY__PUBLIC=${config.key.public}`);
console.log(`TIMELD_GATEWAY_KEY__PRIVATE=${config.key.private}`);
console.log(`TIMELD_GATEWAY_ABLY__KEY=${config.ably.key}`);
// noinspection JSUnresolvedVariable WebStorm incorrectly merges ably property
console.log(`TIMELD_GATEWAY_ABLY__API_KEY=${config.ably.apiKey}`);
console.log(`TIMELD_GATEWAY_COURIER__AUTHORIZATION_TOKEN=${config.courier.authorizationToken}`);
console.log(`TIMELD_GATEWAY_COURIER__ACTIVATION_TEMPLATE=${config.courier.activationTemplate}`);
console.log(`TIMELD_GATEWAY_LOGZ__KEY=${config.logz.key}`);
