import { Server } from 'socket.io';
import { IoRemotesService } from '@m-ld/m-ld/dist/socket.io-server';
import Authorization from '../lib/Authorization.mjs';
import { AccountOwnedId } from 'timeld-common';
import { ForbiddenError } from './errors.mjs';
import LOG from 'loglevel';

/**
 * @param {Gateway} gateway
 * @param {import('restify').Server} server
 */
export default function socketIo({ gateway, server }) {
  const io = new Server(server.server);
  // Attach authorisation
  io.use(async (socket, next) => {
    const { user, key } = socket.handshake.auth;
    const { '@domain': domainName } = socket.handshake.query;
    try {
      if (user) {
        // A user is trying to access a Timesheet
        await new Authorization({ user, key }).verifyUser(gateway, {
          id: AccountOwnedId.fromDomain(domainName), forWrite: 'Timesheet'
        });
      } else if (key !== gateway.authKey.toString()) {
        // The gateway is connecting to a domain: its own, or a Timesheet
        return next(new ForbiddenError('Unrecognised machine key'));
      }
      LOG.debug('IO authorised for', user, 'in', domainName);
      return next();
    } catch (e) {
      LOG.error('IO authorisation failed for', user, 'in', domainName, e);
      return next(e);
    }
  });
  return new IoRemotesService(io.sockets);
}