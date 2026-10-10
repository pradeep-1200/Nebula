use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;
#[derive(Debug, Serialize, Deserialize)]
pub struct SongMetadata {
    pub path: String,
    pub filename: String,
    pub size_bytes: u64,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub genre: String,
    pub year: Option<u32>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub duration_seconds: f64,
    pub art_hash: Option<String>,
}

pub fn extract_metadata(
    path: &str,
    size_bytes: u64,
    filename: &str,
    artwork_dir: &Path,
) -> Result<SongMetadata, String> {
    let p = Path::new(path);

    let tagged_file = Probe::open(p)
        .map_err(|e| e.to_string())?
        .read()
        .map_err(|e| e.to_string())?;

    let properties = tagged_file.properties();
    let duration_seconds = properties.duration().as_secs_f64();

    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag());

    let title_fallback = p
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| filename.to_string());

    let mut metadata = SongMetadata {
        path: path.to_string(),
        filename: filename.to_string(),
        size_bytes,
        title: title_fallback,
        artist: "Unknown Artist".to_string(),
        album: "Unknown Album".to_string(),
        genre: "".to_string(),
        year: None,
        track_number: None,
        disc_number: None,
        duration_seconds,
        art_hash: None,
    };

    let mut picture_data: Option<Vec<u8>> = None;

    if let Some(tag) = tag {
        if let Some(title) = tag.title() {
            if !title.is_empty() {
                metadata.title = title.to_string();
            }
        }
        if let Some(artist) = tag.artist() {
            if !artist.is_empty() {
                metadata.artist = artist.to_string();
            }
        }
        if let Some(album) = tag.album() {
            if !album.is_empty() {
                metadata.album = album.to_string();
            }
        }
        if let Some(genre) = tag.genre() {
            if !genre.is_empty() {
                metadata.genre = genre.to_string();
            }
        }
        if let Some(item) = tag.get(ItemKey::Year) {
            if let lofty::tag::ItemValue::Text(val) = item.value() {
                if let Ok(y) = val.parse::<u32>() {
                    metadata.year = Some(y);
                }
            }
        }
        if let Some(track) = tag.track() {
            metadata.track_number = Some(track);
        }
        if let Some(disc) = tag.disk() {
            metadata.disc_number = Some(disc);
        }

        if let Some(pic) = tag.pictures().first() {
            picture_data = Some(pic.data().to_vec());
        }
    }

    let hash_input = format!("{}-{}", metadata.album, metadata.artist);
    let mut hasher = Sha256::new();
    hasher.update(hash_input.as_bytes());
    let hash_bytes = hasher.finalize();
    let hash_result = hash_bytes
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>();
    let art_path = artwork_dir.join(format!("{}.jpg", hash_result));

    let mut has_saved_art = false;

    if !art_path.exists() {
        // Try embedded picture
        if let Some(data) = picture_data {
            if let Ok(img) = image::load_from_memory(&data) {
                let resized = img.thumbnail(300, 300);
                if resized.save(&art_path).is_ok() {
                    has_saved_art = true;
                }
            }
        }

        // Try folder picture
        if !has_saved_art {
            if let Some(parent) = p.parent() {
                let candidates = ["cover.jpg", "cover.png", "folder.jpg", "folder.png"];
                for candidate in candidates {
                    let candidate_path = parent.join(candidate);
                    if candidate_path.exists() {
                        if let Ok(img) = image::open(&candidate_path) {
                            let resized = img.thumbnail(300, 300);
                            if resized.save(&art_path).is_ok() {
                                has_saved_art = true;
                                break;
                            }
                        }
                    }
                }
            }
        }
    } else {
        has_saved_art = true;
    }

    if has_saved_art {
        metadata.art_hash = Some(hash_result);
    }

    Ok(metadata)
}
