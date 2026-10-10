use crate::metadata::SongMetadata;
use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub mod phase4;

#[derive(Debug, Serialize, Deserialize)]
pub struct Song {
    pub id: i64,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub genre: String,
    pub year: Option<u32>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub duration_seconds: f64,
    pub date_added: String,
    pub art_hash: Option<String>,
    pub is_favorite: bool,
    pub lyrics_status: Option<String>,
}

pub fn get_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    path.push("nebula.db");
    Ok(path)
}

pub fn init_db(app: &AppHandle) -> Result<(), String> {
    let db_path = get_db_path(app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS songs (
            id INTEGER PRIMARY KEY,
            path TEXT UNIQUE NOT NULL,
            title TEXT,
            artist TEXT,
            album TEXT,
            genre TEXT,
            year INTEGER,
            track_number INTEGER,
            disc_number INTEGER,
            duration_seconds REAL,
            date_added TEXT,
            art_hash TEXT
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Migration for existing databases from MVP
    let _ = conn.execute("ALTER TABLE songs ADD COLUMN art_hash TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE songs ADD COLUMN is_favorite BOOLEAN DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE songs ADD COLUMN lyrics_status TEXT DEFAULT 'UNKNOWN'",
        [],
    );

    // FTS5 Virtual Table for Instant Global Search
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS songs_fts USING fts5(id UNINDEXED, title, artist, album, genre)",
        [],
    ).map_err(|e| format!("Failed to create FTS5 table: {}", e))?;

    // Triggers for syncing FTS
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS songs_ai AFTER INSERT ON songs BEGIN
            INSERT INTO songs_fts(id, title, artist, album, genre) 
            VALUES (new.id, new.title, new.artist, new.album, new.genre);
        END;",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS songs_au AFTER UPDATE ON songs BEGIN
            DELETE FROM songs_fts WHERE id = old.id;
            INSERT INTO songs_fts(id, title, artist, album, genre) 
            VALUES (new.id, new.title, new.artist, new.album, new.genre);
        END;",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS songs_ad AFTER DELETE ON songs BEGIN
            DELETE FROM songs_fts WHERE id = old.id;
        END;",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Backfill FTS if empty but songs exist
    let fts_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM songs_fts", [], |row| row.get(0))
        .unwrap_or(0);
    if fts_count == 0 {
        let _ = conn.execute(
            "INSERT INTO songs_fts(id, title, artist, album, genre)
             SELECT id, title, artist, album, genre FROM songs",
            [],
        );
    }

    // Phase 4 Tables
    conn.execute(
        "CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS playlist_songs (
            playlist_id INTEGER,
            song_id INTEGER,
            position INTEGER,
            PRIMARY KEY (playlist_id, song_id),
            FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY,
            song_id INTEGER,
            started_at TEXT NOT NULL,
            completed BOOLEAN,
            FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Add indexes for Performance Hardening
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_artist ON songs (artist)",
        [],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_album ON songs (album)", [])
        .map_err(|e| e.to_string())?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_title ON songs (title)", [])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_history_started ON history (started_at DESC)",
        [],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn upsert_song(conn: &Connection, meta: &SongMetadata) -> Result<Option<i64>, String> {
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM songs WHERE path = ?1",
            params![meta.path],
            |_| Ok(true),
        )
        .unwrap_or(false);

    let date_added = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO songs (
            path, title, artist, album, genre, year, track_number, disc_number, duration_seconds, date_added, art_hash
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        ON CONFLICT(path) DO UPDATE SET
            title = excluded.title,
            artist = excluded.artist,
            album = excluded.album,
            genre = excluded.genre,
            year = excluded.year,
            track_number = excluded.track_number,
            disc_number = excluded.disc_number,
            duration_seconds = excluded.duration_seconds,
            art_hash = excluded.art_hash",
        params![
            meta.path, meta.title, meta.artist, meta.album, meta.genre,
            meta.year, meta.track_number, meta.disc_number, meta.duration_seconds,
            date_added, meta.art_hash
        ],
    ).map_err(|e| e.to_string())?;

    if !exists {
        let id: i64 = conn
            .query_row(
                "SELECT id FROM songs WHERE path = ?1",
                params![meta.path],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(Some(id))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn get_all_songs(app: AppHandle) -> Result<Vec<Song>, String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, path, title, artist, album, genre, year, track_number, disc_number, duration_seconds, date_added, art_hash, COALESCE(is_favorite, 0) as is_favorite, lyrics_status
         FROM songs 
         ORDER BY artist, album, track_number"
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
        songs.push(row.map_err(|e| e.to_string())?);
    }

    Ok(songs)
}

#[tauri::command]
pub fn get_song_count(app: AppHandle) -> Result<i64, String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM songs", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(count)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResultGroup {
    pub type_name: String,
    pub items: Vec<Song>,
}

#[tauri::command]
pub fn search_library(app: AppHandle, query: String) -> Result<Vec<SearchResultGroup>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let sanitized_query = query.replace("\"", "").replace("'", "");
    let mut fts_query = String::new();
    for word in sanitized_query.split_whitespace() {
        fts_query.push_str(&format!("\"{}\"* ", word));
    }
    let fts_query = fts_query.trim();

    let mut stmt = conn.prepare(
        "SELECT s.id, s.path, s.title, s.artist, s.album, s.genre, s.year, s.track_number, s.disc_number, s.duration_seconds, s.date_added, s.art_hash, COALESCE(s.is_favorite, 0) as is_favorite, s.lyrics_status
         FROM songs s
         JOIN songs_fts f ON s.id = f.id
         WHERE songs_fts MATCH ?1
         ORDER BY rank
         LIMIT 100"
    ).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([fts_query], |row| {
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

    let mut artists_group = Vec::new();
    let mut albums_group = Vec::new();
    let mut songs_group = Vec::new();

    let mut seen_artists = std::collections::HashSet::new();
    let mut seen_albums = std::collections::HashSet::new();

    let l_query = sanitized_query.to_lowercase();

    for song in songs {
        let l_artist = song.artist.to_lowercase();
        let l_album = song.album.to_lowercase();

        if l_artist.contains(&l_query) && !seen_artists.contains(&l_artist) {
            seen_artists.insert(l_artist);
            artists_group.push(Song {
                id: song.id,
                path: "".to_string(),
                title: "".to_string(),
                artist: song.artist.clone(),
                album: "".to_string(),
                genre: "".to_string(),
                year: None,
                track_number: None,
                disc_number: None,
                duration_seconds: 0.0,
                date_added: "".to_string(),
                art_hash: song.art_hash.clone(),
                is_favorite: false,
                lyrics_status: None,
            });
        }
        if l_album.contains(&l_query) && !seen_albums.contains(&l_album) {
            seen_albums.insert(l_album);
            albums_group.push(Song {
                id: song.id,
                path: "".to_string(),
                title: "".to_string(),
                artist: song.artist.clone(),
                album: song.album.clone(),
                genre: "".to_string(),
                year: None,
                track_number: None,
                disc_number: None,
                duration_seconds: 0.0,
                date_added: "".to_string(),
                art_hash: song.art_hash.clone(),
                is_favorite: false,
                lyrics_status: None,
            });
        }

        songs_group.push(song);
    }

    artists_group.truncate(5);
    albums_group.truncate(5);
    songs_group.truncate(20);

    let mut result = Vec::new();
    if !songs_group.is_empty() {
        result.push(SearchResultGroup {
            type_name: "Songs".to_string(),
            items: songs_group,
        });
    }
    if !artists_group.is_empty() {
        result.push(SearchResultGroup {
            type_name: "Artists".to_string(),
            items: artists_group,
        });
    }
    if !albums_group.is_empty() {
        result.push(SearchResultGroup {
            type_name: "Albums".to_string(),
            items: albums_group,
        });
    }

    Ok(result)
}
