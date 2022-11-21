import { ClassicLevel } from 'classic-level';
import { clone as meldClone } from '@m-ld/m-ld';
import TimeldApp from './TimeldApp.mjs';


/**
 * @abstract
 */
export default class CloneFactory {
  /**
   * @param {TimeldConfig} config
   * @param {string} dataDir
   * @param {AppPrincipal} [principal]
   * @returns {Promise<MeldClone>}
   */
  async clone(config, dataDir, principal) {
    // noinspection JSCheckFunctionSignatures
    return meldClone(
      new ClassicLevel(dataDir),
      await this.remotes(config),
      config,
      { principal },
      new TimeldApp(config, principal));
  }

  /**
   * @param {MeldConfig} config
   * @returns {ConstructRemotes | Promise<ConstructRemotes>}
   */
  remotes(config) {
    throw undefined;
  }

  /**
   * @param {MeldConfig} config
   * @returns {Partial<MeldConfig>} the subset of configuration that can be
   * re-used by other engines cloning the same domains
   */
  reusableConfig(config) {
    const { networkTimeout, maxOperationSize, logLevel } = config;
    return { networkTimeout, maxOperationSize, logLevel };
  }
}