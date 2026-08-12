"use client";

import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/formatTime";
import YouTubeMusicPanel from "./YouTubeMusicPanel";

const TABS = ["local", "youtube"] as const;
const TAB_LABELS: Record<(typeof TABS)[number], string> = {
  local: "Local",
  youtube: "YT Music",
};

export default function MusicPlayer() {
  const [source, setSource] = useState<"local" | "youtube">("local");
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

        <div className="relative grid grid-cols-2 rounded-full border border-[var(--hairline)] p-0.5">
          {/* Sliding thumb: sized to exactly half the track's inner width so
              translateX(100%) lands it flush over the second tab. */}
          <span
            aria-hidden
            className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] motion-reduce:transition-none"
            style={{
              background: "var(--accent-primary)",
              transform: `translateX(${TABS.indexOf(source) * 100}%)`,
            }}
          />
          {TABS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              aria-pressed={source === s}
              className="relative z-10 rounded-full px-2.5 py-1 font-mono text-[12px] uppercase tracking-wider transition-colors duration-300"
              style={{
                color: source === s ? "var(--bg-base)" : "var(--text-secondary)",
              }}
            >
              {TAB_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-thin mt-3 flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pr-1">
        {/* Keyed on `source` so switching tabs remounts the panel and replays
            the entry animation, sliding in from the side its tab sits on. */}
        <div
          key={source}
          className="animate-panel-in flex min-h-0 flex-1 flex-col"
          style={
            {
              "--panel-from": source === "local" ? "-10px" : "10px",
            } as React.CSSProperties
          }
        >
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
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 ease-out hover:scale-105 hover:shadow-[0_0_16px_var(--accent-glow)] active:scale-90 motion-reduce:transition-none"
                    style={{
                      background: "var(--accent-primary)",
                      color: "var(--bg-base)",
                    }}
                  >
                    {/* Keyed so the glyph pops on each play/pause swap. */}
                    <span
                      key={playing ? "pause" : "play"}
                      className="animate-icon-pop flex items-center justify-center"
                    >
                      {playing ? (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                        >
                          <rect x="3" y="2" width="4" height="12" rx="1" />
                          <rect x="9" y="2" width="4" height="12" rx="1" />
                        </svg>
                      ) : (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                        >
                          <path d="M4 2.5v11l9-5.5-9-5.5z" />
                        </svg>
                      )}
                    </span>
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

                <div className="flex justify-between font-mono text-[12px] text-[var(--text-secondary)]">
                  <span>{formatTime(current)}</span>
                  <span>{formatTime(duration)}</span>
                </div>

                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="self-start font-mono text-[12px] uppercase tracking-wider text-[var(--text-secondary)] transition-colors duration-200 hover:text-[var(--accent-secondary)]"
                >
                  Choose a different file
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="my-auto flex h-8 shrink-0 items-center gap-2 self-center rounded-full border border-[var(--hairline-strong)] px-3 text-[var(--text-secondary)] transition-all duration-200 ease-out hover:scale-[1.04] hover:border-[var(--accent-secondary)] hover:text-[var(--accent-secondary)] active:scale-95 motion-reduce:transition-none"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
                <span className="whitespace-nowrap font-mono text-[12px] uppercase tracking-wider">
                  Choose an audio file
                </span>
              </button>
            )
          ) : (
            <YouTubeMusicPanel />
          )}
        </div>
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
