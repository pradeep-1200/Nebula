import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Library, Heart, Clock, PlayCircle, Plus, Trash2, ListMusic, Settings, Repeat, HeartCrack, Zap } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Playlist } from '../types';

interface SidebarProps {
  onOpenSettings?: () => void;
}

export function Sidebar({ onOpenSettings }: SidebarProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  
  const location = useLocation();
  const navigate = useNavigate();

  const fetchPlaylists = async () => {
    try {
      const res: Playlist[] = await invoke('get_playlists');
      setPlaylists(res);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPlaylists();
    
    // Simple event listener for when playlists are updated elsewhere
    const handlePlaylistUpdate = () => fetchPlaylists();
    window.addEventListener('playlists-updated', handlePlaylistUpdate);
    return () => window.removeEventListener('playlists-updated', handlePlaylistUpdate);
  }, []);

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    try {
      await invoke('create_playlist', { name: newPlaylistName.trim() });
      setNewPlaylistName('');
      setIsCreating(false);
      fetchPlaylists();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeletePlaylist = async (id: number, name: string) => {
    if (confirm(`Delete playlist "${name}"?`)) {
      try {
        await invoke('delete_playlist', { playlistId: id });
        
        // Redirect if currently viewing the deleted playlist
        if (location.pathname === `/playlist/${id}`) {
          navigate('/');
        }
        
        fetchPlaylists();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-2 rounded-xl transition-all font-medium text-sm group ${
      isActive 
        ? 'bg-nebula-cyan/20 text-nebula-cyan shadow-sm border border-nebula-cyan/30' 
        : 'text-gray-400 hover:bg-white/10 hover:text-white border border-transparent'
    }`;

  return (
    <div className="w-64 flex-shrink-0 border-r border-white/10 bg-space-900/60 backdrop-blur-xl h-full flex flex-col relative z-20">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-nebula-cyan to-nebula-purple shadow-lg shadow-nebula-cyan/20 flex items-center justify-center">
            <span className="text-white font-heading font-bold text-sm tracking-widest">N</span>
          </div>
          <span className="font-heading font-extrabold tracking-widest text-xl text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">NEBULA</span>
        </div>
        
        <div className="space-y-1">
          <NavLink to="/" className={linkClass} end>
            <Library className="w-5 h-5" />
            All Songs
          </NavLink>
          <NavLink to="/favorites" className={linkClass}>
            <Heart className="w-5 h-5" />
            Favorites
          </NavLink>
          <NavLink to="/recent" className={linkClass}>
            <Clock className="w-5 h-5" />
            Recently Played
          </NavLink>
          <NavLink to="/most-played" className={linkClass}>
            <PlayCircle className="w-5 h-5" />
            Most Played
          </NavLink>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto px-6 py-2 custom-scrollbar">
        <div className="flex items-center justify-between text-xs font-bold font-heading tracking-widest text-gray-500 uppercase mb-4 mt-2">
          <span>Smart Playlists</span>
        </div>
        <div className="space-y-1 mb-8">
          <NavLink to="/smart-playlist/on_repeat" className={linkClass}>
            <Repeat className="w-4 h-4" />
            <span className="truncate text-sm">On Repeat</span>
          </NavLink>
          <NavLink to="/smart-playlist/forgotten_favorites" className={linkClass}>
            <HeartCrack className="w-4 h-4" />
            <span className="truncate text-sm">Forgotten Favorites</span>
          </NavLink>
          <NavLink to="/smart-playlist/short_sweet" className={linkClass}>
            <Zap className="w-4 h-4" />
            <span className="truncate text-sm">Short & Sweet</span>
          </NavLink>
        </div>

        <div className="flex items-center justify-between text-xs font-bold font-heading tracking-widest text-gray-500 uppercase mb-4">
          <span>Playlists</span>
          <button 
            onClick={() => setIsCreating(true)}
            className="hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        
        {isCreating && (
          <form onSubmit={handleCreatePlaylist} className="mb-4">
            <input
              autoFocus
              type="text"
              value={newPlaylistName}
              onChange={e => setNewPlaylistName(e.target.value)}
              onBlur={() => { if(!newPlaylistName) setIsCreating(false); }}
              placeholder="Playlist name..."
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-nebula-cyan/50 focus:bg-black/60 transition-colors"
            />
          </form>
        )}
        
        <div className="space-y-1">
          {playlists.map(pl => (
            <div key={pl.id} className="relative group flex items-center">
              <NavLink 
                to={`/playlist/${pl.id}`} 
                className={({ isActive }) => `flex-1 flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm font-medium ${isActive ? 'bg-white/15 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                <ListMusic className="w-4 h-4 opacity-70" />
                <span className="truncate">{pl.name}</span>
              </NavLink>
              <button
                onClick={() => handleDeletePlaylist(pl.id, pl.name)}
                className="absolute right-2 p-1.5 rounded-md text-red-400/0 group-hover:text-red-400/80 hover:bg-red-400/20 hover:text-red-400 transition-all"
                title="Delete Playlist"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {playlists.length === 0 && !isCreating && (
            <div className="text-sm text-gray-500 italic px-3 py-2">No playlists yet</div>
          )}
        </div>
      </div>
      <div className="mt-auto p-6 pt-2 border-t border-white/5">
        <button 
          onClick={onOpenSettings}
          className="flex items-center gap-3 w-full px-4 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
        >
          <Settings className="w-5 h-5" />
          Settings
        </button>
      </div>
    </div>
  );
}
