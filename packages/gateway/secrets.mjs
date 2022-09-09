import { Env } from 'timeld-common';
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
// Gateway & extension secrets: auth, SMTP, caldav, prejournal, tiki
const keys = ['auth', 'smtp', 'caldav', 'prejournal', 'tiki'];
for (let [envVar, envValue] of Object.entries(env.asEnv(config, keys)))
  console.log(`${envVar}=${envValue}`);
