use super::{get_db_path, Song};
use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct UserDataExport {
    pub playlists: Vec<ExportPlaylist>,
    pub favorites: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ExportPlaylist {
    pub name: String,
    pub created_at: String,
    pub songs: Vec<String>,
}

// Favorite Commands
#[tauri::command]
pub fn toggle_favorite(app: AppHandle, song_id: i64) -> Result<bool, String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let current: bool = conn
        .query_row(
            "SELECT COALESCE(is_favorite, 0) FROM songs WHERE id = ?1",
            [song_id],
            |row| row.get(0),
        )
        .unwrap_or(false);

    let new_val = !current;

    conn.execute(
        "UPDATE songs SET is_favorite = ?1 WHERE id = ?2",
        params![new_val, song_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(new_val)
}

// Playlist Commands
#[tauri::command]
pub fn create_playlist(app: AppHandle, name: String) -> Result<i64, String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let created_at = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO playlists (name, created_at) VALUES (?1, ?2)",
        params![name, created_at],
    )
    .map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn get_playlists(app: AppHandle) -> Result<Vec<Playlist>, String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, created_at FROM playlists ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Playlist {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut playlists = Vec::new();
    for row in rows {
        if let Ok(pl) = row {
            playlists.push(pl);
        }
    }

    Ok(playlists)
}

#[tauri::command]
pub fn add_to_playlist(app: AppHandle, playlist_id: i64, song_id: i64) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // Get max position
    let max_pos: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), 0) FROM playlist_songs WHERE playlist_id = ?1",
            [playlist_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?1, ?2, ?3)",
        params![playlist_id, song_id, max_pos + 1],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn remove_from_playlist(app: AppHandle, playlist_id: i64, song_id: i64) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM playlist_songs WHERE playlist_id = ?1 AND song_id = ?2",
        params![playlist_id, song_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_playlist(app: AppHandle, playlist_id: i64) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM playlists WHERE id = ?1", [playlist_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reorder_playlist(
    app: AppHandle,
    playlist_id: i64,
    song_id: i64,
    new_position: i64,
) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT song_id FROM playlist_songs WHERE playlist_id = ?1 ORDER BY position ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([playlist_id], |row| {
            let sid: i64 = row.get(0)?;
            Ok(sid)
        })
        .map_err(|e| e.to_string())?;

    let mut current_order = Vec::new();
    for row in rows {
        if let Ok(id) = row {
            if id != song_id {
                current_order.push(id);
            }
        }
    }

    let idx = new_position.max(0) as usize;
    if idx >= current_order.len() {
        current_order.push(song_id);
    } else {
        current_order.insert(idx, song_id);
    }

    for (i, sid) in current_order.iter().enumerate() {
        conn.execute(
            "UPDATE playlist_songs SET position = ?1 WHERE playlist_id = ?2 AND song_id = ?3",
            params![(i as i64) + 1, playlist_id, sid],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn get_playlist_songs(app: AppHandle, playlist_id: i64) -> Result<Vec<Song>, String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT s.id, s.path, s.title, s.artist, s.album, s.genre, s.year, s.track_number, s.disc_number, s.duration_seconds, s.date_added, s.art_hash, COALESCE(s.is_favorite, 0) as is_favorite, s.lyrics_status
         FROM songs s
         JOIN playlist_songs ps ON s.id = ps.song_id
         WHERE ps.playlist_id = ?1
         ORDER BY ps.position ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([playlist_id], |row| {
            Ok(Song {
                id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                genre: row.get(5)?,
                year: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                duration_seconds: row.get(9)?,
                date_added: row.get(10)?,
                art_hash: row.get(11)?,
                is_favorite: row.get(12)?,
                lyrics_status: row.get(13).unwrap_or(Some("UNKNOWN".to_string())),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut songs = Vec::new();
    for row in rows {
        if let Ok(song) = row {
            songs.push(song);
        }
    }

    Ok(songs)
}

// History Commands
#[tauri::command]
pub fn log_history(app: AppHandle, song_id: i64, completed: bool) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let started_at = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO history (song_id, started_at, completed) VALUES (?1, ?2, ?3)",
        params![song_id, started_at, completed],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_recently_played(app: AppHandle) -> Result<Vec<Song>, String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT s.id, s.path, s.title, s.artist, s.album, s.genre, s.year, s.track_number, s.disc_number, s.duration_seconds, s.date_added, s.art_hash, COALESCE(s.is_favorite, 0) as is_favorite, s.lyrics_status
         FROM songs s
         JOIN history h ON s.id = h.song_id
         GROUP BY s.id
         ORDER BY MAX(h.started_at) DESC
         LIMIT 50"
    ).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Song {
                id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                genre: row.get(5)?,
                year: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                duration_seconds: row.get(9)?,
                date_added: row.get(10)?,
                art_hash: row.get(11)?,
                is_favorite: row.get(12)?,
                lyrics_status: row.get(13).unwrap_or(Some("UNKNOWN".to_string())),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut songs = Vec::new();
    for row in rows {
        if let Ok(song) = row {
            songs.push(song);
        }
    }
    Ok(songs)
}

#[tauri::command]
pub fn get_most_played(app: AppHandle) -> Result<Vec<Song>, String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT s.id, s.path, s.title, s.artist, s.album, s.genre, s.year, s.track_number, s.disc_number, s.duration_seconds, s.date_added, s.art_hash, COALESCE(s.is_favorite, 0) as is_favorite, s.lyrics_status, COUNT(h.id) as play_count
         FROM songs s
         JOIN history h ON s.id = h.song_id
         WHERE h.completed = 1
         GROUP BY s.id
         ORDER BY play_count DESC
         LIMIT 50"
    ).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Song {
                id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                genre: row.get(5)?,
                year: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                duration_seconds: row.get(9)?,
                date_added: row.get(10)?,
                art_hash: row.get(11)?,
                is_favorite: row.get(12)?,
                lyrics_status: row.get(13).unwrap_or(Some("UNKNOWN".to_string())),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut songs = Vec::new();
    for row in rows {
        if let Ok(song) = row {
            songs.push(song);
        }
    }
    Ok(songs)
}

#[tauri::command]
pub fn get_smart_playlist(app: AppHandle, playlist_type: String) -> Result<Vec<Song>, String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let query = match playlist_type.as_str() {
        "on_repeat" => "SELECT s.id, s.path, s.title, s.artist, s.album, s.genre, s.year, s.track_number, s.disc_number, s.duration_seconds, s.date_added, s.art_hash, COALESCE(s.is_favorite, 0) as is_favorite, s.lyrics_status, COUNT(h.id) as plays FROM songs s JOIN history h ON s.id = h.song_id WHERE h.started_at > date('now', '-14 days') GROUP BY s.id ORDER BY plays DESC LIMIT 50",
        "forgotten_favorites" => "SELECT s.id, s.path, s.title, s.artist, s.album, s.genre, s.year, s.track_number, s.disc_number, s.duration_seconds, s.date_added, s.art_hash, COALESCE(s.is_favorite, 0) as is_favorite, s.lyrics_status FROM songs s LEFT JOIN history h ON s.id = h.song_id WHERE s.is_favorite = 1 GROUP BY s.id HAVING MAX(h.started_at) < date('now', '-30 days') OR MAX(h.started_at) IS NULL LIMIT 50",
        "short_sweet" => "SELECT s.id, s.path, s.title, s.artist, s.album, s.genre, s.year, s.track_number, s.disc_number, s.duration_seconds, s.date_added, s.art_hash, COALESCE(s.is_favorite, 0) as is_favorite, s.lyrics_status FROM songs s WHERE s.duration_seconds < 180 AND s.duration_seconds > 0 ORDER BY s.title ASC LIMIT 50",
        _ => return Err("Unknown smart playlist type".to_string())
    };

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Song {
                id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                genre: row.get(5)?,
                year: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                duration_seconds: row.get(9)?,
                date_added: row.get(10)?,
                art_hash: row.get(11)?,
                is_favorite: row.get(12)?,
                lyrics_status: row.get(13).unwrap_or(Some("UNKNOWN".to_string())),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut songs = Vec::new();
    for row in rows {
        if let Ok(song) = row {
            songs.push(song);
        }
    }
    Ok(songs)
}

#[tauri::command]
pub fn export_user_data(app: AppHandle) -> Result<UserDataExport, String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut export = UserDataExport {
        playlists: Vec::new(),
        favorites: Vec::new(),
    };

    // Get favorites
    let mut stmt = conn.prepare("SELECT path FROM songs WHERE is_favorite = 1").map_err(|e| e.to_string())?;
    let fav_rows = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
    for row in fav_rows {
        if let Ok(path) = row {
            export.favorites.push(path);
        }
    }

    // Get playlists
    let mut pl_stmt = conn.prepare("SELECT id, name, created_at FROM playlists").map_err(|e| e.to_string())?;
    let pl_rows = pl_stmt.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
    }).map_err(|e| e.to_string())?;

    let mut get_songs_stmt = conn.prepare(
        "SELECT s.path FROM songs s JOIN playlist_songs ps ON s.id = ps.song_id WHERE ps.playlist_id = ?1 ORDER BY ps.position ASC"
    ).map_err(|e| e.to_string())?;

    for row in pl_rows {
        if let Ok((id, name, created_at)) = row {
            let mut songs = Vec::new();
            let song_rows = get_songs_stmt.query_map([id], |r| r.get(0)).unwrap();
            for s_row in song_rows {
                if let Ok(path) = s_row {
                    songs.push(path);
                }
            }
            export.playlists.push(ExportPlaylist { name, created_at, songs });
        }
    }

    Ok(export)
}

#[tauri::command]
pub fn import_user_data(app: AppHandle, data: String) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let export: UserDataExport = serde_json::from_str(&data).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Import favorites (only if song exists)
    for fav_path in export.favorites {
        let _ = tx.execute("UPDATE songs SET is_favorite = 1 WHERE path = ?1", params![fav_path]);
    }

    // Import playlists
    for pl in export.playlists {
        // Find existing playlist or create new
        let existing_id: Option<i64> = tx.query_row(
            "SELECT id FROM playlists WHERE name = ?1",
            params![pl.name],
            |row| row.get(0)
        ).ok();

        let pl_id = if let Some(id) = existing_id {
            id
        } else {
            tx.execute("INSERT INTO playlists (name, created_at) VALUES (?1, ?2)", params![pl.name, pl.created_at]).map_err(|e| e.to_string())?;
            tx.last_insert_rowid()
        };

        // Add songs, finding their DB ids
        let mut max_pos: i64 = tx.query_row(
            "SELECT COALESCE(MAX(position), 0) FROM playlist_songs WHERE playlist_id = ?1",
            [pl_id],
            |row| row.get(0)
        ).unwrap_or(0);

        let mut find_song = tx.prepare("SELECT id FROM songs WHERE path = ?1").map_err(|e| e.to_string())?;
        for song_path in pl.songs {
            if let Ok(song_id) = find_song.query_row(params![song_path], |row| row.get::<_, i64>(0)) {
                // Ignore if already in playlist
                let exists: bool = tx.query_row("SELECT 1 FROM playlist_songs WHERE playlist_id = ?1 AND song_id = ?2", params![pl_id, song_id], |_| Ok(true)).unwrap_or(false);
                if !exists {
                    max_pos += 1;
                    let _ = tx.execute("INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?1, ?2, ?3)", params![pl_id, song_id, max_pos]);
                }
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
