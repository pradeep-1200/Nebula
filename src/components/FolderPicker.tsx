import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useSettingsStore } from '../stores/settingsStore';

export function FolderPicker() {
  const [status, setStatus] = useState("");

  async function pickFolder() {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
      });

      if (selectedPath) {
        setStatus(`Scanning ${selectedPath}...`);
        console.log("Starting scan of:", selectedPath);
        
        // Phase 4: Call scan_and_read_metadata (now upserts to SQLite)
        const autoFetchLyrics = useSettingsStore.getState().autoFetchLyrics;
        const count: number = await invoke("scan_and_read_metadata", { path: selectedPath, autoFetchLyrics });
        
        setStatus(`Scan complete! Upserted ${count} songs to the database.`);
        console.log("Upserted songs:", count);

        // Sanity check DB
        const totalSongs: number = await invoke("get_song_count");
        console.log("Total songs in database now:", totalSongs);
        
        // Optional: fetch all just to log in console (like Phase 2)
        const allSongs: any[] = await invoke("get_all_songs");
        console.log("First 10 songs in DB:", allSongs.slice(0, 10));
      } else {
        setStatus("Folder selection cancelled.");
      }
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err}`);
    }
  }

  return (
    <div className="flex flex-col gap-2 p-4 bg-gray-800 rounded-lg mt-4">
      <h2 className="text-xl font-bold">Phase 4: SQLite Database</h2>
      <button
        onClick={pickFolder}
        className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-white font-medium transition w-max"
      >
        Choose Music Folder
      </button>
      <p className="text-gray-300 min-h-[1.5rem] text-sm">{status}</p>
    </div>
  );
}
