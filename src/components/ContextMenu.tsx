import React, { useEffect, useRef, useState } from 'react';
import { Playlist, Song } from '../types';
import { Play, Plus } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface ContextMenuProps {
  x: number;
  y: number;
  song: Song;
  playlists: Playlist[];
  onClose: () => void;
  onPlay: (song: Song) => void;
}

export function ContextMenu({ x, y, song, playlists, onClose, onPlay }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    // Slight delay to prevent immediate close on the same click
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 10);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  const handleAddToPlaylist = async (playlistId: number) => {
    try {
      await invoke('add_to_playlist', { playlistId, songId: song.id });
      // Notify sidebar to refresh if needed, but not strictly required
      window.dispatchEvent(new Event('playlists-updated'));
      onClose();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) {
      setIsCreating(false);
      return;
    }
    try {
      await invoke('create_playlist', { name: newPlaylistName.trim() });
      const updatedPlaylists: Playlist[] = await invoke('get_playlists');
      const newPl = updatedPlaylists.find(p => p.name === newPlaylistName.trim());
      if (newPl) {
        await invoke('add_to_playlist', { playlistId: newPl.id, songId: song.id });
        window.dispatchEvent(new Event('playlists-updated'));
      }
      onClose();
    } catch (e) {
      console.error(e);
    }
  };

  // Keep menu on screen
  const menuStyle: React.CSSProperties = {
    top: Math.min(y, window.innerHeight - 200),
    left: Math.min(x, window.innerWidth - 200)
  };

  return (
    <div 
      ref={menuRef}
      className="fixed z-[100] w-48 bg-space-800/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl py-2 flex flex-col text-sm text-gray-200 animate-in zoom-in-95 duration-100"
      style={menuStyle}
    >
      <div className="px-3 py-2 border-b border-white/5 mb-1 truncate text-xs font-heading font-semibold text-gray-400">
        {song.title}
      </div>
      
      <button 
        onClick={() => { onPlay(song); onClose(); }}
        className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 hover:text-white transition-colors text-left"
      >
        <Play className="w-4 h-4" />
        Play Now
      </button>
      
      <div className="relative group">
        <button className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-white/10 hover:text-white transition-colors text-left">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add to Playlist...
          </div>
          <span className="text-xs opacity-50">▶</span>
        </button>
        
        {/* Submenu */}
        <div className="absolute left-full top-0 hidden group-hover:block w-48 bg-space-800/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl py-2 ml-1">
          {playlists.length === 0 ? (
            <div className="px-3 py-1.5 text-gray-500 italic">No playlists</div>
          ) : (
            playlists.map(pl => (
              <button 
                key={pl.id}
                onClick={() => handleAddToPlaylist(pl.id)}
                className="w-full text-left px-3 py-1.5 hover:bg-white/10 hover:text-white transition-colors truncate"
              >
                {pl.name}
              </button>
            ))
          )}
          
          <div className="h-px bg-white/10 my-1"></div>
          
          {isCreating ? (
            <form onSubmit={handleCreateAndAdd} className="px-2 pb-1">
              <input
                autoFocus
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onBlur={() => { if(!newPlaylistName) setIsCreating(false); }}
                placeholder="Name..."
                className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-nebula-cyan/50"
              />
            </form>
          ) : (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setIsCreating(true);
              }}
              className="w-full flex items-center gap-2 text-left px-3 py-1.5 hover:bg-white/10 hover:text-nebula-cyan transition-colors text-nebula-cyan/80"
            >
              <Plus className="w-3 h-3" />
              New Playlist...
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
