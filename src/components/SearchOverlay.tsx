import { useState, useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Search, X, Music, User, Disc } from 'lucide-react';
import { Song } from '../types';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../stores/playerStore';
import { useLibraryStore } from '../stores/libraryStore';
import { useSettingsStore } from '../stores/settingsStore';

interface SearchResultGroup {
  type_name: string;
  items: Song[];
}

export function SearchOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  
  const playSong = usePlayerStore(s => s.playSong);
  const setFilter = useLibraryStore(s => s.setFilter);
  const globalSongs = useLibraryStore(s => s.songs);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const debounceTimeout = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setIsLoading(true);
      try {
        const res: SearchResultGroup[] = await invoke('search_library', { query });
        setResults(res);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(debounceTimeout);
  }, [query]);

  const isCommandMode = query.startsWith('/');
  const commandQuery = isCommandMode ? query.slice(1).toLowerCase() : '';

  const availableCommands = useMemo(() => [
    {
      id: 'cmd_shuffle_all',
      icon: <Music className="w-5 h-5" />,
      title: 'Shuffle All',
      desc: 'Play your entire library in random order',
      action: () => {
        const songs = useLibraryStore.getState().songs;
        if (songs.length > 0) {
          const shuffled = [...songs].sort(() => Math.random() - 0.5);
          usePlayerStore.getState().playSong(shuffled[0], shuffled);
        }
      }
    },
    {
      id: 'cmd_go_favorites',
      icon: <User className="w-5 h-5" />, // placeholder, usually Heart
      title: 'Go to Favorites',
      desc: 'Navigate to your favorite tracks',
      action: () => navigate('/favorites')
    },
    {
      id: 'cmd_settings',
      icon: <Disc className="w-5 h-5" />, // placeholder, usually Settings
      title: 'Open Settings',
      desc: 'Configure Nebula',
      action: () => useSettingsStore.getState().setIsSettingsOpen(true)
    },
    {
      id: 'cmd_on_repeat',
      icon: <Music className="w-5 h-5" />,
      title: 'Smart Playlist: On Repeat',
      desc: 'Listen to your most frequent recent tracks',
      action: () => navigate('/smart-playlist/on_repeat')
    }
  ], [navigate]);

  const filteredCommands = useMemo(() => {
    if (!isCommandMode) return [];
    return availableCommands.filter(c => 
      c.title.toLowerCase().includes(commandQuery) || 
      c.desc.toLowerCase().includes(commandQuery)
    );
  }, [isCommandMode, commandQuery, availableCommands]);

  const mappedResults = useMemo(() => {
    return results.map(group => {
      if (group.type_name === 'Songs') {
        return {
          ...group,
          items: group.items.map(item => globalSongs.find(s => s.id === item.id) || item)
        };
      }
      return group;
    });
  }, [results, globalSongs]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center pt-24 bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-space-800/80 border border-white/10 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
        
        {/* Search Header */}
        <div className="flex items-center px-6 py-4 border-b border-white/10">
          <Search className="text-gray-400 w-6 h-6 mr-4" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs, artists, albums... (Ctrl+K)"
            className="flex-1 bg-transparent text-white text-xl font-heading font-semibold outline-none placeholder:text-gray-500"
          />
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          {query.trim() && results.length === 0 && !isLoading && (
            <div className="py-12 text-center text-gray-400">
              <p className="text-xl font-heading mb-2">No transmissions found.</p>
              <p className="text-sm opacity-60">Try searching for something else.</p>
            </div>
          )}

          {mappedResults.map(group => (
            <div key={group.type_name} className="mb-6">
              <div className="px-4 py-2 flex items-center text-xs font-bold tracking-widest text-gray-400 uppercase">
                {group.type_name === 'Songs' && <Music className="w-4 h-4 mr-2" />}
                {group.type_name === 'Artists' && <User className="w-4 h-4 mr-2" />}
                {group.type_name === 'Albums' && <Disc className="w-4 h-4 mr-2" />}
                {group.type_name}
              </div>
              
              <div className="space-y-1">
                {group.items.map((item, idx) => (
                  <button
                    key={`${item.id}-${idx}`}
                    onClick={() => {
                      if (group.type_name === 'Songs') {
                        playSong(item);
                        setIsOpen(false);
                      } else if (group.type_name === 'Artists') {
                        setFilter('artist', item.artist);
                        setIsOpen(false);
                      } else if (group.type_name === 'Albums') {
                        setFilter('album', item.album);
                        setIsOpen(false);
                      }
                    }}
                    className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-4 hover:bg-white/10 transition-colors group"
                  >
                    {group.type_name === 'Songs' ? (
                      <>
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-medium truncate">{item.title}</div>
                          <div className="text-xs text-gray-400 truncate mt-0.5">{item.artist} &bull; {item.album}</div>
                        </div>
                      </>
                    ) : group.type_name === 'Artists' ? (
                      <div className="text-white font-medium truncate flex-1">{item.artist}</div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium truncate">{item.album}</div>
                        <div className="text-xs text-gray-400 truncate mt-0.5">{item.artist}</div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {isCommandMode && (
            <div className="mb-6">
              <div className="px-4 py-2 flex items-center text-xs font-bold tracking-widest text-gray-400 uppercase">
                Commands
              </div>
              <div className="space-y-1">
                {filteredCommands.length === 0 ? (
                  <div className="py-8 text-center text-gray-500 text-sm">No matching commands.</div>
                ) : (
                  filteredCommands.map(cmd => (
                    <button
                      key={cmd.id}
                      onClick={() => {
                        cmd.action();
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-4 hover:bg-white/10 transition-colors group"
                    >
                      <div className="text-gray-400 group-hover:text-nebula-cyan transition-colors">
                        {cmd.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium truncate">{cmd.title}</div>
                        <div className="text-xs text-gray-400 truncate mt-0.5">{cmd.desc}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-black/20 flex items-center justify-between text-xs text-gray-500">
          <div><kbd className="px-2 py-1 bg-white/10 rounded-md font-mono text-gray-300 mx-1">ESC</kbd> to close</div>
        </div>
      </div>
    </div>
  );
}
