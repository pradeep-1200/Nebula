mod commands;
mod database;
mod filesystem;
mod metadata;
// mod audio;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent, Emitter};
// use audio::init_audio_engine;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                let _ = window.hide();
                api.prevent_close();
            }
            _ => {}
        })
        .setup(|app| {
            database::init_db(app.handle()).expect("Failed to initialize database");
            
            let play_pause_i = MenuItem::with_id(app, "play_pause", "Play/Pause", true, None::<&str>)?;
            let next_i = MenuItem::with_id(app, "next", "Next", true, None::<&str>)?;
            let prev_i = MenuItem::with_id(app, "prev", "Previous", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&play_pause_i, &next_i, &prev_i, &quit_i])?;
            
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "play_pause" => { let _ = app.emit("tray_event", "play_pause"); }
                        "next" => { let _ = app.emit("tray_event", "next"); }
                        "prev" => { let _ = app.emit("tray_event", "prev"); }
                        "quit" => { app.exit(0); }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            filesystem::scan_folder,
            filesystem::scan_and_read_metadata,
            filesystem::get_lyrics,
            filesystem::lyrics_api::fetch_lyrics_online,
            filesystem::lyrics_api::bulk_fetch_missing_lyrics,
            database::get_all_songs,
            database::get_song_count,
            database::search_library,
            database::phase4::toggle_favorite,
            database::phase4::create_playlist,
            database::phase4::get_playlists,
            database::phase4::add_to_playlist,
            database::phase4::remove_from_playlist,
            database::phase4::delete_playlist,
            database::phase4::reorder_playlist,
            database::phase4::get_playlist_songs,
            database::phase4::log_history,
            database::phase4::get_recently_played,
            database::phase4::get_most_played,
            database::phase4::get_smart_playlist,
            database::phase4::export_user_data,
            database::phase4::import_user_data,
            // audio::play_song,
            // audio::pause_playback,
            // audio::resume_playback,
            // audio::stop_playback,
            // audio::seek,
            // audio::set_volume,
            // audio::get_playback_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
