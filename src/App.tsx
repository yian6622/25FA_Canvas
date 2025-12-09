import React from 'react';
import { useStore } from './store';
import { Lobby } from './components/Lobby';
import { GameView } from './components/GameView';

function App() {
  const currentView = useStore((state) => state.currentView);

  return (
    <>
      {currentView === 'lobby' && <Lobby />}
      {currentView === 'game' && <GameView />}
    </>
  );
}

export default App;
