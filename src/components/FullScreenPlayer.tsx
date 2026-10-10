import React, { useEffect, useRef, useState, useMemo } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { formatDuration } from '../utils/formatters';
import { Play, Pause, SkipBack, SkipForward, ChevronDown, Download, AlertCircle } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { appLocalDataDir } from '@tauri-apps/api/path';
import { Visualizer } from './Visualizer';

export function FullScreenPlayer() {
  const { currentSong, isPlaying, position, duration, accentColor, currentLyrics, isFullScreen, isFetchingLyrics, togglePlayPause, seek, playNext, playPrevious, setFullScreen, fetchLyricsOnline } = usePlayerStore();
  const [dataDir, setDataDir] = useState<string>('');
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  // Ref for the lyrics container
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  
  // State to track if user is manually scrolling
  const [isManualScrolling, setIsManualScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    appLocalDataDir().then(dir => setDataDir(dir)).catch(console.error);
  }, []);

  // Determine active lyric index
  const activeLyricIndex = useMemo(() => {
    if (!currentLyrics) return -1;
    let idx = -1;
    for (let i = 0; i < currentLyrics.length; i++) {
      if (currentLyrics[i].time <= position + 0.3) { // Slight 300ms offset for snappier feel
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [currentLyrics, position]);

  // Handle auto-scroll
  useEffect(() => {
    if (isManualScrolling || activeLyricIndex === -1 || !lyricsContainerRef.current) return;
    
    const container = lyricsContainerRef.current;
    const activeEl = container.children[activeLyricIndex] as HTMLElement;
    
    if (activeEl) {
      // Calculate scroll position to center the active lyric
      const containerHeight = container.clientHeight;
      const scrollPos = activeEl.offsetTop - containerHeight / 2 + activeEl.clientHeight / 2;
      
      container.scrollTo({
        top: scrollPos,
        behavior: 'smooth'
      });
    }
  }, [activeLyricIndex, isManualScrolling]);

  const handleScroll = () => {
    setIsManualScrolling(true);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    
    // Resume auto-scroll after 3 seconds of no scrolling
    scrollTimeoutRef.current = setTimeout(() => {
      setIsManualScrolling(false);
    }, 3000);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(Number(e.target.value));
  };

  if (!isFullScreen || !currentSong) return null;

  const artUrl = currentSong.art_hash && dataDir 
    ? convertFileSrc(`${dataDir}/artwork/${currentSong.art_hash}.jpg`)
    : null;

  return (
    <div className="fixed inset-0 z-40 flex bg-space-900 text-white overflow-hidden animate-in fade-in zoom-in-95 duration-300">
      
      {/* Blurred background and Visualizer layer */}
      <div 
        className="absolute inset-0 z-0 transition-colors duration-1000 ease-out opacity-40 blur-3xl"
        style={{ 
          background: accentColor ? `radial-gradient(circle at 30% 50%, ${accentColor}80 0%, transparent 60%)` : '#171D3D' 
        }}
      />
      <div className="absolute inset-0 z-0 opacity-30 mix-blend-screen pointer-events-none">
        <Visualizer color={accentColor || '#00F0FF'} />
      </div>
      
      {/* Top Bar (Close button) */}
      <div className="absolute top-0 left-0 w-full p-6 z-20 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent">
        <button 
          onClick={() => setFullScreen(false)}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-black/40 hover:bg-white/20 transition-all text-white hover:scale-110 active:scale-95 border border-white/10"
        >
          <ChevronDown size={24} />
        </button>
      </div>

      <div className="relative z-10 flex w-full h-full p-12 pt-24">
        
        {/* Left Column: Art and Controls */}
        <div className="w-1/2 flex flex-col items-center justify-center px-10">
          <div 
            className="w-96 h-96 rounded-2xl shadow-2xl flex items-center justify-center overflow-hidden mb-12 border border-white/10 transition-all duration-700 ease-out"
            style={{ 
              background: accentColor || '#171D3D',
              boxShadow: accentColor ? `0 25px 65px -20px ${accentColor}80` : '0 25px 65px -20px rgba(0,0,0,0.5)'
            }}
          >
            {artUrl ? (
              <img src={artUrl} alt="Album Art" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl font-heading font-bold opacity-50 tracking-widest">ART</span>
            )}
          </div>
          
          <div className="w-full max-w-lg text-center mb-10">
            <h2 className="text-3xl font-heading font-bold truncate mb-2">{currentSong.title}</h2>
            <p className="text-xl text-gray-300 truncate">{currentSong.artist}</p>
            <p className="text-sm text-gray-500 truncate mt-1">{currentSong.album}</p>
          </div>
          
          <div className="w-full max-w-lg flex items-center gap-4 text-sm text-gray-400 font-medium mb-8">
            <span className="w-12 text-right tabular-nums">{formatDuration(position)}</span>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={position}
              onChange={handleSeek}
              className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer hover:bg-white/30 transition-all"
              style={{ accentColor: accentColor || '#fff' }}
            />
            <span className="w-12 tabular-nums">{formatDuration(duration)}</span>
          </div>
          
          <div className="flex items-center gap-8">
            <button onClick={playPrevious} className="text-gray-300 hover:text-white hover:scale-110 active:scale-95 transition-all">
              <SkipBack size={32} className="fill-current" />
            </button>
            <button 
              onClick={togglePlayPause}
              className="w-20 h-20 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 active:scale-95 transition-all shadow-xl"
            >
              {isPlaying ? <Pause size={36} className="fill-current" /> : <Play size={36} className="fill-current ml-2" />}
            </button>
            <button onClick={playNext} className="text-gray-300 hover:text-white hover:scale-110 active:scale-95 transition-all">
              <SkipForward size={32} className="fill-current" />
            </button>
          </div>
        </div>

        {/* Right Column: Lyrics */}
        <div className="w-1/2 flex flex-col justify-center h-full relative">
          {!currentLyrics ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <p className="text-2xl font-heading font-semibold text-gray-500 italic">No lyrics available</p>
              
              <button 
                onClick={async () => {
                  setFetchError(null);
                  try {
                    await fetchLyricsOnline(currentSong);
                  } catch (e: any) {
                    setFetchError(typeof e === 'string' ? e : "Check your connection");
                  }
                }}
                disabled={isFetchingLyrics}
                className="flex items-center gap-2 px-4 py-2 mt-2 bg-white/10 hover:bg-white/20 rounded-full text-white/80 transition-colors disabled:opacity-50"
              >
                {isFetchingLyrics ? (
                  <span className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                ) : (
                  <Download size={18} />
                )}
                <span>{isFetchingLyrics ? 'Searching...' : 'Fetch Lyrics Online'}</span>
              </button>
              
              {fetchError && (
                <div className="flex items-center gap-2 text-red-400 text-sm mt-2 bg-red-500/10 px-4 py-2 rounded-lg">
                  <AlertCircle size={16} />
                  <span>{fetchError}</span>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Fade masks for smooth scroll clipping */}
              <div className="absolute top-0 w-full h-32 bg-gradient-to-b from-space-900 to-transparent z-10 pointer-events-none" />
              <div className="absolute bottom-0 w-full h-32 bg-gradient-to-t from-space-900 to-transparent z-10 pointer-events-none" />
              
              <div 
                ref={lyricsContainerRef}
                onWheel={handleScroll}
                onTouchMove={handleScroll}
                className="h-full overflow-y-auto px-12 py-64 custom-scrollbar text-center flex flex-col gap-6 scroll-smooth"
              >
                {currentLyrics.map((line, idx) => {
                  const isActive = idx === activeLyricIndex;
                  return (
                    <div 
                      key={idx} 
                      onClick={() => seek(line.time)}
                      className={`text-2xl font-heading transition-all duration-300 cursor-pointer ${
                        isActive 
                          ? 'text-white font-bold scale-110 opacity-100 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]' 
                          : 'text-gray-400 opacity-50 hover:text-gray-200 hover:opacity-80 scale-100'
                      }`}
                    >
                      {line.text}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        
      </div>
    </div>
  );
}
