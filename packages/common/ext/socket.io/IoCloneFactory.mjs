import { CloneFactory, Env, resolveGateway } from '../../index.mjs';
import { IoRemotes } from '@m-ld/m-ld/dist/socket.io';
import LOG from 'loglevel';

export default class IoCloneFactory extends CloneFactory {
  /**
   * Set if the socket.io server address is known
   * @type {string}
   */
  address;

  async clone(config, dataDir, principal) {
    const { root } = resolveGateway(this.address || config['gateway']);
    const uri = (await root).toString();
    LOG.info('IO connecting to', uri, 'for', config['@domain']);
    return super.clone(Env.mergeConfig(config, {
      // When using Socket.io, the authorisation key is sent to the server
      // See https://socket.io/docs/v4/middlewares/#sending-credentials
      io: {
        uri: uri,
        opts: {
          auth: {
            ...config.auth,
            // The user may be undefined, if this is a Gateway
            user: config['user'],
            '@domain': config['@domain']
          }
        }
      }
    }), dataDir, principal);
  }

  remotes(config) {
    return IoRemotes;
  }
}