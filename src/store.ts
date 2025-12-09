import { create } from 'zustand';
import { GameState, Difficulty, SessionStatus, Region, PieceState, SessionConfig } from './types';
import { socketService } from './services/socketService';

interface StoreState extends GameState {
  sessions: SessionStatus[];
  isConnecting: boolean;
  displacementScale: number;
  
  // Actions
  setDifficulty: (diff: Difficulty) => void;
  setDisplacementScale: (scale: number) => void;
  selectMap: (mapId: string | null) => void;
  
  // Socket Actions
  initSocket: () => void;
  joinSession: (mapId: string, difficulty: Difficulty) => void;
  leaveSession: () => void;
  
  // Puzzle Actions
  setPuzzleRegions: (regions: Region[], config: SessionConfig, currentServerStates: Record<string, PieceState>) => void;
  
  // Interaction Actions
  setHoveredPiece: (id: string | null) => void;
  dragStart: (id: string) => void;
  dragMove: (delta: [number, number, number]) => void;
  dragEnd: () => void;
  
  togglePreviewSolved: () => void;
}

const SNAP_DISTANCE = 4.0; 

export const useStore = create<StoreState>((set, get) => ({
  currentView: 'lobby',
  selectedMapId: null,
  selectedDifficulty: 'medium',
  activeSession: null,
  sessions: [],
  isConnecting: false,
  isPreviewingSolved: false,
  displacementScale: 1.0,
  
  // Init Data
  sessionConfig: null,
  pendingServerStates: null,

  puzzleRegions: [],
  pieceStates: {},
  hoveredPieceId: null,
  draggedPieceId: null,
  snapCandidateGroupId: null,

  setDifficulty: (difficulty) => set({ selectedDifficulty: difficulty }),
  setDisplacementScale: (scale) => set({ displacementScale: scale }),
  selectMap: (mapId) => set({ selectedMapId: mapId }),

  initSocket: () => {
    socketService.connect();
    socketService.subscribe((msg) => {
      const state = get();
      switch(msg.type) {
        case 'SESSION_LIST':
          set({ sessions: msg.sessions });
          break;
        case 'SESSION_JOINED':
          set({ 
            activeSession: msg.session, 
            sessionConfig: msg.config, // Save for GameView to consume
            pendingServerStates: msg.currentStates, // Save for GameView to consume
            currentView: 'game', 
            isConnecting: false,
          });
          break;
        case 'PIECE_MOVED':
          if (state.draggedPieceId === msg.pieceId) return; // Ignore own echoes if active (optimistic UI handles it)
          
          set((prev) => {
             const newStates = { ...prev.pieceStates };
             // Update all pieces in that group
             Object.values(newStates).forEach(p => {
               if (p.groupId === msg.groupId) {
                  // Simple Sync: Update just this piece for now
               }
             });
             
             // Update the specific piece
             if (newStates[msg.pieceId]) {
                newStates[msg.pieceId] = {
                   ...newStates[msg.pieceId],
                   position: msg.position,
                   groupId: msg.groupId
                };
             }
             return { pieceStates: newStates };
          });
          break;
        case 'GROUP_MERGED':
           set((prev) => {
              const newStates = { ...prev.pieceStates };
              // Merge Logic
              const sourcePieces = Object.values(newStates).filter(p => p.groupId === msg.sourceGroupId);
              sourcePieces.forEach(p => {
                 newStates[p.id] = {
                    ...p,
                    groupId: msg.targetGroupId,
                    position: [
                       p.position[0] + msg.alignOffset[0],
                       p.position[1] + msg.alignOffset[1],
                       p.position[2] + msg.alignOffset[2]
                    ]
                 };
              });
              
              // Check completion
              const uniqueGroups = new Set(Object.values(newStates).map(p => p.groupId));
              if (uniqueGroups.size === 1) {
                  Object.values(newStates).forEach(p => {
                      newStates[p.id].isSolved = true;
                      newStates[p.id].position[1] = 0;
                  });
              }
              
              return { pieceStates: newStates };
           });
           break;
        case 'GAME_COMPLETED':
           set((prev) => {
              const newStates = { ...prev.pieceStates };
              Object.values(newStates).forEach(p => {
                 newStates[p.id].isSolved = true;
                 newStates[p.id].position[1] = 0;
              });
              return { pieceStates: newStates };
           });
           break;
      }
    });
  },

  joinSession: (mapId, difficulty) => {
    set({ isConnecting: true });
    socketService.send({ type: 'JOIN_SESSION', mapId, difficulty });
  },

  leaveSession: () => {
    socketService.send({ type: 'LEAVE_SESSION' });
    set({ currentView: 'lobby', activeSession: null, puzzleRegions: [], pieceStates: {}, sessionConfig: null, pendingServerStates: null });
  },

  setPuzzleRegions: (regions, config, currentServerStates) => {
    const states: Record<string, PieceState> = {};
    const hasServerState = Object.keys(currentServerStates).length > 0;

    regions.forEach((r, index) => {
      if (hasServerState && currentServerStates[r.id]) {
        // Use server state (re-joining or P2 joining)
        states[r.id] = currentServerStates[r.id];
      } else {
        // New Game: Generate Spawn Positions based on Config Seed
        const pseudoRandom = (offset: number) => {
            const x = Math.sin(config.scatterSeed[index % config.scatterSeed.length] + offset) * 10000;
            return x - Math.floor(x);
        };

        const range = 60;
        const scatterX = (pseudoRandom(1) - 0.5) * range; 
        const scatterY = 10 + pseudoRandom(2) * 15;
        const scatterZ = (pseudoRandom(3) - 0.5) * range;

        states[r.id] = {
          id: r.id,
          groupId: r.id,
          position: [scatterX, scatterY, scatterZ],
          isSolved: false
        };
      }
    });
    set({ puzzleRegions: regions, pieceStates: states });
  },

  togglePreviewSolved: () => set((state) => ({ isPreviewingSolved: !state.isPreviewingSolved })),

  setHoveredPiece: (id) => {
      const { draggedPieceId } = get();
      if (!draggedPieceId) {
          set({ hoveredPieceId: id });
      }
  },

  dragStart: (id) => {
    set({ draggedPieceId: id });
  },

  dragMove: (delta) => {
    const { pieceStates, draggedPieceId, puzzleRegions } = get();
    if (!draggedPieceId) return;

    const activeGroupId = pieceStates[draggedPieceId].groupId;
    const newStates = { ...pieceStates };
    let snapCandidate: string | null = null;

    // 1. Move all pieces in the current group
    (Object.values(newStates) as PieceState[]).forEach(piece => {
        if (piece.groupId === activeGroupId) {
            const newPos: [number, number, number] = [
                piece.position[0] + delta[0],
                piece.position[1] + delta[1],
                piece.position[2] + delta[2]
            ];
            newStates[piece.id] = { ...piece, position: newPos };
            
            socketService.send({
                type: 'MOVE_PIECE',
                pieceId: piece.id,
                position: newPos
            });
        }
    });

    // 2. Check for potential snaps with OTHER groups
    const movingPieces = (Object.values(newStates) as PieceState[]).filter(p => p.groupId === activeGroupId);
    const otherPieces = (Object.values(newStates) as PieceState[]).filter(p => p.groupId !== activeGroupId);

    for (const mover of movingPieces) {
        if (snapCandidate) break;
        
        const regionMover = puzzleRegions.find(r => r.id === mover.id);
        if (!regionMover) continue;

        for (const target of otherPieces) {
             const regionTarget = puzzleRegions.find(r => r.id === target.id);
             if (!regionTarget) continue;

             const idealDiffX = regionMover.center.x - regionTarget.center.x;
             const idealDiffY = regionMover.center.y - regionTarget.center.y; 

             const currentDiffX = mover.position[0] - target.position[0];
             const currentDiffZ = mover.position[2] - target.position[2];
             
             const dist = Math.sqrt(
                 Math.pow(currentDiffX - idealDiffX, 2) + 
                 Math.pow(currentDiffZ - idealDiffY, 2)
             );

             if (dist < SNAP_DISTANCE) {
                 snapCandidate = target.groupId;
                 break;
             }
        }
    }

    set({ pieceStates: newStates, snapCandidateGroupId: snapCandidate });
  },

  dragEnd: () => {
      const { pieceStates, draggedPieceId, snapCandidateGroupId, puzzleRegions } = get();
      if (!draggedPieceId) return;

      if (snapCandidateGroupId) {
          // MERGE GROUPS
          const activeGroupId = pieceStates[draggedPieceId].groupId;
          const newStates = { ...pieceStates };
          
          let offset: [number, number, number] = [0,0,0];
          let foundRef = false;

          const movingPieces = (Object.values(newStates) as PieceState[]).filter(p => p.groupId === activeGroupId);
          const targetPieces = (Object.values(newStates) as PieceState[]).filter(p => p.groupId === snapCandidateGroupId);

          for (const mover of movingPieces) {
            if (foundRef) break;
            const rMover = puzzleRegions.find(r => r.id === mover.id);
            for (const target of targetPieces) {
                 const rTarget = puzzleRegions.find(r => r.id === target.id);
                 if (rMover && rTarget) {
                    const idealX = target.position[0] + (rMover.center.x - rTarget.center.x);
                    const idealZ = target.position[2] + (rMover.center.y - rTarget.center.y);
                    const idealY = target.position[1]; 

                    offset = [
                        idealX - mover.position[0],
                        idealY - mover.position[1],
                        idealZ - mover.position[2]
                    ];
                    foundRef = true;
                    break;
                 }
            }
          }

          // Apply merge locally
          movingPieces.forEach(p => {
              newStates[p.id] = {
                  ...p,
                  groupId: snapCandidateGroupId, 
                  position: [
                      p.position[0] + offset[0],
                      p.position[1] + offset[1],
                      p.position[2] + offset[2]
                  ]
              };
          });
          
          socketService.send({
              type: 'MERGE_GROUP',
              sourceGroupId: activeGroupId,
              targetGroupId: snapCandidateGroupId,
              alignOffset: offset
          });

          // Check Completion
          const uniqueGroups = new Set((Object.values(newStates) as PieceState[]).map(p => p.groupId));
          if (uniqueGroups.size === 1) {
              const finalGroupId = [...uniqueGroups][0];
              const finalPieces = (Object.values(newStates) as PieceState[]).filter(p => p.groupId === finalGroupId);
              finalPieces.forEach(p => {
                  if (puzzleRegions.find(reg => reg.id === p.id)) {
                      newStates[p.id].position[1] = 0; 
                      newStates[p.id].isSolved = true;
                  }
              });
          }

          set({ pieceStates: newStates, snapCandidateGroupId: null, draggedPieceId: null });

      } else {
          set({ draggedPieceId: null, snapCandidateGroupId: null });
      }
  }

}));