import ablyModule from '@m-ld/m-ld/dist/ably';
import { CloneFactory, Env } from '../../index.mjs';

/**
 * @extends CloneFactory
 */
export default class AblyCloneFactory extends CloneFactory {
  async clone(config, dataDir, principal) {
    return super.clone(Env.mergeConfig(config, {
      // When using Ably, the authorisation key is an Ably key
      ably: { key: config.auth.key }
    }), dataDir, principal);
  }

  /**
   * TODO: This is a duplication of m-ld-cli/ext/ably.js
   * @param {MeldConfig} config
   * @param {object} [config.wrtc]
   * @returns {Promise<ConstructRemotes>}
   */
  async remotes(config) {
    // Load WRTC config from Xirsys if available
    if ('xirsys' in config) {
      const xirsys = await import('@m-ld/io-web-runtime/dist/server/xirsys');
      config.wrtc = await xirsys.loadWrtcConfig(config.xirsys);
    }
    if (config.wrtc)
      return ablyModule.AblyWrtcRemotes;
    else
      return ablyModule.AblyRemotes;
  }

  reusableConfig(config) {
    const { ably } = config;
    return Env.mergeConfig(super.reusableConfig(config), { ably }, {
      ably: { key: false, apiKey: false } // Remove Ably secrets
    });
  }
}