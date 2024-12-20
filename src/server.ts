/**
 * Create WeTTY server
 * @module WeTTy
 */
import express from 'express';
import gc from 'gc-stats';
import url from 'url';
import { Gauge, collectDefaultMetrics } from 'prom-client';
import { getCommand } from './server/command.js';
import { gcMetrics } from './server/metrics.js';
import { server } from './server/socketServer.js';
import { spawn } from './server/spawn.js';
import {
  sshDefault,
  serverDefault,
  forceSSHDefault,
  defaultCommand,
} from './shared/defaults.js';
import { logger as getLogger } from './shared/logger.js';
import type { SSH, SSL, Server } from './shared/interfaces.js';
import type { Express } from 'express';
import type SocketIO from 'socket.io';
import { Signature } from 'signed';

export * from './shared/interfaces.js';
export { logger as getLogger } from './shared/logger.js';

const wettyConnections = new Gauge({
  name: 'wetty_connections',
  help: 'number of active socket connections to wetty',
});

/**
 * Starts WeTTy Server
 * @name startServer
 * @returns Promise that resolves SocketIO server
 */
export const start = (
  ssh: SSH = sshDefault,
  serverConf: Server = serverDefault,
  command: string = defaultCommand,
  signingSecret: string | undefined = undefined,
  forcessh: boolean = forceSSHDefault,
  ssl: SSL | undefined = undefined,
): Promise<SocketIO.Server> =>
  decorateServerWithSsh(
    express(),
    ssh,
    serverConf,
    command,
    signingSecret,
    forcessh,
    ssl,
  );

export async function decorateServerWithSsh(
  app: Express,
  ssh: SSH = sshDefault,
  serverConf: Server = serverDefault,
  command: string = defaultCommand,
  signingSecret: string | undefined = undefined,
  forcessh: boolean = forceSSHDefault,
  ssl: SSL | undefined = undefined,
): Promise<SocketIO.Server> {
  const logger = getLogger();
  if (ssh.key && !signingSecret) {
    logger.warn(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
! Password-less auth enabled using private key from ${ssh.key}.
! This is dangerous, anything that reaches the wetty server
! will be able to run remote operations without authentication.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
  }

  collectDefaultMetrics();
  gc().on('stats', gcMetrics);

  const io = await server(app, serverConf, ssl);
  /**
   * Wetty server connected too
   * @fires WeTTy#connnection
   */
  io.on('connection', async (socket: SocketIO.Socket) => {
    /**
     * @event wetty#connection
     * @name connection
     */
    logger.info('Connection accepted.');
    wettyConnections.inc();

    const {
      request: {
        headers: { referer },
      },
    } = socket;

    const queryString = url.parse(referer || '', true).query;
    if (queryString.signed || signingSecret) {
      // We are trying to sign the URL parameters
      if (!signingSecret || !queryString.signed || !referer) {
        logger.error(
          'One of signingSecret or the `signed` query parameter is missing',
        );

        socket.disconnect();
        wettyConnections.dec();
        return;
      }

      const signature = new Signature({
        secret: signingSecret,
      });

      try {
        signature.verify(referer);
      } catch (error) {
        logger.info("Couldn't verify URL signature", { err: error });

        socket.disconnect();
        wettyConnections.dec();
        return;
      }
    }

    try {
      const args = await getCommand(socket, ssh, command, forcessh);
      logger.debug('Command Generated', { cmd: args.join(' ') });
      await spawn(socket, args);
    } catch (error) {
      logger.info('Disconnect signal sent', { err: error });
      wettyConnections.dec();
    }
  });
  return io;
}
