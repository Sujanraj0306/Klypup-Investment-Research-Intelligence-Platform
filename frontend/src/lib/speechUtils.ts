export function hasSpeechSynthesis(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function hasSpeechRecognition(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function getSpeechRecognitionCtor(): SpeechRecognitionStatic | null {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function readAloud(text: string) {
  if (!hasSpeechSynthesis() || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => v.name.includes('Google') && v.lang.startsWith('en')) ||
    voices.find((v) => v.lang === 'en-US') ||
    voices[0];
  if (preferred) utterance.voice = preferred;
  window.speechSynthesis.speak(utterance);
}

export function stopReading() {
  if (!hasSpeechSynthesis()) return;
  window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  return hasSpeechSynthesis() && window.speechSynthesis.speaking;
}
