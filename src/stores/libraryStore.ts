import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { Song } from '../types';

interface LibraryState {
  songs: Song[];
  isLoading: boolean;
  scanStatus: string;
  activeFilter: { type: 'artist' | 'album', value: string } | null;
  fetchSongs: () => Promise<void>;
  setScanStatus: (status: string) => void;
  setFilter: (type: 'artist' | 'album', value: string) => void;
  clearFilter: () => void;
  toggleFavorite: (id: number) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  songs: [],
  isLoading: false,
  scanStatus: '',
  activeFilter: null,
  fetchSongs: async () => {
    set({ isLoading: true });
    try {
      const songs: Song[] = await invoke('get_all_songs');
      set({ songs, isLoading: false });
    } catch (err) {
      console.error("Failed to fetch songs", err);
      set({ isLoading: false });
    }
  },
  setScanStatus: (status: string) => set({ scanStatus: status }),
  setFilter: (type, value) => set({ activeFilter: { type, value } }),
  clearFilter: () => set({ activeFilter: null }),
  toggleFavorite: async (id: number) => {
    try {
      await invoke('toggle_favorite', { songId: id });
      set(state => ({
        songs: state.songs.map(s => s.id === id ? { ...s, is_favorite: !s.is_favorite } : s)
      }));
    } catch (e) {
      console.error("Failed to toggle favorite:", e);
    }
  },
}));
