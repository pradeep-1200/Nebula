import { useEffect, useRef, memo, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useLibraryStore } from "../stores/libraryStore";
import { usePlayerStore } from "../stores/playerStore";
import { formatDuration } from "../utils/formatters";
import { Song, Playlist } from "../types";
import { Plus, FolderPlus, MoreHorizontal, Play, ListPlus, Trash2, Heart, Search, Settings } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import { ContextMenu } from "../components/ContextMenu";

console.time('cold-start');

const SongRow = memo(({ 
  song, 
  isCurrent, 
  virtualRow, 
  playSong,
  queue,
  onToggleFavorite,
  onContextMenu,
  isDraggable,
  onDragStart,
  onDragOver,
  onDrop,
  index
}: { 
  song: Song, 
  isCurrent: boolean, 
  virtualRow: any, 
  playSong: (s: Song, queue: Song[]) => void,
  queue: Song[],
  onToggleFavorite: (id: number) => void,
  onContextMenu: (e: React.MouseEvent, song: Song) => void,
  isDraggable?: boolean,
  onDragStart?: (e: React.DragEvent, id: number) => void,
  onDragOver?: (e: React.DragEvent) => void,
  onDrop?: (e: React.DragEvent, newIndex: number) => void,
  index: number
}) => {
  return (
    <div
      draggable={isDraggable}
      onDragStart={(e) => onDragStart?.(e, song.id)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop?.(e, index)}
      onClick={() => playSong(song, queue)}
      onContextMenu={(e) => onContextMenu(e, song)}
      className={`absolute top-0 left-0 w-full flex items-center px-6 py-2 rounded-xl transition-all duration-200 ease-out group cursor-pointer ${
        isCurrent 
          ? 'bg-white/10 hover:bg-white/15 text-white border border-white/20 shadow-lg backdrop-blur-sm scale-[1.01] z-10' 
          : 'hover:bg-white/5 text-gray-300 border border-transparent'
      }`}
      style={{
        height: `${virtualRow.size - 4}px`,
        transform: `translateY(${virtualRow.start + 2}px)`,
      }}
    >
      <div className="w-10 flex items-center justify-center gap-1 group/btn">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(song.id);
          }}
          className={`p-1 rounded-full transition-colors ${song.is_favorite ? 'text-nebula-cyan' : 'text-gray-500 opacity-0 group-hover:opacity-100 hover:text-gray-300'}`}
          title="Toggle Favorite"
        >
          <Heart className={`w-4 h-4 ${song.is_favorite ? 'fill-current' : ''}`} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu(e, song);
          }}
          className="p-1 rounded-full text-gray-500 opacity-0 group-hover:opacity-100 hover:text-white transition-colors"
          title="Add to Playlist..."
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className={`w-1/3 pr-4 truncate font-semibold font-heading transition-colors ${isCurrent ? 'text-nebula-cyan drop-shadow' : 'text-gray-100'}`}>
        {song.title}
      </div>
      <div className="w-1/4 pr-4 truncate text-sm opacity-80">{song.artist}</div>
      <div className="w-1/4 pr-4 truncate text-sm opacity-80">{song.album}</div>
      <div className="w-1/6 text-right text-sm opacity-70 font-variant-numeric">{formatDuration(song.duration_seconds)}</div>
    </div>
  );
});

export function Library({ view = 'all' }: { view?: 'all' | 'favorites' | 'recent' | 'most-played' | 'playlist' | 'smart-playlist' }) {
  const { id, type } = useParams();
  const playlistId = id ? parseInt(id) : null;
  
  const [localSongIds, setLocalSongIds] = useState<number[]>([]);
  const [scanStatus, setScanStatus] = useState<string>("");
  const [playlistMeta, setPlaylistMeta] = useState<Playlist | null>(null);
  const [allPlaylists, setAllPlaylists] = useState<Playlist[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, song: Song } | null>(null);
  
  const globalSongs = useLibraryStore(s => s.songs);
  const isLoading = useLibraryStore(s => s.isLoading);
  const fetchGlobalSongs = useLibraryStore(s => s.fetchSongs);
  const activeFilter = useLibraryStore(s => s.activeFilter);
  const clearFilter = useLibraryStore(s => s.clearFilter);
  
  const currentSongId = usePlayerStore(s => s.currentSong?.id);
  const playSong = usePlayerStore(s => s.playSong);
  
  const parentRef = useRef<HTMLDivElement>(null);

  const fetchViewSongs = async () => {
    try {
      if (view === 'all') {
        setLocalSongIds([]);
      } else if (view === 'favorites') {
        setLocalSongIds([]);
      } else if (view === 'recent') {
        const res: Song[] = await invoke('get_recently_played');
        setLocalSongIds(res.map(s => s.id));
      } else if (view === 'most-played') {
        const res: Song[] = await invoke('get_most_played');
        setLocalSongIds(res.map(s => s.id));
      } else if (view === 'playlist' && playlistId) {
        const res: Song[] = await invoke('get_playlist_songs', { playlistId });
        setLocalSongIds(res.map(s => s.id));
        const playlists: Playlist[] = await invoke('get_playlists');
        setAllPlaylists(playlists);
        const pl = playlists.find(p => p.id === playlistId);
        if (pl) setPlaylistMeta(pl);
      } else if (view === 'smart-playlist' && type) {
        const res: Song[] = await invoke('get_smart_playlist', { playlistType: type });
        setLocalSongIds(res.map(s => s.id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (globalSongs.length === 0) {
      fetchGlobalSongs().then(() => {
        console.timeEnd('cold-start');
      });
    }
  }, []);

  useEffect(() => {
    fetchViewSongs();
    
    // Always keep allPlaylists in sync for the context menu
    invoke('get_playlists').then((res: unknown) => setAllPlaylists(res as Playlist[])).catch(console.error);
    
    const handlePlaylistUpdate = () => {
      invoke('get_playlists').then((res: unknown) => setAllPlaylists(res as Playlist[])).catch(console.error);
    };
    window.addEventListener('playlists-updated', handlePlaylistUpdate);
    return () => window.removeEventListener('playlists-updated', handlePlaylistUpdate);
  }, [view, playlistId, type, globalSongs]);

  const toggleFavoriteAction = useLibraryStore(s => s.toggleFavorite);

  const handleToggleFavorite = async (songId: number) => {
    await toggleFavoriteAction(songId);
  };

  const filteredSongs = useMemo(() => {
    let baseList = globalSongs;
    
    if (view === 'favorites') {
      baseList = globalSongs.filter(s => s.is_favorite);
    } else if (view !== 'all') {
      baseList = localSongIds
        .map(id => globalSongs.find(s => s.id === id))
        .filter((s): s is Song => s !== undefined);
    }

    if (!activeFilter) return baseList;
    return baseList.filter(s => {
      if (activeFilter.type === 'artist') return s.artist === activeFilter.value;
      if (activeFilter.type === 'album') return s.album === activeFilter.value;
      return true;
    });
  }, [globalSongs, localSongIds, view, activeFilter]);



  async function handleScan() {
    try {
      const selectedPath = await open({ directory: true, multiple: false });
      if (selectedPath) {
        setScanStatus(`Scanning ${selectedPath}...`);
        const autoFetchLyrics = useSettingsStore.getState().autoFetchLyrics;
        const count: number = await invoke("scan_and_read_metadata", { path: selectedPath, autoFetchLyrics });
        setScanStatus(`Scanned ${count} songs successfully!`);
        await fetchGlobalSongs();
        setTimeout(() => setScanStatus(""), 3000);
      }
    } catch (err) {
      console.error(err);
      setScanStatus(`Error: ${err}`);
    }
  }

  const rowVirtualizer = useVirtualizer({
    count: filteredSongs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  return (
    <div className="flex flex-col h-full bg-transparent text-gray-200 font-sans relative">
      <div className="flex items-center justify-between px-8 py-6 border-b border-white/10 bg-space-800/40 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-4xl font-heading font-extrabold text-white tracking-tight drop-shadow-md">
              {view === 'all' && "Library"}
              {view === 'favorites' && "Favorites"}
              {view === 'recent' && "Recently Played"}
              {view === 'most-played' && "Most Played"}
              {view === 'playlist' && (playlistMeta?.name || "Playlist")}
              {view === 'smart-playlist' && type === 'on_repeat' && "On Repeat"}
              {view === 'smart-playlist' && type === 'forgotten_favorites' && "Forgotten Favorites"}
              {view === 'smart-playlist' && type === 'short_sweet' && "Short & Sweet"}
            </h1>
            <p className="text-gray-400 mt-1 text-sm font-medium">{filteredSongs.length} songs</p>
          </div>
          {activeFilter && (
            <div className="flex items-center bg-white/10 border border-white/20 rounded-full pl-4 pr-1 py-1 ml-4 shadow-inner">
              <span className="text-sm font-medium text-white mr-2">
                <span className="text-gray-400 font-normal mr-1">{activeFilter.type === 'artist' ? 'Artist:' : 'Album:'}</span>
                {activeFilter.value}
              </span>
              <button 
                onClick={clearFilter}
                className="p-1 rounded-full hover:bg-white/20 text-gray-400 hover:text-white transition-colors"
                title="Clear filter"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          {scanStatus && <span className="text-nebula-cyan text-sm font-medium animate-pulse">{scanStatus}</span>}
          <button 
            onClick={handleScan}
            disabled={!!scanStatus && scanStatus.startsWith("Scanning")}
            className="px-6 py-2.5 bg-white/10 hover:bg-white/20 disabled:bg-gray-800 disabled:text-gray-500 text-white font-heading font-semibold rounded-lg shadow-sm backdrop-blur-sm transition-all duration-200 ease-out text-sm border border-white/10 hover:border-white/20"
          >
            Choose Music Folder
          </button>
        </div>
      </div>

      <div className="flex px-10 py-3 text-xs font-heading font-bold text-gray-400 uppercase tracking-widest border-b border-white/5 bg-space-900/60 backdrop-blur-md sticky top-0 z-10 shadow-sm">
        <div className="w-10"></div>
        <div className="w-1/3">Title</div>
        <div className="w-1/4">Artist</div>
        <div className="w-1/4">Album</div>
        <div className="w-1/6 text-right">Time</div>
      </div>

      <div ref={parentRef} className="flex-1 overflow-auto px-4 py-2 custom-scrollbar relative z-0">
        {isLoading && globalSongs.length === 0 ? (
          <div className="flex justify-center mt-20 text-gray-400 text-sm font-medium">Loading library...</div>
        ) : filteredSongs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
            {activeFilter ? (
              <p className="text-2xl font-heading font-semibold">No songs match this filter.</p>
            ) : view === 'playlist' ? (
              <p className="text-xl font-heading font-semibold">This playlist is empty. Right-click any song and choose 'Add to Playlist' to get started.</p>
            ) : view === 'favorites' ? (
              <p className="text-xl font-heading font-semibold">No favorites yet. Click the heart icon on any song to add it here.</p>
            ) : view === 'recent' ? (
              <p className="text-xl font-heading font-semibold">You haven't played anything recently.</p>
            ) : view === 'most-played' ? (
              <p className="text-xl font-heading font-semibold">No most-played tracks yet. Keep listening!</p>
            ) : view === 'smart-playlist' ? (
              <p className="text-xl font-heading font-semibold">No songs match this smart playlist's criteria.</p>
            ) : (
              <>
                <p className="text-2xl font-heading font-semibold">The void is empty.</p>
                <p className="text-sm">Click "Choose Music Folder" to bring life to the nebula.</p>
              </>
            )}
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const song = filteredSongs[virtualRow.index];
              return (
                <SongRow 
                  key={song.id} 
                  song={song} 
                  isCurrent={currentSongId === song.id} 
                  virtualRow={virtualRow} 
                  playSong={playSong} 
                  queue={filteredSongs}
                  onToggleFavorite={handleToggleFavorite}
                  onContextMenu={(e, song) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, song });
                  }}
                  isDraggable={view === 'playlist'}
                  index={virtualRow.index}
                  onDragStart={(e, id) => {
                    e.dataTransfer.setData('text/plain', id.toString());
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e, newIndex) => {
                    e.preventDefault();
                    const draggedId = parseInt(e.dataTransfer.getData('text/plain'));
                    if (draggedId && playlistId && view === 'playlist') {
                      try {
                        await invoke('reorder_playlist', { playlistId, songId: draggedId, newPosition: newIndex });
                        fetchViewSongs(); // Refresh the list
                      } catch (err) {
                        console.error(err);
                      }
                    }
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
      
      {contextMenu && (
        <ContextMenu 
          x={contextMenu.x} 
          y={contextMenu.y} 
          song={contextMenu.song} 
          playlists={allPlaylists}
          onClose={() => setContextMenu(null)}
          onPlay={(s) => playSong(s, filteredSongs)}
        />
      )}
    </div>
  );
}
