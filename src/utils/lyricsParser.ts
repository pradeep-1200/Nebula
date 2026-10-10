import { LyricLine } from '../types';

export function parseLrc(lrcText: string): LyricLine[] {
  const lines = lrcText.split('\n');
  const lyrics: LyricLine[] = [];
  
  // Regex to match standard LRC tags like [01:23.45] or [01:23]
  const timeRegex = /\[(\d{2}):(\d{2}(?:\.\d{2,3})?)\]/g;
  
  for (const line of lines) {
    const text = line.replace(timeRegex, '').trim();
    if (!text) continue; // Skip empty lines
    
    let match;
    // We need to reset the regex index since we are reusing it
    const lineTimeRegex = /\[(\d{2}):(\d{2}(?:\.\d{2,3})?)\]/g;
    
    while ((match = lineTimeRegex.exec(line)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      const time = minutes * 60 + seconds;
      
      lyrics.push({ time, text });
    }
  }
  
  // Sort by time just in case tags are out of order
  lyrics.sort((a, b) => a.time - b.time);
  
  return lyrics;
}
