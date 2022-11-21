import GatewayEnv from './lib/GatewayEnv.mjs';
import DomainKeyStore from 'timeld-common/ext/m-ld/DomainKeyStore.mjs';
import { UserKey } from 'timeld-common';

////////////////////////////////////////////////////////////////////////////////
// Parse command line, environment variables & configuration
GatewayEnv.initScript();
const env = new GatewayEnv();
const config = await env.loadConfig();
const keyStore = new DomainKeyStore(config);
const authKey = (await keyStore.mintKey(config['@domain'])).key;
const keyConfig = UserKey.generate(authKey).toConfig(authKey);
for (let [envVar, envValue] of Object.entries(env.asEnv(keyConfig)))
  console.log(`${envVar}=${envValue}`);
