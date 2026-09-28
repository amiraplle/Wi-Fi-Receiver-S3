/**
 * Web Audio Engine for simulating real audio playback and testing DAC pipeline.
 * Drives real-time VU peak meters and frequency spectrum analyzer.
 */

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private pannerNode: StereoPannerNode | null = null;
  private bassFilter: BiquadFilterNode | null = null;
  private trebleFilter: BiquadFilterNode | null = null;
  private analyserLeft: AnalyserNode | null = null;
  private analyserRight: AnalyserNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private synthGain: GainNode | null = null;
  private isPlaying = false;
  private currentTrack: 'synthesizer' | 'tone' | 'stream' = 'synthesizer';
  private timerId: number | null = null;

  public init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioContextClass();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.75;

    // Stereo Panner
    if (this.ctx.createStereoPanner) {
      this.pannerNode = this.ctx.createStereoPanner();
    }

    // Bass / Treble EQ filters
    this.bassFilter = this.ctx.createBiquadFilter();
    this.bassFilter.type = 'lowshelf';
    this.bassFilter.frequency.value = 250;
    this.bassFilter.gain.value = 0;

    this.trebleFilter = this.ctx.createBiquadFilter();
    this.trebleFilter.type = 'highshelf';
    this.trebleFilter.frequency.value = 4000;
    this.trebleFilter.gain.value = 0;

    // Channel Splitter & Analysers for independent L/R VU meters
    this.splitter = this.ctx.createChannelSplitter(2);
    this.analyserLeft = this.ctx.createAnalyser();
    this.analyserRight = this.ctx.createAnalyser();
    this.analyserLeft.fftSize = 256;
    this.analyserRight.fftSize = 256;
    this.analyserLeft.smoothingTimeConstant = 0.8;
    this.analyserRight.smoothingTimeConstant = 0.8;

    // Routing graph:
    // Source -> Bass -> Treble -> (Panner) -> MasterGain -> Splitter -> Analysers
    //                                      \-> Destination
    this.bassFilter.connect(this.trebleFilter);
    if (this.pannerNode) {
      this.trebleFilter.connect(this.pannerNode);
      this.pannerNode.connect(this.masterGain);
    } else {
      this.trebleFilter.connect(this.masterGain);
    }

    this.masterGain.connect(this.ctx.destination);
    this.masterGain.connect(this.splitter);
    this.splitter.connect(this.analyserLeft, 0);
    this.splitter.connect(this.analyserRight, 1);
  }

  public setVolume(vol: number) {
    if (!this.masterGain || !this.ctx) return;
    const clamped = Math.max(0, Math.min(100, vol)) / 100;
    this.masterGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.05);
  }

  public setMute(muted: boolean, currentVol: number) {
    if (!this.masterGain || !this.ctx) return;
    const target = muted ? 0 : Math.max(0, Math.min(100, currentVol)) / 100;
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
  }

  public setBalance(balanceVal: number) { // -50 to +50
    if (!this.pannerNode || !this.ctx) return;
    const normalized = Math.max(-1, Math.min(1, balanceVal / 50));
    this.pannerNode.pan.setTargetAtTime(normalized, this.ctx.currentTime, 0.05);
  }

  public setEQ(bassDb: number, trebleDb: number) {
    if (!this.ctx) return;
    if (this.bassFilter) {
      this.bassFilter.gain.setTargetAtTime(bassDb, this.ctx.currentTime, 0.05);
    }
    if (this.trebleFilter) {
      this.trebleFilter.gain.setTargetAtTime(trebleDb, this.ctx.currentTime, 0.05);
    }
  }

  public playSimulator() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.isPlaying) return;

    this.isPlaying = true;

    // Harmonic warm synth chord progression resembling real streamed audio
    const notes = [220, 261.63, 329.63, 392.0]; // A minor 7 chord
    let noteIdx = 0;

    this.osc1 = this.ctx.createOscillator();
    this.osc2 = this.ctx.createOscillator();
    this.synthGain = this.ctx.createGain();

    this.osc1.type = 'sawtooth';
    this.osc2.type = 'sine';
    this.osc1.frequency.value = notes[0];
    this.osc2.frequency.value = notes[2];

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;

    this.synthGain.gain.value = 0.22;

    this.osc1.connect(filter);
    this.osc2.connect(filter);
    filter.connect(this.synthGain);
    if (this.bassFilter) {
      this.synthGain.connect(this.bassFilter);
    }

    this.osc1.start();
    this.osc2.start();

    // Subtle gentle arpeggio cadence
    this.timerId = window.setInterval(() => {
      if (!this.ctx || !this.osc1 || !this.osc2) return;
      noteIdx = (noteIdx + 1) % notes.length;
      const baseFreq = notes[noteIdx];
      this.osc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.1);
      this.osc2.frequency.setTargetAtTime(baseFreq * 1.5, this.ctx.currentTime, 0.1);
    }, 1800);
  }

  public pauseSimulator() {
    if (!this.isPlaying) return;
    this.stopSimulator();
  }

  public stopSimulator() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.osc1) {
      try { this.osc1.stop(); this.osc1.disconnect(); } catch {}
      this.osc1 = null;
    }
    if (this.osc2) {
      try { this.osc2.stop(); this.osc2.disconnect(); } catch {}
      this.osc2 = null;
    }
    if (this.synthGain) {
      this.synthGain.disconnect();
      this.synthGain = null;
    }
    this.isPlaying = false;
  }

  public getLevels(): { left: number; right: number; dataArray: Uint8Array } {
    if (!this.analyserLeft || !this.analyserRight || !this.isPlaying) {
      return { left: 0, right: 0, dataArray: new Uint8Array(64) };
    }

    const dataLeft = new Uint8Array(this.analyserLeft.frequencyBinCount);
    const dataRight = new Uint8Array(this.analyserRight.frequencyBinCount);
    this.analyserLeft.getByteFrequencyData(dataLeft);
    this.analyserRight.getByteFrequencyData(dataRight);

    let sumL = 0;
    for (let i = 0; i < dataLeft.length; i++) sumL += dataLeft[i];
    let sumR = 0;
    for (let i = 0; i < dataRight.length; i++) sumR += dataRight[i];

    const avgL = sumL / (dataLeft.length * 255);
    const avgR = sumR / (dataRight.length * 255);

    // Also get combined frequency array for spectrum
    const spectrum = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      spectrum[i] = Math.max(dataLeft[i] || 0, dataRight[i] || 0);
    }

    return {
      left: Math.min(1, avgL * 2.2),
      right: Math.min(1, avgR * 2.2),
      dataArray: spectrum,
    };
  }

  public getWaveformData(): Uint8Array {
    if (!this.analyserLeft || !this.isPlaying) {
      const empty = new Uint8Array(128);
      empty.fill(128);
      return empty;
    }
    const data = new Uint8Array(128);
    this.analyserLeft.getByteTimeDomainData(data);
    return data;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

export const audioEngine = new AudioEngine();
