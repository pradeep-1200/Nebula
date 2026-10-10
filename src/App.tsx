import { Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { Library } from "./pages/Library";
import { PlayerBar } from "./components/PlayerBar";
import { Starfield } from "./components/Starfield";
import { SearchOverlay } from "./components/SearchOverlay";
import { Sidebar } from "./components/Sidebar";
import { FullScreenPlayer } from "./components/FullScreenPlayer";
import { initPlayerStoreListeners } from "./stores/playerStore";
import { SettingsOverlay } from "./components/SettingsOverlay";
import { useState } from "react";

import { usePlayerStore } from "./stores/playerStore";
import { useSettingsStore } from "./stores/settingsStore";

function App() {
  const isSettingsOpen = useSettingsStore(s => s.isSettingsOpen);
  const setIsSettingsOpen = useSettingsStore(s => s.setIsSettingsOpen);
  
  const togglePlayPause = usePlayerStore(s => s.togglePlayPause);
  const playNext = usePlayerStore(s => s.playNext);
  const playPrevious = usePlayerStore(s => s.playPrevious);
  const volume = usePlayerStore(s => s.volume);
  const setVolume = usePlayerStore(s => s.setVolume);

  const accentColor = usePlayerStore(s => s.accentColor);

  useEffect(() => {
    initPlayerStoreListeners();
  }, []);

  useEffect(() => {
    if (accentColor) {
      document.documentElement.style.setProperty('--accent-color', accentColor);
    } else {
      document.documentElement.style.setProperty('--accent-color', '#00F0FF'); // default
    }
  }, [accentColor]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      if (
        document.activeElement?.tagName === 'INPUT' || 
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ': // Space
          e.preventDefault();
          togglePlayPause();
          break;
        case 'm':
          e.preventDefault();
          setVolume(volume > 0 ? 0 : 1);
          break;
        case 'arrowright':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            playNext();
          }
          break;
        case 'arrowleft':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            playPrevious();
          }
          break;
        case 'arrowup':
          e.preventDefault();
          setVolume(Math.min(1, volume + 0.05));
          break;
        case 'arrowdown':
          e.preventDefault();
          setVolume(Math.max(0, volume - 0.05));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause, playNext, playPrevious, volume, setVolume]);

  return (
    <div className="flex flex-col h-screen overflow-hidden font-sans text-white relative">
      <Starfield />
      <SearchOverlay />
      
      <div className="flex-1 flex overflow-hidden relative z-10">
        <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />
        
        <div className="flex-1 overflow-hidden relative bg-black/20">
          <Routes>
            <Route path="/" element={<Library view="all" />} />
            <Route path="/favorites" element={<Library view="favorites" />} />
            <Route path="/recent" element={<Library view="recent" />} />
            <Route path="/most-played" element={<Library view="most-played" />} />
            <Route path="/playlist/:id" element={<Library view="playlist" />} />
            <Route path="/smart-playlist/:type" element={<Library view="smart-playlist" />} />
          </Routes>
        </div>
      </div>
      
      <PlayerBar />
      <FullScreenPlayer />
      
      {isSettingsOpen && (
        <SettingsOverlay onClose={() => setIsSettingsOpen(false)} />
      )}
    </div>
  );
}

export default App;
