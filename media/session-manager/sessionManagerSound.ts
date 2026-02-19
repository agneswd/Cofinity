let audioContext: AudioContext | undefined;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  return audioContext;
}

export function primeRequestSound(): void {
  const context = getAudioContext();
  if (context.state === 'suspended') {
    void context.resume();
  }
}

export function playRequestSound(): void {
  const context = getAudioContext();
  const playToneSequence = (): void => {
    const now = context.currentTime;
    const envelope = 0.08;
    const tones = [660, 880];

    tones.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * 0.12;
      const end = start + envelope;

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end);
    });
  };

  if (context.state === 'suspended') {
    void context.resume().then(playToneSequence);
    return;
  }

  playToneSequence();
}
