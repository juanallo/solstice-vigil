import { useCallback, useEffect, useRef, useState } from "react";
import titleSrc from "../../music/The_Wheel_of_Sediment.mp3?url";
import gameSrc from "../../music/Vigil_of_the_Still_Valley.mp3?url";

const MUTE_KEY = "solstice-vigil-audio-muted";
export const VOLUME = 0.6;
export const DUCKED_VOLUME = 0.18;

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch { /* ignore */ }
}

export function useGameAudio(isTitleScreen: boolean) {
  const [audioEnabled, setAudioEnabled] = useState(() => !loadMuted());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blockedRef = useRef(false);
  const duckedRef = useRef(false);

  useEffect(() => {
    const audio = new Audio();
    audio.volume = duckedRef.current ? DUCKED_VOLUME : VOLUME;
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioEnabled) {
      audio.pause();
      return;
    }

    const track = isTitleScreen ? "title" : "game";
    if (audio.dataset.track !== track) {
      audio.pause();
      audio.loop = !isTitleScreen;
      audio.src = isTitleScreen ? titleSrc : gameSrc;
      audio.dataset.track = track;
      audio.currentTime = 0;
      audio.volume = duckedRef.current ? DUCKED_VOLUME : VOLUME;
    }

    audio.play().then(() => {
      blockedRef.current = false;
    }).catch(() => {
      blockedRef.current = true;
    });
  }, [isTitleScreen, audioEnabled]);

  const unlockAudio = useCallback(() => {
    if (!audioEnabled || !blockedRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().then(() => {
      blockedRef.current = false;
    }).catch(() => { /* still blocked */ });
  }, [audioEnabled]);

  const toggleAudio = useCallback(() => {
    setAudioEnabled((prev) => {
      const next = !prev;
      saveMuted(!next);
      return next;
    });
  }, []);

  const duckMusic = useCallback((duck: boolean) => {
    duckedRef.current = duck;
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = duck ? DUCKED_VOLUME : VOLUME;
  }, []);

  return { audioEnabled, toggleAudio, unlockAudio, duckMusic };
}
