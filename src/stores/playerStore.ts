import { create } from 'zustand';
import { Song, LyricLine } from '../types';
import { getDominantColor } from '../utils/color';
import { engine } from '../utils/audioEngine';
import { parseLrc } from '../utils/lyricsParser';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from './settingsStore';

interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  volume: number;
  error: string | null;
  accentColor: string | null;
  queue: Song[];
  hasLoggedHistory: boolean;
  
  isFullScreen: boolean;
  lyricsCache: Record<number, LyricLine[] | null>;
  currentLyrics: LyricLine[] | null;
  isFetchingLyrics: boolean;
  
  setFullScreen: (isFull: boolean) => void;
  fetchLyrics: (song: Song) => Promise<void>;
  fetchLyricsOnline: (song: Song) => Promise<void>;
  
  playSong: (song: Song, queue?: Song[]) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  seek: (position: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  
  // Internal/event actions
  setPosition: (position: number, duration: number) => void;
  setPlayingState: (isPlaying: boolean) => void;
  setError: (error: string | null) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  isPlaying: false,
  position: 0,
  duration: 0,
  volume: 1.0,
  error: null,
  accentColor: null,
  queue: [],
  hasLoggedHistory: false,
  isFullScreen: false,
  lyricsCache: {},
  currentLyrics: null,
  isFetchingLyrics: false,
  
  setFullScreen: (isFull: boolean) => set({ isFullScreen: isFull }),
  
  fetchLyrics: async (song: Song) => {
    const { lyricsCache } = get();
    if (lyricsCache[song.id] !== undefined) {
      set({ currentLyrics: lyricsCache[song.id] });
      return;
    }
    
    try {
      const lyricsStr: string | null = await invoke('get_lyrics', { path: song.path });
      if (lyricsStr) {
        const parsed = parseLrc(lyricsStr);
        set(state => ({
          lyricsCache: { ...state.lyricsCache, [song.id]: parsed },
          currentLyrics: parsed
        }));
      } else {
        set(state => ({
          lyricsCache: { ...state.lyricsCache, [song.id]: null },
          currentLyrics: null
        }));
      }
    } catch (e) {
      console.error('Failed to fetch lyrics:', e);
      set(state => ({
        lyricsCache: { ...state.lyricsCache, [song.id]: null },
        currentLyrics: null
      }));
    }
  },
  
  fetchLyricsOnline: async (song: Song) => {
    set({ isFetchingLyrics: true });
    try {
      const lyricsStr: string = await invoke('fetch_lyrics_online', {
        songId: song.id,
        title: song.title,
        artist: song.artist,
        duration: song.duration_seconds,
        path: song.path
      });
      const parsed = parseLrc(lyricsStr);
      set(state => ({
        lyricsCache: { ...state.lyricsCache, [song.id]: parsed },
        currentLyrics: parsed,
        isFetchingLyrics: false
      }));
    } catch (e: any) {
      console.error('Failed to fetch lyrics online:', e);
      // We don't overwrite currentLyrics here, we just stop fetching
      set({ isFetchingLyrics: false });
      throw e; // Bubble up so the UI can show an error
    }
  },

  playSong: async (song: Song, newQueue?: Song[]) => {
    try {
      await engine.play(song.path);
      const theme = useSettingsStore.getState().accentTheme;
      let newAccentColor = getDominantColor(song.title);
      if (theme === 'purple') newAccentColor = '#a855f7';
      else if (theme === 'blue') newAccentColor = '#3b82f6';
      else if (theme === 'green') newAccentColor = '#10b981';
      else if (theme === 'sunset') newAccentColor = '#f97316';
      else if (theme === 'cyberpunk') newAccentColor = '#ec4899';

      set({ 
        currentSong: song, 
        isPlaying: true, 
        position: 0, 
        error: null, 
        accentColor: newAccentColor,
        hasLoggedHistory: false,
        ...(newQueue ? { queue: newQueue } : {})
      });
      
      // Preload next track for gapless
      const stateQueue = newQueue || get().queue;
      const currentIndex = stateQueue.findIndex(s => s.id === song.id);
      if (currentIndex >= 0 && currentIndex < stateQueue.length - 1) {
        engine.preload(stateQueue[currentIndex + 1].path);
      }
      
      // Fire and forget fetch lyrics
      get().fetchLyrics(song);
      
      // OS Notification
      const settings = useSettingsStore.getState();
      if (settings.notificationsEnabled) {
        import('@tauri-apps/plugin-notification').then(({ isPermissionGranted, requestPermission, sendNotification }) => {
          isPermissionGranted().then(granted => {
            const doNotify = () => {
              import('@tauri-apps/api/path').then(({ appLocalDataDir }) => {
                appLocalDataDir().then(dir => {
                  let icon: string | undefined;
                  if (song.art_hash) {
                    icon = `${dir}\\artwork\\${song.art_hash}.jpg`;
                  }
                  sendNotification({
                    title: song.title,
                    body: `${song.artist} • ${song.album}`,
                    icon
                  });
                });
              });
            };
            if (granted) {
              doNotify();
            } else {
              requestPermission().then(perm => {
                if (perm === 'granted') doNotify();
              });
            }
          });
        }).catch(e => console.error("Notification plugin missing", e));
      }
      
    } catch (e: any) {
      console.error("Failed to play song:", e);
      set({ error: typeof e === "string" ? e : "Unknown error" });
    }
  },

  togglePlayPause: async () => {
    const { isPlaying, currentSong } = get();
    if (!currentSong) return;
    try {
      if (isPlaying) {
        engine.pause();
      } else {
        engine.resume();
      }
      set({ isPlaying: !isPlaying });
    } catch (e) {
      console.error("Failed to toggle playback:", e);
    }
  },

  playNext: async () => {
    const { currentSong, playSong, queue } = get();
    if (!currentSong || queue.length === 0) return;
    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
    if (currentIndex >= 0 && currentIndex < queue.length - 1) {
      await playSong(queue[currentIndex + 1]);
    }
  },

  playPrevious: async () => {
    const { currentSong, playSong, queue } = get();
    if (!currentSong || queue.length === 0) return;
    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
    if (currentIndex > 0) {
      await playSong(queue[currentIndex - 1]);
    } else if (currentIndex === 0) {
      await get().seek(0);
    }
  },

  seek: async (position: number) => {
    try {
      engine.seek(position);
      set({ position });
    } catch (e) {
      console.error("Failed to seek:", e);
    }
  },

  setVolume: async (volume: number) => {
    try {
      engine.setVolume(volume);
      set({ volume });
    } catch (e) {
      console.error("Failed to set volume:", e);
    }
  },

  setPosition: (position: number, duration: number) => {
    const realDuration = duration > 0 ? duration : get().duration;
    
    // History Tracking logic
    const { currentSong, hasLoggedHistory } = get();
    if (currentSong && !hasLoggedHistory && realDuration > 0 && position > realDuration / 2) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('log_history', { songId: currentSong.id, completed: true }).catch(console.error);
      });
      set({ hasLoggedHistory: true });
    }
    
    set({ position, duration: realDuration });
  },
  
  setPlayingState: (isPlaying: boolean) => set({ isPlaying }),
  setError: (error: string | null) => set({ error }),
}));

let initialized = false;
let errorTimeout: any = null;

export function initPlayerStoreListeners() {
  if (initialized) return;
  initialized = true;
  
  import('./libraryStore').then(({ useLibraryStore }) => {
    useLibraryStore.subscribe((state) => {
      const playerState = usePlayerStore.getState();
      if (playerState.currentSong) {
        const updated = state.songs.find(s => s.id === playerState.currentSong!.id);
        if (updated && updated.is_favorite !== playerState.currentSong.is_favorite) {
          usePlayerStore.setState({ currentSong: { ...playerState.currentSong, is_favorite: updated.is_favorite } });
        }
      }
    });
  });
  
  // Apply Settings Store initialization
  const settings = useSettingsStore.getState();
  engine.setCrossfade(settings.crossfadeEnabled ? settings.crossfadeDuration : 0);
  settings.eqCustomBands.forEach((val, i) => engine.setEqBand(i, val));

  // Initialize theme
  if (settings.accentTheme !== 'dynamic') {
    let newAccentColor = '#00F0FF';
    if (settings.accentTheme === 'purple') newAccentColor = '#a855f7';
    else if (settings.accentTheme === 'blue') newAccentColor = '#3b82f6';
    else if (settings.accentTheme === 'green') newAccentColor = '#10b981';
    else if (settings.accentTheme === 'sunset') newAccentColor = '#f97316';
    else if (settings.accentTheme === 'cyberpunk') newAccentColor = '#ec4899';
    usePlayerStore.setState({ accentColor: newAccentColor });
  }

  useSettingsStore.subscribe((state, prevState) => {
    engine.setCrossfade(state.crossfadeEnabled ? state.crossfadeDuration : 0);
    state.eqCustomBands.forEach((val, i) => engine.setEqBand(i, val));
    
    if (state.accentTheme !== prevState.accentTheme) {
      const playerStore = usePlayerStore.getState();
      let newAccentColor = playerStore.currentSong 
          ? getDominantColor(playerStore.currentSong.title)
          : '#00F0FF';
          
      if (state.accentTheme === 'purple') newAccentColor = '#a855f7';
      else if (state.accentTheme === 'blue') newAccentColor = '#3b82f6';
      else if (state.accentTheme === 'green') newAccentColor = '#10b981';
      else if (state.accentTheme === 'sunset') newAccentColor = '#f97316';
      else if (state.accentTheme === 'cyberpunk') newAccentColor = '#ec4899';
      
      usePlayerStore.setState({ accentColor: newAccentColor });
    }
  });

  engine.on('progress', (payload: any) => {
    const { position, duration } = payload;
    usePlayerStore.getState().setPosition(position, duration);
  });

  engine.on('finished', () => {
    const store = usePlayerStore.getState();
    const current = store.currentSong;
    if (current) {
      if (!store.hasLoggedHistory) {
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('log_history', { songId: current.id, completed: true }).catch(console.error);
        });
      }
      store.playNext();
    }
  });

  engine.on('error', (message: string) => {
    const storeState = usePlayerStore.getState();
    if (storeState.error !== message) {
      storeState.setError(message);
      storeState.setPlayingState(false);
      
      clearTimeout(errorTimeout);
      errorTimeout = setTimeout(() => {
        storeState.playNext();
      }, 3000);
    }
  });
  engine.on('play', () => {
    usePlayerStore.getState().setPlayingState(true);
  });
  
  engine.on('pause', () => {
    usePlayerStore.getState().setPlayingState(false);
  });
  
  // Global Shortcuts (Hardware media keys)
  import('@tauri-apps/plugin-global-shortcut').then(async ({ register, unregisterAll, isRegistered }) => {
    try {
      await unregisterAll();
      const shortcuts = {
        'MediaPlayPause': () => usePlayerStore.getState().togglePlayPause(),
        'MediaNextTrack': () => usePlayerStore.getState().playNext(),
        'MediaPreviousTrack': () => usePlayerStore.getState().playPrevious()
      };
      
      for (const [key, handler] of Object.entries(shortcuts)) {
        const registered = await isRegistered(key);
        if (!registered) {
          await register(key, handler);
        }
      }
    } catch (e) {
      console.error('Failed to register global shortcuts:', e);
    }
  }).catch(e => console.error("Global shortcut plugin missing", e));
  
  // Tray Event Listener
  import('@tauri-apps/api/event').then(({ listen }) => {
    listen('tray_event', (event: any) => {
       const store = usePlayerStore.getState();
       if (event.payload === 'play_pause') store.togglePlayPause();
       else if (event.payload === 'next') store.playNext();
       else if (event.payload === 'prev') store.playPrevious();
    });
  });
}
