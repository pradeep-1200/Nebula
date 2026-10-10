import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export function AudioTest() {
  const [songId, setSongId] = useState<number>(1);
  const [playbackState, setPlaybackState] = useState<any>(null);
  const [progress, setProgress] = useState({ position: 0, duration: 0 });
  const [volume, setVolume] = useState(1.0);
  
  useEffect(() => {
    const unlisten = listen("playback-progress", (event: any) => {
      setProgress(event.payload);
    });
    
    const interval = setInterval(async () => {
      const state = await invoke("get_playback_state");
      setPlaybackState(state);
    }, 1000);
    
    return () => {
      unlisten.then(f => f());
      clearInterval(interval);
    };
  }, []);
  
  return (
    <div className="fixed bottom-0 right-0 p-4 bg-gray-800 border-t border-gray-700 w-[400px] rounded-tl-xl shadow-2xl z-50 font-sans">
      <h3 className="text-white font-bold mb-3 text-lg border-b border-gray-700 pb-2">Phase 6 Test Panel</h3>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input 
            type="number" 
            value={songId} 
            onChange={e => setSongId(parseInt(e.target.value))} 
            className="w-16 px-2 py-1.5 bg-gray-900 text-white rounded outline-none border border-gray-700"
            title="Song ID"
          />
          <button onClick={() => invoke("play_song", { songId })} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-medium transition">Play</button>
          <button onClick={() => invoke("pause_playback")} className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded text-white text-sm font-medium transition">Pause</button>
          <button onClick={() => invoke("resume_playback")} className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-white text-sm font-medium transition">Resume</button>
          <button onClick={() => invoke("stop_playback")} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-white text-sm font-medium transition">Stop</button>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-gray-300 font-mono bg-gray-900 p-2 rounded">
          State: <span className="text-blue-400">{playbackState?.type || "Unknown"}</span>
          {playbackState?.message && <span className="text-red-400 ml-2">({playbackState.message})</span>}
        </div>
        
        <div className="flex items-center gap-3 text-sm text-gray-300">
          <button onClick={() => invoke("seek", { positionSeconds: Math.max(0, progress.position - 5) })} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded transition">-5s</button>
          <button onClick={() => invoke("seek", { positionSeconds: progress.position + 5 })} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded transition">+5s</button>
          <span className="font-mono">{progress.position.toFixed(1)}s / {progress.duration.toFixed(1)}s</span>
        </div>
        
        <div className="flex items-center gap-3 text-sm text-gray-300 mt-1">
          <span>Vol:</span> 
          <input 
            type="range" 
            min="0" max="1" step="0.05" 
            value={volume} 
            onChange={e => {
              const v = parseFloat(e.target.value);
              setVolume(v);
              invoke("set_volume", { volume: v });
            }}
            className="flex-1 accent-blue-500"
          />
          <span className="w-8 text-right font-mono">{Math.round(volume * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
