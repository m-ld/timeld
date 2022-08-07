import ablyModule from '@m-ld/m-ld/ext/ably';
import leveldown from 'leveldown';
import { clone as meldClone } from '@m-ld/m-ld';
import TimeldApp from './TimeldApp.mjs';

/**
 * TODO: This is a duplication of m-ld-cli/ext/ably.js
 * @param {TimeldConfig} config
 */
async function ably(config) {
  // Load WRTC config from Xirsys if available
  if ('xirsys' in config) {
    const xirsys = await import('@m-ld/io-web-runtime/dist/server/xirsys');
    config.wrtc = await xirsys.loadWrtcConfig(config.xirsys);
  }
  if (config['wrtc'])
    return ablyModule.AblyWrtcRemotes;
  else
    return ablyModule.AblyRemotes;
}

/**
 * @param {TimeldConfig} config
 * @param {string} dataDir
 * @param {import('@m-ld/m-ld').AppPrincipal} [principal]
 * @returns {Promise<import('@m-ld/m-ld').MeldClone>}
 */
export default async function clone(
  config, dataDir, principal) {
  // noinspection JSCheckFunctionSignatures
  return meldClone(
    leveldown(dataDir),
    await ably(config),
    config,
    principal ? TimeldApp(config, principal) : {});
}
