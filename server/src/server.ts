import { createServer } from 'http';
import { Server } from 'socket.io';
import { startCronJobs } from './utils/cronJobs';
import { initOrderSequence } from './utils/eventCode';
import app from './app'; // הוספנו את הייבוא של האפליקציה המלאה שלנו מ-app.ts!

// יצירת שרת HTTP שמחזיק גם את Express (עם כל הנתיבים) וגם את Socket.io
const httpServer = createServer(app);

// הוספנו את המילה export לפני const
// בקובץ src/server.ts
export const io = new Server(httpServer, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e8 // מעלה את המגבלה ל-100MB
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