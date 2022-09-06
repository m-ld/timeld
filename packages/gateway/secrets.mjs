import { Env } from 'timeld-common';
import dotenv from 'dotenv';
import { join } from 'path';
import caldavSecrets from 'timeld-caldav/secrets.mjs';
import prejournalSecrets from 'timeld-prejournal/secrets.mjs';
import tikiSecrets from 'timeld-tiki/secrets.mjs';

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
// Gateway secrets: auth, SMTP
for (let [envVar, envValue] of Object.entries(env.asEnv(config, ['auth', 'smtp'])))
  console.log(`${envVar}=${envValue}`);

////////////////////////////////////////////////////////////////////////////////
// Extension secrets
// TODO: dynamically from config keys & available modules
if (config['caldav'])
  caldavSecrets(config);
if (config['prejournal'])
  prejournalSecrets(config);
if (config['tiki'])
  tikiSecrets(config);