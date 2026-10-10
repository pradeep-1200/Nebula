import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type EqPreset = 'Flat' | 'Rock' | 'Bass Boost' | 'Vocal' | 'Custom';
export type AccentTheme = 'dynamic' | 'purple' | 'blue' | 'green' | 'sunset' | 'cyberpunk';

interface SettingsState {
  isSettingsOpen: boolean;
  setIsSettingsOpen: (isOpen: boolean) => void;

  accentTheme: AccentTheme;
  setAccentTheme: (theme: AccentTheme) => void;
  autoFetchLyrics: boolean;
  setAutoFetchLyrics: (value: boolean) => void;
  
  eqPreset: EqPreset;
  setEqPreset: (preset: EqPreset) => void;
  
  eqCustomBands: number[];
  setEqCustomBands: (bands: number[]) => void;
  
  crossfadeEnabled: boolean;
  setCrossfadeEnabled: (enabled: boolean) => void;
  
  crossfadeDuration: number;
  setCrossfadeDuration: (seconds: number) => void;
  
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  
  startWithWindows: boolean;
  setStartWithWindows: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      isSettingsOpen: false,
      setIsSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),

      accentTheme: 'dynamic',
      setAccentTheme: (theme) => set({ accentTheme: theme }),

      autoFetchLyrics: false,
      setAutoFetchLyrics: (value) => set({ autoFetchLyrics: value }),
      
      eqPreset: 'Flat',
      setEqPreset: (preset) => set({ eqPreset: preset }),
      
      eqCustomBands: new Array(10).fill(0),
      setEqCustomBands: (bands) => set({ eqCustomBands: bands }),
      
      crossfadeEnabled: false,
      setCrossfadeEnabled: (enabled) => set({ crossfadeEnabled: enabled }),
      
      crossfadeDuration: 3,
      setCrossfadeDuration: (seconds) => set({ crossfadeDuration: seconds }),
      
      notificationsEnabled: true,
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      
      startWithWindows: false,
      setStartWithWindows: (enabled) => set({ startWithWindows: enabled }),
    }),
    {
      name: 'nebula-settings',
    }
  )
);
