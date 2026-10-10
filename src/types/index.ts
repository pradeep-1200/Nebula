export interface Song {
  id: number;
  path: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number | null;
  track_number: number | null;
  disc_number: number | null;
  duration_seconds: number;
  date_added: string;
  art_hash: string | null;
  is_favorite: boolean;
  lyrics_status?: string;
}

export interface Playlist {
  id: number;
  name: string;
  created_at: string;
}

export interface LyricLine {
  time: number; // in seconds
  text: string;
}
