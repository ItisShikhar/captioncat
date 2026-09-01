import { useCallback, useEffect, useState } from 'react';

function clampPlaybackTimeSeconds(timeSeconds: number, durationSeconds: number): number {
  if (!Number.isFinite(timeSeconds)) return 0;
  return Math.min(durationSeconds, Math.max(0, timeSeconds));
}

export function usePreviewPlaybackPosition(durationSeconds: number, resetKey?: object) {
  const normalizedDurationSeconds =
    Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [seekRequest, setSeekRequest] = useState({ id: 0, timeMs: 0 });

  useEffect(() => {
    setCurrentTimeSeconds((current) =>
      clampPlaybackTimeSeconds(current, normalizedDurationSeconds),
    );
  }, [normalizedDurationSeconds]);

  useEffect(() => {
    setCurrentTimeSeconds(0);
    setSeekRequest((current) => ({
      id: current.id + 1,
      timeMs: 0,
    }));
  }, [resetKey]);

  const onPlaybackTimeChange = useCallback(
    (timeMs: number): void => {
      const nextTimeSeconds = Number.isFinite(timeMs)
        ? clampPlaybackTimeSeconds(timeMs / 1000, normalizedDurationSeconds)
        : 0;
      const roundedTimeSeconds = Math.round(nextTimeSeconds * 1000) / 1000;
      setCurrentTimeSeconds((current) =>
        Math.abs(current - roundedTimeSeconds) < 0.001 ? current : roundedTimeSeconds,
      );
    },
    [normalizedDurationSeconds],
  );

  const onSeek = useCallback(
    (timeSeconds: number): void => {
      const nextTimeSeconds = clampPlaybackTimeSeconds(timeSeconds, normalizedDurationSeconds);
      setCurrentTimeSeconds(nextTimeSeconds);
      setSeekRequest((current) => ({
        id: current.id + 1,
        timeMs: nextTimeSeconds * 1000,
      }));
    },
    [normalizedDurationSeconds],
  );

  return {
    currentTimeSeconds,
    onPlaybackTimeChange,
    onSeek,
    seekRequestId: seekRequest.id,
    seekTimeMs: seekRequest.timeMs,
  };
}
