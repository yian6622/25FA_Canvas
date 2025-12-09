import { Difficulty, SessionStatus } from '../types';

// Simulating a backend database
const MOCK_SESSIONS: SessionStatus[] = [
  { sessionId: 's1', mapId: 'caloris', difficulty: 'medium', activePlayers: 2, status: 'active', startTime: Date.now() - 360000 },
  { sessionId: 's2', mapId: 'borealis', difficulty: 'hard', activePlayers: 1, status: 'active', startTime: Date.now() - 120000 },
];

class MockBackendService {
  private listeners: ((sessions: SessionStatus[]) => void)[] = [];

  constructor() {
    // Simulate incoming traffic/updates
    setInterval(() => {
      this.simulateRandomUpdate();
    }, 5000);
  }

  // Subscribe to "WebSocket" updates
  subscribe(callback: (sessions: SessionStatus[]) => void) {
    this.listeners.push(callback);
    callback(MOCK_SESSIONS); // Initial data
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  async joinSession(mapId: string, difficulty: Difficulty): Promise<SessionStatus> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const existing = MOCK_SESSIONS.find(s => s.mapId === mapId && s.difficulty === difficulty);
    
    if (existing) {
      existing.activePlayers++;
      this.broadcast();
      return existing;
    } else {
      const newSession: SessionStatus = {
        sessionId: Math.random().toString(36).substr(2, 9),
        mapId,
        difficulty,
        activePlayers: 1,
        status: 'active',
        startTime: Date.now()
      };
      MOCK_SESSIONS.push(newSession);
      this.broadcast();
      return newSession;
    }
  }

  private simulateRandomUpdate() {
    // Randomly change player counts to make the lobby feel "live"
    if (Math.random() > 0.7) {
      const target = MOCK_SESSIONS[Math.floor(Math.random() * MOCK_SESSIONS.length)];
      if (target) {
        target.activePlayers += Math.random() > 0.5 ? 1 : -1;
        if (target.activePlayers < 0) target.activePlayers = 0;
        if (target.activePlayers === 0) target.status = 'available';
        this.broadcast();
      }
    }
  }

  private broadcast() {
    this.listeners.forEach(cb => cb([...MOCK_SESSIONS]));
  }
}

export const backendService = new MockBackendService();