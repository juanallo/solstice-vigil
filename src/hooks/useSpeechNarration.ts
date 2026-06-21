import { useCallback, useEffect, useRef, useState } from "react";
import { pickEpicVoice, SPEECH_PITCH, SPEECH_RATE } from "../lib/speech-voice";

interface UseSpeechNarrationOptions {
  onSpeakStart?: () => void;
  onSpeakEnd?: () => void;
}

const AUTOPLAY_KEY = "solstice-vigil-narration-autoplay";

function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function loadAutoPlay(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) === "1";
  } catch {
    return false;
  }
}

function saveAutoPlay(enabled: boolean) {
  try {
    localStorage.setItem(AUTOPLAY_KEY, enabled ? "1" : "0");
  } catch { /* ignore */ }
}

export function useSpeechNarration(options: UseSpeechNarrationOptions = {}) {
  const { onSpeakStart, onSpeakEnd } = options;
  const [speaking, setSpeaking] = useState(false);
  const [supported] = useState(() => speechSupported());
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(() => loadAutoPlay());
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const genRef = useRef(0);
  const onSpeakStartRef = useRef(onSpeakStart);
  const onSpeakEndRef = useRef(onSpeakEnd);

  useEffect(() => {
    onSpeakStartRef.current = onSpeakStart;
    onSpeakEndRef.current = onSpeakEnd;
  }, [onSpeakStart, onSpeakEnd]);

  const refreshVoice = useCallback(() => {
    if (!supported) return;
    const voices = window.speechSynthesis.getVoices();
    voiceRef.current = pickEpicVoice(voices);
  }, [supported]);

  useEffect(() => {
    if (!supported) return;

    refreshVoice();
    const handleVoicesChanged = () => refreshVoice();
    window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged);
      window.speechSynthesis.cancel();
      utteranceRef.current = null;
    };
  }, [supported, refreshVoice]);

  const finishSpeaking = useCallback((gen: number) => {
    if (gen !== genRef.current) return;
    setSpeaking(false);
    utteranceRef.current = null;
    onSpeakEndRef.current?.();
  }, []);

  const stop = useCallback(() => {
    if (!supported) return;
    genRef.current += 1;
    window.speechSynthesis.cancel();
    setSpeaking((was) => {
      if (was) onSpeakEndRef.current?.();
      return false;
    });
    utteranceRef.current = null;
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      const gen = ++genRef.current;
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.rate = SPEECH_RATE;
      utterance.pitch = SPEECH_PITCH;
      if (voiceRef.current) {
        try {
          utterance.voice = voiceRef.current;
        } catch {
          /* browser rejected voice object */
        }
      }

      utterance.onstart = () => {
        if (gen !== genRef.current) return;
        setSpeaking(true);
        onSpeakStartRef.current?.();
      };
      utterance.onend = () => finishSpeaking(gen);
      utterance.onerror = () => finishSpeaking(gen);

      utteranceRef.current = utterance;
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        finishSpeaking(gen);
      }
    },
    [supported, finishSpeaking],
  );

  const toggleAutoPlay = useCallback(() => {
    setAutoPlayEnabled((prev) => {
      const next = !prev;
      saveAutoPlay(next);
      return next;
    });
  }, []);

  return { supported, speaking, autoPlayEnabled, toggleAutoPlay, speak, stop };
}
