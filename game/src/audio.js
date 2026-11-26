// Meridian Run — every sound is synthesized with Web Audio: no audio files, no network.
// One job: engine hum, wind, and the chime / thud / fanfare that tell the pilot what happened.

export function createSoundEngine() {
  const engine = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    windGain: null,
    muted: false,
    started: false,

    // Browsers only let audio start after a user gesture; call this from one.
    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') void this.ctx.resume();
        return;
      }
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngineLoop();
    },

    startEngineLoop() {
      // Engine: two detuned sawtooth oscillators through a low-pass filter.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 70;
      const second = this.ctx.createOscillator();
      second.type = 'sawtooth';
      second.frequency.value = 71.5;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      this.engineOsc.connect(filter);
      second.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      second.start();
      this._secondOsc = second;
      this._filter = filter;

      // Wind: looped filtered noise whose gain follows airspeed.
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 600;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.0;
      noise.connect(windFilter);
      windFilter.connect(this.windGain);
      this.windGain.connect(this.master);
      noise.start();
      this.started = true;
    },

    // Called every frame while flying: engine pitch follows throttle, wind follows speed.
    updateEngine(throttle, speed, flying) {
      if (!this.ctx || !this.started) return;
      const t = this.ctx.currentTime;
      const target = flying ? 0.05 + (throttle / 100) * 0.075 : 0.0;
      this.engineGain.gain.setTargetAtTime(target, t, 0.1);
      this.engineOsc.frequency.setTargetAtTime(58 + throttle * 0.9, t, 0.1);
      this._secondOsc.frequency.setTargetAtTime(59.5 + throttle * 0.9, t, 0.1);
      this._filter.frequency.setTargetAtTime(320 + throttle * 6, t, 0.1);
      this.windGain.gain.setTargetAtTime(flying ? Math.min(0.12, speed / 2400) : 0.0, t, 0.15);
    },

    setMuted(muted) {
      this.muted = muted;
      if (this.master) this.master.gain.value = muted ? 0 : 0.5;
    },

    // One-shot blip: a short oscillator note with a quick decay.
    blip(freq, duration, type, volume) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(volume || 0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    },

    // Ring chime: two rising notes — the sound of a clean pass.
    ringChime() {
      this.blip(880, 0.18, 'sine', 0.3);
      setTimeout(() => this.blip(1318, 0.28, 'sine', 0.3), 90);
    },

    // Pick-up jingle: a quick three-note climb.
    pickupJingle() {
      this.blip(523, 0.12, 'triangle', 0.28);
      setTimeout(() => this.blip(659, 0.12, 'triangle', 0.28), 80);
      setTimeout(() => this.blip(784, 0.22, 'triangle', 0.3), 160);
    },

    // Collision thud: low noise burst plus a dull tone.
    collisionThud() {
      this.blip(90, 0.3, 'square', 0.35);
      this.blip(55, 0.4, 'sine', 0.4);
    },

    // Stall warning: a harsh two-tone warble.
    stallWarning() {
      this.blip(440, 0.14, 'square', 0.2);
      setTimeout(() => this.blip(330, 0.14, 'square', 0.2), 150);
    },

    // Crash: a long low rumble that fades.
    crashSound() {
      this.blip(70, 0.9, 'sawtooth', 0.45);
      this.blip(45, 1.2, 'sine', 0.45);
    },

    // Win fanfare: a rising major arpeggio.
    winFanfare() {
      const notes = [523, 659, 784, 1046, 1318];
      notes.forEach((freq, i) => setTimeout(() => this.blip(freq, 0.35, 'triangle', 0.3), i * 130));
    },

    // Click for menu buttons.
    click() {
      this.blip(1200, 0.06, 'sine', 0.18);
    },
  };
  return engine;
}
