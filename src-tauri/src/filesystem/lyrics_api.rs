use crate::database::{get_db_path, Song};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Deserialize)]
struct LrcLibResponse {
    #[serde(rename = "syncedLyrics")]
    synced_lyrics: Option<String>,
    #[serde(rename = "plainLyrics")]
    plain_lyrics: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct BulkFetchProgress {
    pub fetched: usize,
    pub total: usize,
    pub not_found: usize,
    pub current_song_title: String,
}

#[tauri::command]
pub async fn fetch_lyrics_online(
    app: AppHandle,
    song_id: i64,
    title: String,
    artist: String,
    duration: f64,
    path: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = reqwest::Url::parse_with_params(
        "https://lrclib.net/api/get",
        &[
            ("track_name", &title),
            ("artist_name", &artist),
            ("duration", &duration.round().to_string()),
        ],
    )
    .map_err(|e| format!("URL Error: {}", e))?;

    let res = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    if res.status().is_success() {
        if let Ok(data) = res.json::<LrcLibResponse>().await {
            let lyrics = data.synced_lyrics.or(data.plain_lyrics);
            if let Some(l) = lyrics {
                // Save to file
                let audio_path = Path::new(&path);
                let lrc_path = audio_path.with_extension("lrc");
                fs::write(&lrc_path, &l)
                    .map_err(|e| format!("Failed to save lyrics file: {}", e))?;

                // Update DB
                conn.execute(
                    "UPDATE songs SET lyrics_status = 'LOCAL' WHERE id = ?1",
                    params![song_id],
                )
                .map_err(|e| e.to_string())?;

                return Ok(l);
            }
        }
    }

    // Fallback to /api/search
    let search_url = reqwest::Url::parse_with_params(
        "https://lrclib.net/api/search",
        &[
            ("track_name", &title),
            ("artist_name", &artist),
        ],
    )
    .map_err(|e| format!("URL Error: {}", e))?;

    if let Ok(search_res) = client.get(search_url).send().await {
        if search_res.status().is_success() {
            if let Ok(data_list) = search_res.json::<Vec<LrcLibResponse>>().await {
                if let Some(best_match) = data_list.into_iter().find(|d| d.synced_lyrics.is_some() || d.plain_lyrics.is_some()) {
                    let lyrics = best_match.synced_lyrics.or(best_match.plain_lyrics);
                    if let Some(l) = lyrics {
                        let audio_path = Path::new(&path);
                        let lrc_path = audio_path.with_extension("lrc");
                        fs::write(&lrc_path, &l)
                            .map_err(|e| format!("Failed to save lyrics file: {}", e))?;

                        conn.execute(
                            "UPDATE songs SET lyrics_status = 'LOCAL' WHERE id = ?1",
                            params![song_id],
                        )
                        .map_err(|e| e.to_string())?;

                        return Ok(l);
                    }
                }
            }
        }
    }

    // If 404 or no lyrics found in response
    conn.execute(
        "UPDATE songs SET lyrics_status = 'NOT_FOUND' WHERE id = ?1",
        params![song_id],
    )
    .map_err(|e| e.to_string())?;

    Err("Not found online".to_string())
}

#[tauri::command]
pub async fn bulk_fetch_missing_lyrics(app: AppHandle) -> Result<(), String> {
    let db_path = get_db_path(&app)?;

    let songs = {
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, path, title, artist, duration_seconds 
             FROM songs 
             WHERE lyrics_status != 'LOCAL' OR lyrics_status IS NULL",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, f64>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut songs_to_fetch = Vec::new();
        for row in rows {
            if let Ok(s) = row {
                songs_to_fetch.push(s);
            }
        }
        songs_to_fetch
    };

    let total = songs.len();
    let mut fetched = 0;
    let mut not_found = 0;

    let client = reqwest::Client::new();

    for (id, path, title, artist, duration) in songs {
        let _ = app.emit(
            "bulk_fetch_progress",
            BulkFetchProgress {
                fetched,
                total,
                not_found,
                current_song_title: title.clone(),
            },
        );

        let url = reqwest::Url::parse_with_params(
            "https://lrclib.net/api/get",
            &[
                ("track_name", &title),
                ("artist_name", &artist),
                ("duration", &duration.round().to_string()),
            ],
        )
        .unwrap();

        let mut found_lyrics = false;

        match client.get(url).send().await {
            Ok(res) => {
                if res.status().is_success() {
                    if let Ok(data) = res.json::<LrcLibResponse>().await {
                        let lyrics = data.synced_lyrics.or(data.plain_lyrics);
                        if let Some(l) = lyrics {
                            let audio_path = Path::new(&path);
                            let lrc_path = audio_path.with_extension("lrc");
                            if fs::write(&lrc_path, &l).is_ok() {
                                fetched += 1;
                                let conn = Connection::open(&db_path).unwrap();
                                let _ = conn.execute(
                                    "UPDATE songs SET lyrics_status = 'LOCAL' WHERE id = ?1",
                                    params![id],
                                );
                                found_lyrics = true;
                            }
                        }
                    }
                }
            }
            Err(_) => {}
        }

        if !found_lyrics {
            let search_url = reqwest::Url::parse_with_params(
                "https://lrclib.net/api/search",
                &[
                    ("track_name", &title),
                    ("artist_name", &artist),
                ],
            )
            .unwrap();

            if let Ok(search_res) = client.get(search_url).send().await {
                if search_res.status().is_success() {
                    if let Ok(data_list) = search_res.json::<Vec<LrcLibResponse>>().await {
                        if let Some(best_match) = data_list.into_iter().find(|d| d.synced_lyrics.is_some() || d.plain_lyrics.is_some()) {
                            let lyrics = best_match.synced_lyrics.or(best_match.plain_lyrics);
                            if let Some(l) = lyrics {
                                let audio_path = Path::new(&path);
                                let lrc_path = audio_path.with_extension("lrc");
                                if fs::write(&lrc_path, &l).is_ok() {
                                    fetched += 1;
                                    let conn = Connection::open(&db_path).unwrap();
                                    let _ = conn.execute(
                                        "UPDATE songs SET lyrics_status = 'LOCAL' WHERE id = ?1",
                                        params![id],
                                    );
                                    found_lyrics = true;
                                }
                            }
                        }
                    }
                }
            }
        }

        if !found_lyrics {
            not_found += 1;
            let conn = Connection::open(&db_path).unwrap();
            let _ = conn.execute(
                "UPDATE songs SET lyrics_status = 'NOT_FOUND' WHERE id = ?1",
                params![id],
            );
        }

        tokio::time::sleep(Duration::from_millis(500)).await;
    }

    let _ = app.emit(
        "bulk_fetch_progress",
        BulkFetchProgress {
            fetched,
            total,
            not_found,
            current_song_title: "Completed".to_string(),
        },
    );

    Ok(())
}

pub async fn bulk_fetch_specific_lyrics(app: AppHandle, song_ids: Vec<i64>) -> Result<(), String> {
    let db_path = get_db_path(&app)?;

    let songs = {
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

        let placeholders = vec!["?"; song_ids.len()].join(", ");
        let query = format!(
            "SELECT id, path, title, artist, duration_seconds 
             FROM songs 
             WHERE id IN ({})",
            placeholders
        );

        let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

        let params_iter = song_ids.iter().map(|id| id as &dyn rusqlite::ToSql);
        let rows = stmt
            .query_map(rusqlite::params_from_iter(params_iter), |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, f64>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut songs_to_fetch = Vec::new();
        for row in rows {
            if let Ok(s) = row {
                songs_to_fetch.push(s);
            }
        }
        songs_to_fetch
    };

    let client = reqwest::Client::new();

    for (id, path, title, artist, duration) in songs {
        let url = reqwest::Url::parse_with_params(
            "https://lrclib.net/api/get",
            &[
                ("track_name", &title),
                ("artist_name", &artist),
                ("duration", &duration.round().to_string()),
            ],
        )
        .unwrap();

        let mut found_lyrics = false;

        match client.get(url).send().await {
            Ok(res) => {
                if res.status().is_success() {
                    if let Ok(data) = res.json::<LrcLibResponse>().await {
                        let lyrics = data.synced_lyrics.or(data.plain_lyrics);
                        if let Some(l) = lyrics {
                            let audio_path = Path::new(&path);
                            let lrc_path = audio_path.with_extension("lrc");
                            if fs::write(&lrc_path, &l).is_ok() {
                                let conn = Connection::open(&db_path).unwrap();
                                let _ = conn.execute(
                                    "UPDATE songs SET lyrics_status = 'LOCAL' WHERE id = ?1",
                                    params![id],
                                );
                                found_lyrics = true;
                            }
                        }
                    }
                }
            }
            Err(_) => {}
        }

        if !found_lyrics {
            let search_url = reqwest::Url::parse_with_params(
                "https://lrclib.net/api/search",
                &[
                    ("track_name", &title),
                    ("artist_name", &artist),
                ],
            )
            .unwrap();

            if let Ok(search_res) = client.get(search_url).send().await {
                if search_res.status().is_success() {
                    if let Ok(data_list) = search_res.json::<Vec<LrcLibResponse>>().await {
                        if let Some(best_match) = data_list.into_iter().find(|d| d.synced_lyrics.is_some() || d.plain_lyrics.is_some()) {
                            let lyrics = best_match.synced_lyrics.or(best_match.plain_lyrics);
                            if let Some(l) = lyrics {
                                let audio_path = Path::new(&path);
                                let lrc_path = audio_path.with_extension("lrc");
                                if fs::write(&lrc_path, &l).is_ok() {
                                    let conn = Connection::open(&db_path).unwrap();
                                    let _ = conn.execute(
                                        "UPDATE songs SET lyrics_status = 'LOCAL' WHERE id = ?1",
                                        params![id],
                                    );
                                    found_lyrics = true;
                                }
                            }
                        }
                    }
                }
            }
        }

        if !found_lyrics {
            let conn = Connection::open(&db_path).unwrap();
            let _ = conn.execute(
                "UPDATE songs SET lyrics_status = 'NOT_FOUND' WHERE id = ?1",
                params![id],
            );
        }

        tokio::time::sleep(Duration::from_millis(500)).await;
    }

    Ok(())
}
