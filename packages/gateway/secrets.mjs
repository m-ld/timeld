import GatewayEnv from './lib/GatewayEnv.mjs';

////////////////////////////////////////////////////////////////////////////////
// Parse command line, environment variables & configuration
GatewayEnv.initScript();
const env = new GatewayEnv();
const config = await env.loadConfig();

////////////////////////////////////////////////////////////////////////////////
// Gateway & extension secrets
const keys = ['auth', 'key', 'smtp', 'caldav', 'prejournal', 'tiki'];
for (let [envVar, envValue] of Object.entries(env.asEnv(config, keys)))
  console.log(`${envVar}=${envValue}`);
