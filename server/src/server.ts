import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// יצירת שרת HTTP שמחזיק גם את Express וגם את Socket.io
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

// פונקציית ה-Broadcast שדיברנו עליה
export const broadcastUpdate = (action: string, data: any) => {
  io.emit(action, data);
};

// ... כאן יבואו ה-routes שלך (כמו app.use('/api', ...))

httpServer.listen(5000, () => console.log('🚀 Server running on port 5000'));