pub mod lyrics_api;
use crate::database::{get_db_path, upsert_song};
use crate::metadata::extract_metadata;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize)]
pub struct ScannedFile {
    pub path: String,
    pub filename: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub async fn scan_folder(path: String) -> Result<Vec<ScannedFile>, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut local_files = Vec::new();
        let extensions = ["mp3", "flac", "m4a", "wav", "ogg"];

        for entry in WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
                    if extensions.contains(&ext.to_lowercase().as_str()) {
                        let metadata = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        local_files.push(ScannedFile {
                            path: entry.path().to_string_lossy().to_string(),
                            filename: entry.file_name().to_string_lossy().to_string(),
                            size_bytes: metadata,
                        });
                    }
                }
            }
        }
        local_files
    })
    .await
    .map_err(|e| format!("Failed to run background scan: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub async fn scan_and_read_metadata(
    app: AppHandle,
    path: String,
    auto_fetch_lyrics: bool,
) -> Result<usize, String> {
    let app_clone = app.clone();
    let result =
        tauri::async_runtime::spawn_blocking(move || -> Result<(usize, Vec<i64>), String> {
            let db_path = get_db_path(&app).map_err(|e| format!("DB Error: {}", e))?;
            let mut conn = Connection::open(db_path).map_err(|e| format!("DB Error: {}", e))?;
            let tx = conn.transaction().map_err(|e| format!("DB Error: {}", e))?;

            let mut artwork_dir = app
                .path()
                .app_local_data_dir()
                .map_err(|e| format!("App Path Error: {}", e))?;
            artwork_dir.push("artwork");
            std::fs::create_dir_all(&artwork_dir).map_err(|e| format!("FS Error: {}", e))?;

            let mut count = 0;
            let mut new_song_ids = Vec::new();
            let extensions = ["mp3", "flac", "m4a", "wav", "ogg"];

            for entry in WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
                if entry.file_type().is_file() {
                    if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
                        if extensions.contains(&ext.to_lowercase().as_str()) {
                            let path_str = entry.path().to_string_lossy().to_string();
                            let filename_str = entry.file_name().to_string_lossy().to_string();
                            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);

                            match extract_metadata(&path_str, size, &filename_str, &artwork_dir) {
                                Ok(meta) => match upsert_song(&tx, &meta) {
                                    Ok(Some(new_id)) => {
                                        count += 1;
                                        new_song_ids.push(new_id);
                                    }
                                    Ok(None) => {
                                        count += 1;
                                    }
                                    Err(e) => {
                                        eprintln!("Failed to insert {}: {}", path_str, e);
                                    }
                                },
                                Err(e) => {
                                    eprintln!("Failed to read metadata for {}: {}", path_str, e);
                                }
                            }
                        }
                    }
                }
            }

            tx.commit().map_err(|e| format!("DB Error: {}", e))?;
            Ok((count, new_song_ids))
        })
        .await
        .map_err(|e| format!("Failed to run background scan: {}", e))??;

    if auto_fetch_lyrics && !result.1.is_empty() {
        tauri::async_runtime::spawn(async move {
            let _ = lyrics_api::bulk_fetch_specific_lyrics(app_clone, result.1).await;
        });
    }

    Ok(result.0)
}

#[tauri::command]
pub fn get_lyrics(path: String) -> Result<Option<String>, String> {
    let audio_path = std::path::Path::new(&path);
    let lrc_path = audio_path.with_extension("lrc");

    if lrc_path.exists() && lrc_path.is_file() {
        match std::fs::read_to_string(&lrc_path) {
            Ok(contents) => Ok(Some(contents)),
            Err(e) => Err(format!("Failed to read lyrics file: {}", e)),
        }
    } else {
        Ok(None)
    }
}
