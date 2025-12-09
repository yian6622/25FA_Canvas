import { WebSocketServer } from 'ws';
import { createServer } from 'http';

// Define WebSocket constants for Node.js environment
const WebSocket = {
  OPEN: 1
};

// Simple HTTP server for health checks / basic API if needed
const server = createServer((req, res) => {
  res.writeHead(200);
  res.end('Orbital Uplink Active');
});

const wss = new WebSocketServer({ server });

// IN-MEMORY STORE
// In production, use Redis
const sessions = {}; // Record<sessionId, SessionData>

// Helper: Generate Session ID
const generateId = () => Math.random().toString(36).substring(2, 9);

// Helper: Create initial config for randomness
const createSessionConfig = () => ({
    randomFactor: 0.8 + Math.random() * 0.4, // 0.8 to 1.2
    scatterSeed: Array.from({length: 100}, () => Math.random() * 100)
});

wss.on('connection', (ws) => {
  let currentSessionId = null;

  // Send list of available sessions immediately
  const sessionList = Object.values(sessions).map(s => ({
      sessionId: s.id,
      mapId: s.mapId,
      difficulty: s.difficulty,
      activePlayers: s.players.size,
      status: s.status,
      startTime: s.startTime
  }));
  
  ws.send(JSON.stringify({ type: 'SESSION_LIST', sessions: sessionList }));

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);

      if (msg.type === 'JOIN_SESSION') {
        const { mapId, difficulty } = msg;

        // Find existing or create new
        let session = Object.values(sessions).find(s => s.mapId === mapId && s.difficulty === difficulty);

        if (!session) {
          const id = generateId();
          session = {
            id,
            mapId,
            difficulty,
            players: new Set(),
            pieceStates: {}, // Truth of piece positions
            config: createSessionConfig(),
            startTime: Date.now(),
            status: 'active'
          };
          sessions[id] = session;
        }

        session.players.add(ws);
        currentSessionId = session.id;

        // Send Join Confirmation with CONFIG and CURRENT STATE
        ws.send(JSON.stringify({
            type: 'SESSION_JOINED',
            session: {
                sessionId: session.id,
                mapId: session.mapId,
                difficulty: session.difficulty,
                activePlayers: session.players.size,
                status: session.status,
                startTime: session.startTime
            },
            config: session.config,
            currentStates: session.pieceStates
        }));

        broadcastList();
      }

      if (msg.type === 'MOVE_PIECE' && currentSessionId) {
          const session = sessions[currentSessionId];
          if (session) {
              // Update Truth
              if (!session.pieceStates[msg.pieceId]) {
                  session.pieceStates[msg.pieceId] = { id: msg.pieceId, position: msg.position, groupId: msg.pieceId, isSolved: false };
              } else {
                  session.pieceStates[msg.pieceId].position = msg.position;
              }

              // Broadcast to OTHERS (Optimistic UI handles self)
              session.players.forEach(client => {
                  if (client !== ws && client.readyState === WebSocket.OPEN) {
                      client.send(JSON.stringify({
                          type: 'PIECE_MOVED',
                          pieceId: msg.pieceId,
                          position: msg.position,
                          groupId: session.pieceStates[msg.pieceId].groupId
                      }));
                  }
              });
          }
      }

      if (msg.type === 'MERGE_GROUP' && currentSessionId) {
          const session = sessions[currentSessionId];
          if (session) {
             const { sourceGroupId, targetGroupId, alignOffset } = msg;
             
             // Update all pieces in source group to have targetGroupId and adjust pos
             Object.values(session.pieceStates).forEach(p => {
                 if (p.groupId === sourceGroupId) {
                     p.groupId = targetGroupId;
                     p.position = [
                         p.position[0] + alignOffset[0],
                         p.position[1] + alignOffset[1],
                         p.position[2] + alignOffset[2]
                     ];
                 }
             });

             // Broadcast Merge
             session.players.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'GROUP_MERGED',
                        sourceGroupId, 
                        targetGroupId,
                        alignOffset
                    }));
                }
             });
          }
      }
      
      if (msg.type === 'LEAVE_SESSION') {
          handleDisconnect();
      }

    } catch (e) {
      console.error("Error processing message", e);
    }
  });

  ws.on('close', () => handleDisconnect());

  function handleDisconnect() {
      if (currentSessionId && sessions[currentSessionId]) {
          sessions[currentSessionId].players.delete(ws);
          if (sessions[currentSessionId].players.size === 0) {
              // Keep session alive for a bit or delete?
              // For persistence, keep it. For this demo, delete after timeout?
              // Let's keep it in memory so players can rejoin.
          }
          currentSessionId = null;
          broadcastList();
      }
  }

  function broadcastList() {
      const list = Object.values(sessions).map(s => ({
          sessionId: s.id,
          mapId: s.mapId,
          difficulty: s.difficulty,
          activePlayers: s.players.size,
          status: s.status,
          startTime: s.startTime
      }));
      wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'SESSION_LIST', sessions: list }));
          }
      });
  }
});

server.listen(3001, () => {
  console.log('Orbital Uplink Server listening on port 3001');
});