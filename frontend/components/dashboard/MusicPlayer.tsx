"use client";

import { useEffect, useRef, useState } from "react";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function MusicPlayer() {
  const [source, setSource] = useState<"local" | "spotify">("local");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFileUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setPlaying(false);
    setCurrent(0);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play();
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    const value = Number(e.target.value);
    if (audio) audio.currentTime = value;
    setCurrent(value);
  }

  return (
    <div className="matte flex h-full flex-col rounded-2xl p-4">
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="font-serif text-[17px] font-bold text-[var(--text-primary)]">
          Music
        </h2>
        <div className="flex gap-1 rounded-full border border-[var(--hairline)] p-0.5">
          {(["local", "spotify"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors"
              style={{
                background: source === s ? "var(--accent-primary)" : "transparent",
                color: source === s ? "var(--bg-base)" : "var(--text-secondary)",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-thin mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        {source === "local" ? (
          fileUrl ? (
            <div className="flex flex-col gap-3">
              <audio
                ref={audioRef}
                src={fileUrl}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                onEnded={() => setPlaying(false)}
              />

              <p className="truncate font-serif text-[13px] font-semibold text-[var(--text-primary)]">
                {fileName}
              </p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={playing ? "Pause" : "Play"}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-shadow hover:shadow-[0_0_16px_var(--accent-glow)]"
                  style={{ background: "var(--accent-primary)", color: "var(--bg-base)" }}
                >
                  {playing ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <rect x="3" y="2" width="4" height="12" rx="1" />
                      <rect x="9" y="2" width="4" height="12" rx="1" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4 2.5v11l9-5.5-9-5.5z" />
                    </svg>
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  value={current}
                  onChange={handleSeek}
                  aria-label="Seek"
                  className="h-1 flex-1 cursor-pointer accent-[var(--accent-primary)]"
                />
              </div>

              <div className="flex justify-between font-mono text-[10px] text-[var(--text-secondary)]">
                <span>{formatTime(current)}</span>
                <span>{formatTime(duration)}</span>
              </div>

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="self-start font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--accent-secondary)]"
              >
                Choose a different file
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--hairline-strong)] py-4 text-center transition-colors hover:border-[var(--accent-secondary)]"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[var(--text-secondary)]"
              >
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                Choose an audio file
              </span>
            </button>
          )
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: "var(--bg-elevated)", color: "#1db954" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.6 14.4a.6.6 0 01-.83.2c-2.3-1.4-5.2-1.7-8.6-.9a.6.6 0 11-.27-1.17c3.7-.85 6.9-.5 9.5 1.05.3.18.4.55.2.82zm1.2-2.7a.75.75 0 01-1.04.25c-2.6-1.6-6.6-2.07-9.7-1.14a.75.75 0 11-.44-1.44c3.53-1.07 7.93-.55 10.9 1.27a.75.75 0 01.28 1.06zm.1-2.8C14.9 9 8.8 8.8 5.9 9.7a.9.9 0 11-.53-1.72c3.36-1.02 10-.78 13.6 1.36a.9.9 0 11-.92 1.55h-.15z" />
              </svg>
            </span>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
              Not connected
            </p>
            <p className="max-w-[220px] font-serif text-[11px] leading-4 text-[var(--text-secondary)]">
              Needs a Spotify Developer app. Share a client ID and I&rsquo;ll
              wire up OAuth.
            </p>
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-full px-3.5 py-1 font-mono text-[10px] uppercase tracking-wider opacity-50"
              style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
            >
              Connect Spotify
            </button>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}
