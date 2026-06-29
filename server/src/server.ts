import './instrument';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { socketAuthMiddleware } from './middlewares/socketAuth';
import { startCronJobs } from './utils/cronJobs';
import { initOrderSequence } from './utils/eventCode';
import { logger } from './utils/logger';
import { verifyEmailConnection } from './utils/mailer';
import app from './app';
import { getCorsOrigins } from './config/corsOrigins';

const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: {
    origin: getCorsOrigins(),
    credentials: true,
  },
  maxHttpBufferSize: 5e6,
});

io.use(socketAuthMiddleware);

export const broadcastUpdate = (action: string, data: unknown) => {
  io.emit(action, data);
};

startCronJobs();

const PORT = Number(process.env.PORT) || 5000;

initOrderSequence()
  .then(async () => {
    await verifyEmailConnection();
    httpServer.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    logger.error('Failed to initialize order sequence', { error: err });
    process.exit(1);
  });
