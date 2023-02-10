import { ClassicLevel } from 'classic-level';
import { clone as meldClone } from '@m-ld/m-ld';
import TimeldApp from './TimeldApp.mjs';

/**
 * @abstract
 */
export default class CloneFactory {
  /**
   * @param {TimeldConfig} config
   * @param {string} [dataDir] (optional for testing)
   * @param {TimeldPrincipal} [principal] (optional for security testing)
   * @returns {Promise<MeldClone>}
   */
  async clone(config, dataDir, principal) {
    const domainName = config['@domain'];
    // noinspection JSCheckFunctionSignatures
    return meldClone(
      this.backend(dataDir),
      await this.remotes(config),
      config,
      principal && this.app(domainName, principal));
  }

  /**
   * @param {string} [dataDir]
   * @returns {import('abstract-level').AbstractLevel}
   */
  backend(dataDir) {
    if (dataDir == null)
      throw new RangeError('Data directory required in base clone factory');
    return new ClassicLevel(dataDir);
  }

  /**
   * @param {MeldConfig} config
   * @returns {ConstructRemotes | Promise<ConstructRemotes>}
   */
  remotes(config) {
    throw undefined;
  }

  /**
   * @param {string} domainName
   * @param {TimeldPrincipal} principal
   * @returns {InitialApp}
   */
  app(domainName, principal) {
    return new TimeldApp(domainName, principal);
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

