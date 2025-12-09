import React, { useEffect, useState, Suspense, useRef } from 'react';
import { useStore } from '../store';
import { ImageProcessor } from '../services/imageProcessor';
import { PuzzlePiece } from './PuzzlePiece';
import { ArrowLeft, RefreshCw, CheckCircle, AlertTriangle, Eye, EyeOff, Maximize2, X, Sliders, Timer } from 'lucide-react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, PerspectiveCamera } from '@react-three/drei';
import { PieceState, SessionConfig } from '../types';

// Map configs
const MAP_CONFIGS: Record<string, {area: string, depth: string, thumbnail: string}> = {
  'mercury_beethoven': {
     area: 'https://raw.githubusercontent.com/yian6622/25FA_Canvas/main/Area_Beethoven%20Quadrangle%20of%20Mercury.png',
     depth: 'https://raw.githubusercontent.com/yian6622/25FA_Canvas/main/Depth_Beethoven%20Quadrangle%20of%20Mercury.png',
     thumbnail: 'https://raw.githubusercontent.com/yian6622/25FA_Canvas/main/Mercury_tn.png'
  },
  'venus_metis': {
     area: 'https://raw.githubusercontent.com/yian6622/25FA_Canvas/main/Area_Metis%20Mons%20Quadrangle%20(V%E2%80%936).png',
     depth: 'https://raw.githubusercontent.com/yian6622/25FA_Canvas/main/Depth_Metis%20Mons%20Quadrangle%20(V%E2%80%936).png',
     thumbnail: 'https://raw.githubusercontent.com/yian6622/25FA_Canvas/main/Venus_tn.png'
  }
};

const CameraTracker = ({ onRotate }: { onRotate: (deg: number) => void }) => {
    useFrame((state) => {
        const cam = state.camera;
        const angle = Math.atan2(cam.position.x, cam.position.z);
        onRotate(angle * (180 / Math.PI));
    });
    return null;
};

// Timer Helper - Now syncs with server start time
const GameTimer = ({ startTime, isComplete }: { startTime: number, isComplete: boolean }) => {
    const [seconds, setSeconds] = useState(0);
    
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (!isComplete && startTime > 0) {
            interval = setInterval(() => {
                const now = Date.now();
                setSeconds(Math.floor((now - startTime) / 1000));
            }, 1000);
        } else if (startTime === 0) {
            setSeconds(0);
        }
        return () => clearInterval(interval);
    }, [isComplete, startTime]);

    const formatTime = (totalSeconds: number) => {
        const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    return (
        <div className="flex items-center gap-3 bg-black/60 backdrop-blur-xl px-6 py-4 rounded-full border border-white/10 shadow-lg text-emerald-400 font-mono text-xl tracking-widest">
            <Timer className={isComplete ? "" : "animate-pulse"} size={20} />
            {formatTime(seconds)}
        </div>
    );
};

export const GameView: React.FC = () => {
  const { 
      leaveSession, 
      selectedDifficulty, 
      setPuzzleRegions, 
      puzzleRegions, 
      pieceStates, 
      togglePreviewSolved,
      isPreviewingSolved,
      displacementScale,
      setDisplacementScale,
      activeSession,
      sessionConfig,
      pendingServerStates
  } = useStore();

  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("Initializing Orbital Uplink...");
  const [error, setError] = useState<string | null>(null);
  const [gridDim, setGridDim] = useState({ w: 0, h: 0 });
  const [controlsEnabled, setControlsEnabled] = useState(true);
  
  // Interaction States
  const [isThumbnailExpanded, setThumbnailExpanded] = useState(false);
  const [cameraRotation, setCameraRotation] = useState(0);
  const processedRef = useRef(false);

  const initialCamDist = selectedDifficulty === 'hard' ? 160 : selectedDifficulty === 'medium' ? 120 : 80;

  useEffect(() => {
    // If we already have regions, stop loading.
    if (puzzleRegions.length > 0) {
        setLoading(false);
        return;
    }

    // Wait for Config and Session to be available in Store
    if (!activeSession || !sessionConfig || processedRef.current) return;

    const initMap = async () => {
        setLoading(true);
        setLoadingStatus("Processing Topography...");
        
        const mapConfig = MAP_CONFIGS[activeSession.mapId];
        if (!mapConfig) {
             setError("Map Data Corrupt");
             return;
        }

        try {
            processedRef.current = true;
            const factor = sessionConfig.randomFactor ?? 1.0;
            setLoadingStatus(`Processing Topography (Variance: ${factor.toFixed(2)})...`);
            
            const { regions, gridSize } = await ImageProcessor.process(
                mapConfig.area, 
                mapConfig.depth, 
                activeSession.difficulty, 
                factor
            );
            
            setGridDim(gridSize);
            setPuzzleRegions(regions, sessionConfig, pendingServerStates || {});
            setLoading(false);

        } catch (e) {
            console.error(e);
            setError("Topography Generation Failed.");
            setLoading(false);
        }
    };

    initMap();

  }, [activeSession, sessionConfig, pendingServerStates, puzzleRegions.length, setPuzzleRegions]); 

  const uniqueGroups = new Set((Object.values(pieceStates) as PieceState[]).map(p => p.groupId));
  const isComplete = !loading && puzzleRegions.length > 0 && uniqueGroups.size === 1 && (Object.values(pieceStates) as PieceState[])[0].isSolved;
  
  const progress = puzzleRegions.length > 1 
    ? Math.max(0, Math.round(100 - ((uniqueGroups.size - 1) / (puzzleRegions.length - 1) * 100))) 
    : 0;
  
  const activeConfig = activeSession ? MAP_CONFIGS[activeSession.mapId] : null;

  return (
    <div className="w-full h-screen bg-black relative select-none overflow-hidden">
      
      {/* --- HUD LAYER --- */}
      <div className="absolute inset-0 z-20 pointer-events-none p-8 flex flex-col justify-between">
        
        {/* Top Bar */}
        <div className="flex justify-between items-start w-full">
          {/* Top Left: Back + Controls */}
          <div className="flex flex-col gap-4 pointer-events-auto">
            <button 
                onClick={leaveSession}
                className="group flex items-center gap-3 bg-black/40 backdrop-blur-md px-6 py-3 rounded-full border border-white/10 hover:bg-red-500/20 hover:border-red-500/50 transition-all shadow-lg w-max"
            >
                <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform text-white" />
                <span className="font-display font-bold text-sm tracking-widest text-white">
                    {isComplete ? 'RETURN TO BASE' : 'ABORT MISSION'}
                </span>
            </button>

            {/* Displacement Slider */}
            {!loading && !isComplete && (
                <div className="bg-black/60 backdrop-blur-xl p-4 rounded-2xl border border-white/10 flex flex-col gap-2 w-64">
                    <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                        <Sliders size={14} /> EXTRUSION SCALE
                    </div>
                    <input 
                        type="range" 
                        min="0.5" 
                        max="3" 
                        step="0.1" 
                        value={displacementScale} 
                        onChange={(e) => setDisplacementScale(parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                    />
                </div>
            )}
          </div>

          {/* Top Right: Progress & Visuals */}
          <div className="flex flex-col items-end gap-3 pointer-events-auto">
             {/* Progress Block */}
             <div className="bg-black/60 backdrop-blur-xl p-4 rounded-3xl border border-white/10 shadow-2xl min-w-[240px]">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-mono text-slate-400 tracking-widest">ASSEMBLY INTEGRITY</span>
                    <span className={`font-display font-bold text-xl ${isComplete ? 'text-emerald-400' : 'text-orange-400'}`}>
                        {progress}%
                    </span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                        className={`h-full transition-all duration-700 ${isComplete ? 'bg-emerald-500' : 'bg-orange-500'}`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
             </div>
             
             {/* Controls Group */}
             {!loading && !isComplete && (
                <div className="flex flex-col items-end gap-4 mt-4">
                    <button 
                        onMouseDown={togglePreviewSolved}
                        onMouseUp={togglePreviewSolved}
                        onMouseLeave={() => isPreviewingSolved && togglePreviewSolved()}
                        className={`
                            flex items-center gap-2 px-5 py-3 rounded-full border font-bold text-xs tracking-widest transition-all shadow-lg
                            ${isPreviewingSolved 
                                ? 'bg-orange-500 text-black border-orange-500 scale-105' 
                                : 'bg-black/60 text-orange-400 border-orange-500/30 hover:bg-orange-500/10'}
                        `}
                    >
                        {isPreviewingSolved ? <Eye size={16}/> : <EyeOff size={16}/>}
                        {isPreviewingSolved ? 'RELEASING SNAP...' : 'HOLD TO PREVIEW'}
                    </button>
                </div>
             )}
          </div>
        </div>

        {/* Center Loading/Error */}
        {(loading || error) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50 pointer-events-auto">
                {loading && (
                    <div className="text-center">
                        <RefreshCw size={48} className="animate-spin text-orange-500 mx-auto mb-6" />
                        <h2 className="text-2xl font-display font-bold text-white mb-2 tracking-widest animate-pulse">SYSTEM PROCESSING</h2>
                        <div className="font-mono text-orange-400 text-sm">{loadingStatus}</div>
                    </div>
                )}
                {error && (
                    <div className="text-center max-w-md bg-red-900/20 p-8 rounded-[2rem] border border-red-500/50">
                        <AlertTriangle size={48} className="text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-display font-bold text-white mb-4">ERROR</h2>
                        <p className="font-mono text-red-300 text-sm mb-6">{error}</p>
                        <button onClick={leaveSession} className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-full font-bold text-sm">RETURN</button>
                    </div>
                )}
            </div>
        )}

        {/* Success State */}
        {isComplete && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 pointer-events-auto">
                <div className="animate-bounce bg-emerald-500 text-black px-8 py-4 rounded-full font-display font-bold text-xl tracking-widest shadow-[0_0_40px_rgba(16,185,129,0.6)] flex items-center gap-3">
                    <CheckCircle size={28} />
                    SECTOR SECURED
                </div>
            </div>
        )}
        
        {/* Bottom Left: Timer */}
        {!loading && !error && activeSession && (
            <div className="absolute bottom-8 left-8 pointer-events-auto">
                <GameTimer startTime={activeSession.startTime} isComplete={isComplete} />
            </div>
        )}

        {/* Bottom Right Radar */}
        {!loading && !isComplete && activeConfig && (
             <div className="absolute bottom-8 right-8 pointer-events-auto">
                 <div 
                    className="relative w-72 h-72 rounded-full border-4 border-white/10 bg-black/50 backdrop-blur-md shadow-2xl cursor-pointer hover:border-orange-500/50 transition-colors overflow-hidden group"
                    onClick={() => setThumbnailExpanded(true)}
                 >
                     <div 
                        className="w-full h-full transition-transform duration-100 ease-linear origin-center"
                        style={{ transform: `rotate(${cameraRotation}deg)` }}
                     >
                        <img 
                            src={activeConfig.thumbnail} 
                            alt="Map Radar" 
                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                     </div>
                     <div className="absolute inset-0 pointer-events-none flex justify-center pt-1">
                         <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[20px] border-b-red-500/90 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                     </div>
                     <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 pointer-events-none">
                         <Maximize2 size={48} className="text-white drop-shadow-xl" />
                     </div>
                 </div>
             </div>
        )}

      </div>

      {/* Map Preview Modal */}
      {isThumbnailExpanded && activeConfig && (
        <div 
            className="absolute inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200 pointer-events-auto"
            onClick={() => setThumbnailExpanded(false)}
        >
            <div className="relative max-w-7xl max-h-full border border-white/20 rounded-xl overflow-hidden shadow-2xl flex items-center justify-center bg-black">
                <img 
                    src={activeConfig.area} 
                    alt="Full Map" 
                    className="max-w-full max-h-[90vh] object-contain" 
                />
                <button 
                    className="absolute top-4 right-4 bg-black/60 p-3 rounded-full text-white hover:bg-white/20 hover:text-orange-400 transition-colors"
                    onClick={(e) => {
                        e.stopPropagation();
                        setThumbnailExpanded(false);
                    }}
                >
                    <X size={32} />
                </button>
            </div>
        </div>
      )}

      {/* --- 3D SCENE --- */}
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[0, initialCamDist * 0.8, initialCamDist]} fov={40} />
        <CameraTracker onRotate={setCameraRotation} />
        <color attach="background" args={['#020617']} />
        
        <ambientLight intensity={0.3} color="#cbd5e1" />
        <directionalLight 
            position={[50, 80, 50]} 
            intensity={1.0} 
            castShadow 
            shadow-mapSize={[2048, 2048]}
            color="#fff7ed"
        />
        <pointLight position={[-40, 40, -40]} intensity={0.6} color="#38bdf8" distance={100} />
        <pointLight position={[40, 20, 40]} intensity={0.5} color="#f97316" distance={80} />

        <Suspense fallback={null}>
            <Stars radius={200} depth={50} count={6000} factor={4} saturation={0} fade speed={0.1} />
            
            <group position={[0, -5, 0]}>
                <gridHelper args={[200, 200, 0x1e293b, 0x0f172a]} position={[0, -0.1, 0]} />
                
                <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.2, 0]}>
                    <planeGeometry args={[400, 400]} />
                    <meshStandardMaterial color="#020617" roughness={0.9} />
                </mesh>

                {!loading && !error && puzzleRegions.map((region) => (
                    <PuzzlePiece 
                        key={region.id} 
                        region={region} 
                        gridCenterOffset={{ x: gridDim.w / 2, y: gridDim.h / 2 }} 
                        setControlsEnabled={setControlsEnabled}
                    />
                ))}
            </group>
        </Suspense>

        <OrbitControls 
            enabled={controlsEnabled}
            minPolarAngle={Math.PI / 6} 
            maxPolarAngle={Math.PI / 2.1} 
            maxDistance={250} 
            minDistance={20}
            enablePan={true}
            panSpeed={0.5}
            rotateSpeed={0.5}
            dampingFactor={0.05}
        />
      </Canvas>
    </div>
  );
};