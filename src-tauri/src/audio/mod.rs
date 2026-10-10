use rodio::{Decoder, OutputStreamBuilder, Sink};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufReader;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use crossbeam_channel::{unbounded, Sender};
use rusqlite::Connection;
use crate::database::get_db_path;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "message")]
pub enum PlaybackState {
    Stopped,
    Playing,
    Paused,
    Loading,
    Error(String),
}

#[derive(Clone, Serialize)]
pub struct PlaybackProgress {
    pub position: f64,
    pub duration: f64,
}

pub enum AudioCommand {
    Play(String, f64), // path, duration
    Pause,
    Resume,
    Stop,
    Seek(f64),
    SetVolume(f32),
}

pub struct AudioEngineState {
    pub tx: Sender<AudioCommand>,
    pub current_state: Arc<Mutex<PlaybackState>>,
}

pub fn init_audio_engine(app: AppHandle) -> AudioEngineState {
    let (tx, rx) = unbounded::<AudioCommand>();
    let current_state = Arc::new(Mutex::new(PlaybackState::Stopped));
    let state_clone = current_state.clone();
    
    let app_clone = app.clone();

    thread::spawn(move || {
        let stream = match OutputStreamBuilder::open_default_stream() {
            Ok(s) => s,
            Err(e) => {
                *state_clone.lock().unwrap() = PlaybackState::Error(format!("Failed to open audio output: {}", e));
                return;
            }
        };
        
        let mut sink = Sink::connect_new(&stream.mixer());
        let mut current_duration = 0.0;
        let mut volume = 1.0;
        
        loop {
            // Check for new commands
            while let Ok(cmd) = rx.try_recv() {
                match cmd {
                    AudioCommand::Play(path, duration) => {
                        *state_clone.lock().unwrap() = PlaybackState::Loading;
                        current_duration = duration;
                        
                        sink.stop(); 
                        sink = Sink::connect_new(&stream.mixer());
                        sink.set_volume(volume);
                        
                        match File::open(&path) {
                            Ok(file) => {
                                let reader = BufReader::new(file);
                                match Decoder::new(reader) {
                                    Ok(decoder) => {
                                        sink.append(decoder);
                                        sink.play();
                                        *state_clone.lock().unwrap() = PlaybackState::Playing;
                                    }
                                    Err(e) => {
                                        *state_clone.lock().unwrap() = PlaybackState::Error(format!("Decode error: {}", e));
                                    }
                                }
                            }
                            Err(e) => {
                                *state_clone.lock().unwrap() = PlaybackState::Error(format!("File error: {}", e));
                            }
                        }
                    }
                    AudioCommand::Pause => {
                        sink.pause();
                        let mut st = state_clone.lock().unwrap();
                        if *st == PlaybackState::Playing {
                            *st = PlaybackState::Paused;
                        }
                    }
                    AudioCommand::Resume => {
                        sink.play();
                        let mut st = state_clone.lock().unwrap();
                        if *st == PlaybackState::Paused {
                            *st = PlaybackState::Playing;
                        }
                    }
                    AudioCommand::Stop => {
                        sink.stop();
                        *state_clone.lock().unwrap() = PlaybackState::Stopped;
                    }
                    AudioCommand::Seek(pos) => {
                        let _ = sink.try_seek(Duration::from_secs_f64(pos));
                    }
                    AudioCommand::SetVolume(vol) => {
                        volume = vol;
                        sink.set_volume(vol);
                    }
                }
            }
            
            // Emit progress and manage state
            let state = state_clone.lock().unwrap().clone();
            if state == PlaybackState::Playing {
                if sink.empty() {
                    // Song finished naturally
                    *state_clone.lock().unwrap() = PlaybackState::Stopped;
                    let _ = app_clone.emit("playback-finished", ());
                } else {
                    let pos = sink.get_pos().as_secs_f64();
                    let _ = app_clone.emit("playback-progress", PlaybackProgress {
                        position: pos,
                        duration: current_duration,
                    });
                }
            }
            
            thread::sleep(Duration::from_millis(500));
        }
    });
    
    AudioEngineState {
        tx,
        current_state,
    }
}

#[tauri::command]
pub fn play_song(song_id: i64, state: State<'_, AudioEngineState>, app: AppHandle) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let (path, duration_seconds): (String, f64) = conn.query_row(
        "SELECT path, duration_seconds FROM songs WHERE id = ?1",
        [song_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;
    
    state.tx.send(AudioCommand::Play(path, duration_seconds)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn pause_playback(state: State<'_, AudioEngineState>) -> Result<(), String> {
    state.tx.send(AudioCommand::Pause).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn resume_playback(state: State<'_, AudioEngineState>) -> Result<(), String> {
    state.tx.send(AudioCommand::Resume).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn stop_playback(state: State<'_, AudioEngineState>) -> Result<(), String> {
    state.tx.send(AudioCommand::Stop).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn seek(position_seconds: f64, state: State<'_, AudioEngineState>) -> Result<(), String> {
    state.tx.send(AudioCommand::Seek(position_seconds)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_volume(volume: f32, state: State<'_, AudioEngineState>) -> Result<(), String> {
    state.tx.send(AudioCommand::SetVolume(volume)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_playback_state(state: State<'_, AudioEngineState>) -> Result<PlaybackState, String> {
    let current = state.current_state.lock().unwrap().clone();
    Ok(current)
}
