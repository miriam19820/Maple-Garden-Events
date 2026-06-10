import { createServer } from 'http';
import { Server } from 'socket.io';
import { startCronJobs } from './utils/cronJobs';
import { initOrderSequence } from './utils/eventCode';
import app from './app';

// יצירת שרת HTTP שמחזיק גם את Express (עם כל הנתיבים) וגם את Socket.io
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: { origin: "*" },
  // תוקן שלב 1: הוקטן ל-5MB כדי למנוע מתקפות DoS והצפת זיכרון בשרת
  maxHttpBufferSize: 5e6 
});

// פונקציית ה-Broadcast שדיברנו עליה
export const broadcastUpdate = (action: string, data: any) => {
  io.emit(action, data);
};

// --- כאן אנחנו מפעילים את הרובוט שלנו! ---
startCronJobs();

initOrderSequence()
  .then(() => {
    httpServer.listen(5000, () => console.log('🚀 Server running on port 5000'));
  })
  .catch((err) => {
    console.error('Failed to initialize order sequence:', err);
    process.exit(1);
  });