import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Heart, Sliders } from 'lucide-react';
import { usePlayerStore } from '../stores/playerStore';
import { formatDuration } from '../utils/formatters';
import { useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { appLocalDataDir } from '@tauri-apps/api/path';
import { Equalizer } from './Equalizer';
import { Visualizer } from './Visualizer';

import { useLibraryStore } from '../stores/libraryStore';

export function PlayerBar() {
  const { currentSong, isPlaying, position, duration, volume, error, accentColor, isFullScreen, setFullScreen, togglePlayPause, seek, setVolume, playNext, playPrevious } = usePlayerStore();
  const toggleFavoriteAction = useLibraryStore(s => s.toggleFavorite);
  const [dataDir, setDataDir] = useState<string>('');
  const [showEq, setShowEq] = useState(false);

  useEffect(() => {
    appLocalDataDir().then(dir => setDataDir(dir)).catch(console.error);
  }, []);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(Number(e.target.value));
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value));
  };

  const toggleMute = () => {
    setVolume(volume > 0 ? 0 : 1);
  };

  if (!currentSong) return null;

  const artUrl = currentSong.art_hash && dataDir 
    ? convertFileSrc(`${dataDir}/artwork/${currentSong.art_hash}.jpg`)
    : null;

  return (
    <div 
      className="h-24 border-t flex items-center justify-between px-6 text-gray-200 shadow-2xl relative z-20 bg-space-800/80 backdrop-blur-xl transition-colors duration-500 ease-out" 
      style={{ 
        borderTopColor: accentColor ? `${accentColor}40` : 'rgba(255,255,255,0.05)',
        boxShadow: accentColor ? `0 -10px 40px -15px ${accentColor}30` : 'none'
      }}
    >
      {!isFullScreen && (
        <div className="absolute inset-0 z-0 opacity-40 pointer-events-none mix-blend-screen overflow-hidden">
          <Visualizer color={accentColor || '#00F0FF'} />
        </div>
      )}
      
      {/* Now Playing Info */}
      <div className="flex items-center w-1/4 min-w-0 z-10 group/nowplaying cursor-pointer" onClick={() => setFullScreen(true)}>
        <div 
          className="w-14 h-14 rounded flex-shrink-0 flex items-center justify-center text-white shadow-md border border-white/10 transition-colors duration-500 overflow-hidden relative group-hover/nowplaying:brightness-110" 
          style={{ background: accentColor || '#171D3D' }}
        >
          {artUrl ? (
            <img src={artUrl} alt="Album Art" className="w-full h-full object-cover transition-transform duration-300 group-hover/nowplaying:scale-105" />
          ) : (
            <span className="text-xs font-heading font-bold tracking-widest opacity-80">ART</span>
          )}
        </div>
        <div className="ml-4 truncate flex-1 min-w-0">
          <div className="font-heading font-semibold text-white truncate text-base group-hover/nowplaying:underline transition-all drop-shadow-sm">{currentSong.title}</div>
          <div className="text-xs text-gray-400 truncate mt-0.5 group-hover/nowplaying:text-gray-300 transition-all">{currentSong.artist}</div>
          {error && <div className="text-xs text-red-400 truncate mt-0.5 font-medium animate-pulse" title={error}>⚠️ {error}</div>}
        </div>
        
        <button 
          onClick={async (e) => {
            e.stopPropagation();
            if (currentSong) await toggleFavoriteAction(currentSong.id);
          }}
          className={`ml-4 p-2 rounded-full transition-colors flex-shrink-0 ${currentSong.is_favorite ? 'text-nebula-cyan hover:text-nebula-cyan/80' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <Heart className={`w-5 h-5 ${currentSong.is_favorite ? 'fill-current' : ''}`} />
        </button>
      </div>

      {/* Controls & Scrubber */}
      <div className="flex flex-col items-center justify-center w-2/4 max-w-2xl px-4 z-10">
        <div className="flex items-center gap-6 mb-2">
          <button onClick={playPrevious} className="text-gray-400 hover:text-white hover:scale-110 active:scale-95 transition-all" title="Previous">
            <SkipBack size={20} className="fill-current" />
          </button>
          
          <button 
            onClick={togglePlayPause}
            className="w-10 h-10 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 active:scale-95 transition-all shadow-lg drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]"
          >
            {isPlaying ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current ml-1" />}
          </button>
          
          <button onClick={playNext} className="text-gray-400 hover:text-white hover:scale-110 active:scale-95 transition-all" title="Next">
            <SkipForward size={20} className="fill-current" />
          </button>
        </div>
        
        <div className="flex items-center w-full gap-3 text-xs text-gray-400 font-medium">
          <span className="w-10 text-right tabular-nums opacity-70">{formatDuration(position)}</span>
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={position}
            onChange={handleSeek}
            className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer hover:bg-white/20 transition-all"
            style={{ accentColor: accentColor || '#fff' }}
          />
          <span className="w-10 tabular-nums opacity-70">{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Volume & Extra */}
      <div className="flex items-center justify-end w-1/4 gap-3 z-10">
        <button onClick={toggleMute} className="text-gray-400 hover:text-white transition-all hover:scale-110 active:scale-95">
          {volume <= 0.01 ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={handleVolume}
          className="w-24 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer hover:bg-white/20 transition-all"
          style={{ accentColor: accentColor || '#fff' }}
        />
        
        <button onClick={() => setShowEq(!showEq)} className={`p-2 rounded-full transition-colors ${showEq ? 'bg-white/10 text-nebula-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
          <Sliders size={18} />
        </button>
      </div>
      
      {showEq && <Equalizer onClose={() => setShowEq(false)} />}
    </div>
  );
}
