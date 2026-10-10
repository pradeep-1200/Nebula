import { convertFileSrc } from '@tauri-apps/api/core';

export type EngineEvent = 'progress' | 'finished' | 'error' | 'play' | 'pause';
export type EngineEventHandler = (payload?: any) => void;

class AudioEngine {
  private ctx: AudioContext | null = null;
  
  // Dual audio elements for crossfade
  private audioA: HTMLAudioElement;
  private audioB: HTMLAudioElement;
  
  // Nodes
  private sourceA: MediaElementAudioSourceNode | null = null;
  private sourceB: MediaElementAudioSourceNode | null = null;
  private gainA: GainNode | null = null;
  private gainB: GainNode | null = null;
  private eqBands: BiquadFilterNode[] = [];
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  
  // State
  private isAActive = true;
  private crossfadeDuration = 0; // seconds
  
  // Listeners
  private listeners: Record<EngineEvent, EngineEventHandler[]> = {
    progress: [],
    finished: [],
    error: [],
    play: [],
    pause: []
  };
  
  // Poll interval for progress
  private progressInterval: number | null = null;

  constructor() {
    this.audioA = new Audio();
    this.audioA.crossOrigin = 'anonymous';
    this.audioB = new Audio();
    this.audioB.crossOrigin = 'anonymous';
    
    // Bind events
    this.setupAudioEvents(this.audioA, true);
    this.setupAudioEvents(this.audioB, false);
  }
  
  private initContext() {
    if (this.ctx) return;
    
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create sources
    this.sourceA = this.ctx.createMediaElementSource(this.audioA);
    this.sourceB = this.ctx.createMediaElementSource(this.audioB);
    
    // Create individual gains for crossfading
    this.gainA = this.ctx.createGain();
    this.gainB = this.ctx.createGain();
    
    this.sourceA.connect(this.gainA);
    this.sourceB.connect(this.gainB);
    
    // Create EQ Bands (10-band)
    const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    let prevNode: AudioNode | null = null;
    
    frequencies.forEach((freq, i) => {
      const filter = this.ctx!.createBiquadFilter();
      if (i === 0) filter.type = 'lowshelf';
      else if (i === frequencies.length - 1) filter.type = 'highshelf';
      else filter.type = 'peaking';
      
      filter.frequency.value = freq;
      filter.gain.value = 0;
      
      this.eqBands.push(filter);
      
      if (prevNode) {
        prevNode.connect(filter);
      }
      prevNode = filter;
    });
    
    // Connect sources to first EQ band
    this.gainA.connect(this.eqBands[0]);
    this.gainB.connect(this.eqBands[0]);
    
    // Master Volume & Analyser
    this.masterGain = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;
    
    // Connect last EQ band to analyser, then to master gain, then to destination
    this.eqBands[this.eqBands.length - 1].connect(this.analyser);
    this.analyser.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
    
    // Start progress loop
    this.startProgressLoop();
  }
  
  private setupAudioEvents(audio: HTMLAudioElement, isA: boolean) {
    audio.addEventListener('error', () => {
      if ((isA && this.isAActive) || (!isA && !this.isAActive)) {
        this.emit('error', 'Audio playback error: Could not load file');
      }
    });
    
    audio.addEventListener('play', () => {
      if ((isA && this.isAActive) || (!isA && !this.isAActive)) {
        this.emit('play');
      }
    });
    
    audio.addEventListener('pause', () => {
      if ((isA && this.isAActive) || (!isA && !this.isAActive)) {
        this.emit('pause');
      }
    });
    
    audio.addEventListener('ended', () => {
      // For crossfade = 0, we rely strictly on this native event for true gapless transition
      if (this.crossfadeDuration === 0) {
        if ((isA && this.isAActive) || (!isA && !this.isAActive)) {
          this.emit('finished');
        }
      }
    });
  }
  
  private startProgressLoop() {
    if (this.progressInterval) clearInterval(this.progressInterval);
    this.progressInterval = window.setInterval(() => {
      const activeAudio = this.isAActive ? this.audioA : this.audioB;
      if (!activeAudio.paused && !activeAudio.ended && activeAudio.duration) {
        this.emit('progress', {
          position: activeAudio.currentTime,
          duration: activeAudio.duration
        });
        
        // Handle crossfade/gapless trigger manually
        const timeRemaining = activeAudio.duration - activeAudio.currentTime;
        if (this.crossfadeDuration > 0) {
          if (timeRemaining > 0 && timeRemaining <= this.crossfadeDuration && !activeAudio.dataset.fadeTriggered) {
            activeAudio.dataset.fadeTriggered = 'true';
            this.emit('finished'); // Tells playerStore to trigger playNext early for crossfade
          }
        }
      }
    }, 250);
  }

  public async play(path: string) {
    this.initContext();
    if (this.ctx!.state === 'suspended') {
      await this.ctx!.resume();
    }
    
    const url = convertFileSrc(path);
    
    const prevAudio = this.isAActive ? this.audioA : this.audioB;
    const prevGain = this.isAActive ? this.gainA : this.gainB;
    
    // Swap active
    this.isAActive = !this.isAActive;
    const nextAudio = this.isAActive ? this.audioA : this.audioB;
    const nextGain = this.isAActive ? this.gainA : this.gainB;
    
    nextAudio.dataset.fadeTriggered = 'false';
    nextAudio.src = url;
    
    try {
      await nextAudio.play();
      
      // Perform crossfade or gapless transition
      if (this.crossfadeDuration > 0 && !prevAudio.paused) {
        const currTime = this.ctx!.currentTime;
        // Fade out previous
        prevGain!.gain.setValueAtTime(prevGain!.gain.value, currTime);
        prevGain!.gain.linearRampToValueAtTime(0, currTime + this.crossfadeDuration);
        
        // Fade in next
        nextGain!.gain.setValueAtTime(0, currTime);
        nextGain!.gain.linearRampToValueAtTime(1, currTime + this.crossfadeDuration);
        
        // Stop previous after fade
        setTimeout(() => {
          prevAudio.pause();
          prevAudio.src = '';
        }, this.crossfadeDuration * 1000);
      } else {
        // No crossfade, this is a gapless or manual cut.
        // Let the previous audio end naturally or pause it if it's a manual seek/cut
        // (if it reached 'ended', it's already paused internally)
        prevAudio.pause();
        prevAudio.src = '';
        if (prevGain) prevGain.gain.value = 0;
        if (nextGain) nextGain.gain.value = 1;
      }
      
    } catch (err) {
      console.error(err);
      this.emit('error', 'Failed to play audio. File might be missing or corrupted.');
    }
  }

  public preload(path: string) {
    const url = convertFileSrc(path);
    const idleAudio = this.isAActive ? this.audioB : this.audioA;
    if (idleAudio.src !== url) {
      idleAudio.src = url;
      idleAudio.preload = "auto";
      idleAudio.load();
    }
  }

  public pause() {
    const activeAudio = this.isAActive ? this.audioA : this.audioB;
    activeAudio.pause();
  }

  public resume() {
    const activeAudio = this.isAActive ? this.audioA : this.audioB;
    activeAudio.play().catch(() => {});
  }

  public stop() {
    this.audioA.pause();
    this.audioA.src = '';
    this.audioB.pause();
    this.audioB.src = '';
  }

  public seek(positionSeconds: number) {
    const activeAudio = this.isAActive ? this.audioA : this.audioB;
    activeAudio.currentTime = positionSeconds;
  }

  public setVolume(volume: number) {
    this.initContext();
    if (this.masterGain) {
      this.masterGain.gain.value = volume;
    }
  }
  
  public setCrossfade(seconds: number) {
    this.crossfadeDuration = seconds;
  }
  
  public getEqBandGains(): number[] {
    return this.eqBands.map(b => b.gain.value);
  }
  
  public setEqBand(index: number, dbValue: number) {
    if (this.eqBands[index]) {
      this.eqBands[index].gain.value = dbValue;
    }
  }
  
  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public on(event: EngineEvent, handler: EngineEventHandler) {
    this.listeners[event].push(handler);
  }
  
  public off(event: EngineEvent, handler: EngineEventHandler) {
    this.listeners[event] = this.listeners[event].filter(h => h !== handler);
  }

  private emit(event: EngineEvent, payload?: any) {
    this.listeners[event].forEach(h => h(payload));
  }
}

export const engine = new AudioEngine();
