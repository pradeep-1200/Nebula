import React, { useState, useEffect, useRef } from 'react';
import { Settings, X, Download, AlertCircle, Palette, Database, Sliders, Monitor, Upload } from 'lucide-react';
import { useSettingsStore, AccentTheme } from '../stores/settingsStore';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';

interface SettingsOverlayProps {
  onClose: () => void;
}

interface BulkFetchProgress {
  fetched: number;
  total: number;
  not_found: number;
  current_song_title: string;
}

type Tab = 'general' | 'audio' | 'appearance' | 'data';

export function SettingsOverlay({ onClose }: SettingsOverlayProps) {
  const { 
    autoFetchLyrics, setAutoFetchLyrics,
    crossfadeEnabled, setCrossfadeEnabled,
    crossfadeDuration, setCrossfadeDuration,
    notificationsEnabled, setNotificationsEnabled,
    startWithWindows, setStartWithWindows,
    accentTheme, setAccentTheme
  } = useSettingsStore();
  
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [isFetching, setIsFetching] = useState(false);
  const [progress, setProgress] = useState<BulkFetchProgress | null>(null);

  useEffect(() => {
    const unlisten = listen<BulkFetchProgress>('bulk_fetch_progress', (event) => {
      setProgress(event.payload);
      if (event.payload.current_song_title === 'Completed') {
        setIsFetching(false);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleBulkFetch = async () => {
    setIsFetching(true);
    setProgress({ fetched: 0, total: 0, not_found: 0, current_song_title: 'Starting...' });
    try {
      await invoke('bulk_fetch_missing_lyrics');
    } catch (e) {
      console.error(e);
      setIsFetching(false);
    }
  };

  const handleExport = async () => {
    try {
      const data: any = await invoke('export_user_data');
      const jsonStr = JSON.stringify(data, null, 2);
      
      const filePath = await save({
        filters: [{ name: 'Nebula Backup', extensions: ['json'] }],
        defaultPath: 'nebula_backup.json'
      });
      
      if (filePath) {
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        await writeTextFile(filePath, jsonStr);
        alert('Data exported successfully!');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to export data: ' + e);
    }
  };

  const handleImport = async () => {
    try {
      const filePath = await open({
        filters: [{ name: 'Nebula Backup', extensions: ['json'] }],
        multiple: false
      });
      
      if (filePath) {
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        const content = await readTextFile(filePath);
        await invoke('import_user_data', { data: content });
        alert('Data imported successfully! Playlists and favorites will be merged.');
        window.dispatchEvent(new Event('playlists-updated'));
      }
    } catch (e) {
      console.error(e);
      alert('Failed to import data: ' + e);
    }
  };

  const themes: { id: AccentTheme; name: string; color: string }[] = [
    { id: 'dynamic', name: 'Dynamic (Album Art)', color: 'bg-gradient-to-tr from-gray-400 to-gray-600' },
    { id: 'purple', name: 'Deep Space Purple', color: 'bg-[#a855f7]' },
    { id: 'blue', name: 'Nebula Blue', color: 'bg-[#3b82f6]' },
    { id: 'green', name: 'Aurora Green', color: 'bg-[#10b981]' },
    { id: 'sunset', name: 'Solar Flare', color: 'bg-[#f97316]' },
    { id: 'cyberpunk', name: 'Cyberpunk', color: 'bg-[#ec4899]' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-space-900 border border-white/10 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col h-[80vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-nebula-cyan/20 text-nebula-cyan rounded-lg">
              <Settings size={24} />
            </div>
            <h2 className="text-2xl font-heading font-semibold text-white">Settings</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Tabs */}
          <div className="w-48 border-r border-white/10 bg-black/20 p-4 space-y-1 shrink-0">
            <button 
              onClick={() => setActiveTab('general')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'general' ? 'bg-nebula-cyan/20 text-nebula-cyan' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
            >
              <Monitor size={18} /> General
            </button>
            <button 
              onClick={() => setActiveTab('audio')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'audio' ? 'bg-nebula-cyan/20 text-nebula-cyan' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
            >
              <Sliders size={18} /> Audio
            </button>
            <button 
              onClick={() => setActiveTab('appearance')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'appearance' ? 'bg-nebula-cyan/20 text-nebula-cyan' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
            >
              <Palette size={18} /> Appearance
            </button>
            <button 
              onClick={() => setActiveTab('data')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'data' ? 'bg-nebula-cyan/20 text-nebula-cyan' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
            >
              <Database size={18} /> Data & Sync
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            
            {activeTab === 'general' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <section className="space-y-4">
                  <h3 className="text-lg font-medium text-white/90">Lyrics Engine</h3>
                  
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                    <div className="space-y-1">
                      <p className="text-white font-medium">Auto-fetch for new songs</p>
                      <p className="text-sm text-gray-400">Search for missing lyrics automatically when adding new files.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={autoFetchLyrics} onChange={(e) => setAutoFetchLyrics(e.target.checked)} />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-nebula-cyan"></div>
                    </label>
                  </div>

                  <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="text-white font-medium">Bulk Fetch Missing Lyrics</p>
                        <p className="text-sm text-gray-400 max-w-md">Scan your entire library and fetch lyrics from lrclib.net.</p>
                      </div>
                      <button onClick={handleBulkFetch} disabled={isFetching} className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50 rounded-lg text-white font-medium transition-colors">
                        <Download size={18} />
                        <span>{isFetching ? 'Fetching...' : 'Start'}</span>
                      </button>
                    </div>

                    {progress && (
                      <div className="mt-4 p-4 bg-black/30 rounded-lg space-y-2 border border-white/5">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400 truncate mr-4">{progress.current_song_title === 'Completed' ? 'Finished!' : `Searching: ${progress.current_song_title}`}</span>
                          <span className="text-white font-medium shrink-0">{progress.fetched + progress.not_found} / {progress.total}</span>
                        </div>
                        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-nebula-cyan transition-all duration-300 ease-out" style={{ width: `${progress.total > 0 ? ((progress.fetched + progress.not_found) / progress.total) * 100 : 0}%` }} />
                        </div>
                        <div className="flex gap-4 text-xs">
                          <span className="text-green-400">Found: {progress.fetched}</span>
                          <span className="text-red-400">Not Found: {progress.not_found}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-lg font-medium text-white/90">System Integration</h3>
                  
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                    <div className="space-y-1">
                      <p className="text-white font-medium">Native OS Notifications</p>
                      <p className="text-sm text-gray-400">Show track changes in Windows Action Center.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={notificationsEnabled} onChange={(e) => setNotificationsEnabled(e.target.checked)} />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-nebula-cyan"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                    <div className="space-y-1">
                      <p className="text-white font-medium">Start on Boot</p>
                      <p className="text-sm text-gray-400">Launch Nebula silently in tray on system startup.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={startWithWindows} onChange={async (e) => {
                        const enabled = e.target.checked;
                        setStartWithWindows(enabled);
                        try {
                          const { enable, disable } = await import('@tauri-apps/plugin-autostart');
                          if (enabled) await enable(); else await disable();
                        } catch (err) { console.error(err); }
                      }} />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-nebula-cyan"></div>
                    </label>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'audio' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <section className="space-y-4">
                  <h3 className="text-lg font-medium text-white/90">Playback</h3>
                  
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-white font-medium">Crossfade</p>
                        <p className="text-sm text-gray-400">Smoothly overlap tracks to eliminate silence.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={crossfadeEnabled} onChange={(e) => setCrossfadeEnabled(e.target.checked)} />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-nebula-cyan"></div>
                      </label>
                    </div>
                    
                    {crossfadeEnabled && (
                      <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                        <span className="text-sm text-gray-400">Overlap Duration: {crossfadeDuration}s</span>
                        <input type="range" min="1" max="10" value={crossfadeDuration} onChange={(e) => setCrossfadeDuration(parseInt(e.target.value))} className="w-1/2 accent-nebula-cyan" />
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <section className="space-y-4">
                  <h3 className="text-lg font-medium text-white/90">Accent Theme</h3>
                  <p className="text-sm text-gray-400 mb-4">Choose a static color identity, or let Nebula adapt dynamically to your album art.</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    {themes.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setAccentTheme(t.id)}
                        className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${accentTheme === t.id ? 'bg-white/10 border-white/30 ring-1 ring-white/20' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                      >
                        <div className={`w-8 h-8 rounded-full shadow-lg ${t.color}`} />
                        <span className="font-medium text-sm text-white">{t.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'data' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <section className="space-y-4">
                  <h3 className="text-lg font-medium text-white/90">Backup & Restore</h3>
                  <p className="text-sm text-gray-400">Export your playlists and favorites to a JSON file to transfer between devices, or restore an existing backup.</p>
                  
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <button onClick={handleExport} className="flex flex-col items-center justify-center gap-3 p-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors group">
                      <Download className="w-8 h-8 text-gray-400 group-hover:text-nebula-cyan transition-colors" />
                      <div className="text-center">
                        <div className="font-medium text-white mb-1">Export Data</div>
                        <div className="text-xs text-gray-500">Save your library metadata</div>
                      </div>
                    </button>
                    
                    <button onClick={handleImport} className="flex flex-col items-center justify-center gap-3 p-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors group">
                      <Upload className="w-8 h-8 text-gray-400 group-hover:text-nebula-cyan transition-colors" />
                      <div className="text-center">
                        <div className="font-medium text-white mb-1">Import Data</div>
                        <div className="text-xs text-gray-500">Merge an existing backup</div>
                      </div>
                    </button>
                  </div>
                </section>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
