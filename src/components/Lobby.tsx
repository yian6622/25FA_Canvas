import React, { useEffect } from 'react';
import { useStore } from '../store';
import { MapConfig, Difficulty } from '../types';
import { Globe, Users, Play, Activity, Cpu } from 'lucide-react';

const MAPS: MapConfig[] = [
  {
    id: 'mercury_beethoven',
    title: 'Mercury: Beethoven Quadrangle',
    description: 'An equatorial region of Mercury featuring ancient cratered terrain and smooth plains. Key features include the Beethoven Basin.',
    areaUrl: 'https://raw.githubusercontent.com/yian6622/25FA_Canvas/main/Area_Beethoven%20Quadrangle%20of%20Mercury.png',
    depthUrl: 'https://raw.githubusercontent.com/yian6622/25FA_Canvas/main/Depth_Beethoven%20Quadrangle%20of%20Mercury.png',
    colorPalette: ['#A09B93', '#7D776E', '#5C5852'],
    thumbnail: 'https://raw.githubusercontent.com/yian6622/25FA_Canvas/main/Mercury_tn.png'
  },
  {
    id: 'venus_metis',
    title: 'Venus: Metis Mons',
    description: 'A region dominated by volcanic activity. Metis Mons is a large shield volcano located in the Eistla Regio highland.',
    areaUrl: 'https://raw.githubusercontent.com/yian6622/25FA_Canvas/main/Area_Metis%20Mons%20Quadrangle%20(V%E2%80%936).png',
    depthUrl: 'https://raw.githubusercontent.com/yian6622/25FA_Canvas/main/Depth_Metis%20Mons%20Quadrangle%20(V%E2%80%936).png',
    colorPalette: ['#E6B88A', '#B38F6B', '#80664D'],
    thumbnail: 'https://raw.githubusercontent.com/yian6622/25FA_Canvas/main/Venus_tn.png'
  },
];

export const Lobby: React.FC = () => {
  const { 
    selectedMapId, 
    selectMap, 
    selectedDifficulty, 
    setDifficulty,
    sessions,
    joinSession,
    isConnecting,
    initSocket // New action
  } = useStore();

  useEffect(() => {
    initSocket();
  }, [initSocket]);

  const getSessionInfo = (mapId: string, diff: Difficulty) => {
    return sessions.find(s => s.mapId === mapId && s.difficulty === diff);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-orange-500 overflow-y-auto pb-20">
      {/* Cinematic Header */}
      <header className="sticky top-0 z-20 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-8 py-6 flex justify-between items-end">
          <div className="flex items-end gap-4">
             <Cpu size={32} className="text-orange-500 mb-1" />
             <div>
                <h1 className="text-4xl font-black tracking-tighter text-white font-display">
                  VOXEL<span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-600">PLANET</span>
                </h1>
                <p className="text-xs text-orange-400 font-mono tracking-[0.3em] uppercase opacity-80">Topographical Reconstruction Interface</p>
             </div>
          </div>

          <div className="flex items-center gap-6 font-mono text-xs">
            <div className="flex items-center gap-2 text-emerald-400">
               <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
               </span>
               NETLINK: STABLE
            </div>
            <div className="px-4 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
               {(sessions.reduce((acc, s) => acc + s.activePlayers, 0))} ACTIVE SIGNALS
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-8 py-16">
        <div className="mb-12 border-l-4 border-orange-500 pl-6">
          <h2 className="text-5xl font-bold text-white mb-4 font-display tracking-tight">TARGET SELECT</h2>
          <p className="text-slate-400 max-w-xl text-lg font-light leading-relaxed">
            Select a celestial body quadrangle for high-fidelity topographical reconstruction. 
            Ensure you select the appropriate complexity tier for your terminal.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {MAPS.map((map) => {
            const isSelected = selectedMapId === map.id;
            const activeSession = getSessionInfo(map.id, selectedDifficulty);

            return (
              <div 
                key={map.id}
                onClick={() => selectMap(map.id)}
                className={`
                  group relative rounded-[2.5rem] overflow-hidden cursor-pointer transition-all duration-500
                  ${isSelected 
                    ? 'ring-4 ring-orange-500/50 scale-[1.01] shadow-[0_0_50px_-10px_rgba(249,115,22,0.3)]' 
                    : 'hover:scale-[1.01] opacity-70 hover:opacity-100 grayscale hover:grayscale-0'}
                `}
              >
                {/* Background Image Area */}
                <div className="absolute inset-0 bg-slate-900">
                  <img 
                    src={map.areaUrl} // Using Area as preview
                    alt={map.title}
                    className="w-full h-full object-cover transition-transform duration-[2s] group-hover:scale-110 opacity-60"
                  />
                  {/* Dramatic Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
                </div>

                {/* Content Overlay */}
                <div className="relative h-full flex flex-col justify-end p-8 z-10 min-h-[500px]">
                   <div className="mb-auto pt-4 flex justify-between items-start">
                      <div className="bg-black/50 backdrop-blur px-4 py-2 rounded-full border border-white/10 font-mono text-xs tracking-widest text-orange-300">
                         {map.id.toUpperCase().split('_').join(' // ')}
                      </div>
                   </div>

                   <h3 className={`text-4xl font-bold mb-4 font-display tracking-tighter ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                      {map.title}
                   </h3>
                   <p className="text-slate-300 mb-8 max-w-md leading-relaxed font-light">
                      {map.description}
                   </p>

                   {/* Controls Section */}
                   <div className={`space-y-6 transition-all duration-500 transform ${isSelected ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
                      
                      {/* Stylized Difficulty Selector */}
                      <div className="bg-black/40 backdrop-blur-md p-2 rounded-[1.5rem] border border-white/10 flex gap-2" onClick={e => e.stopPropagation()}>
                         {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
                            <button
                              key={d}
                              onClick={() => setDifficulty(d)}
                              className={`
                                flex-1 py-3 rounded-[1rem] text-sm font-bold uppercase tracking-wider transition-all
                                ${selectedDifficulty === d 
                                  ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20' 
                                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}
                              `}
                            >
                              {d}
                            </button>
                         ))}
                      </div>

                      {/* Join Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          joinSession(map.id, selectedDifficulty);
                        }}
                        disabled={isConnecting}
                        className={`
                          w-full py-5 rounded-[1.5rem] flex items-center justify-center gap-3 font-bold text-lg tracking-widest transition-all
                          ${isSelected
                            ? 'bg-white text-black hover:bg-slate-200 shadow-[0_0_30px_rgba(255,255,255,0.2)]'
                            : 'bg-slate-800 text-slate-600'}
                        `}
                      >
                         {isConnecting ? (
                            <Activity className="animate-spin" /> 
                         ) : (
                            <Play fill="currentColor" />
                         )}
                         {activeSession ? 'SYNC TO SESSION' : 'INITIATE SEQUENCE'}
                      </button>
                   </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};