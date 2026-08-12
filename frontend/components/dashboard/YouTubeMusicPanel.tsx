"use client";

import { useEffect, useRef, useState } from "react";
import {
  disconnectYtMusic,
  getYtMusicAuthStatus,
  getYtMusicLibraryPlaylists,
  getYtMusicPlaylistTracks,
  pollYtMusicDeviceAuth,
  searchYtMusic,
  startYtMusicDeviceAuth,
  type DeviceAuthStart,
  type YtPlaylist,
  type YtTrack,
} from "@/lib/ytmusic";
import { formatTime } from "@/lib/formatTime";
import { loadYouTubeIframeApi, type YTPlayer } from "@/lib/youtubeIframePlayer";

type View = "search" | "playlists" | "playlist-tracks";

export default function YouTubeMusicPanel() {
  const [connected, setConnected] = useState<boolean | null>(null); // null = still checking
  const [deviceAuth, setDeviceAuth] = useState<DeviceAuthStart | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [codeCopied, setCodeCopied] = useState(false);

  const [view, setView] = useState<View>("search");
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<YtTrack[]>([]);
  const [playlists, setPlaylists] = useState<YtPlaylist[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<YtPlaylist | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [currentTrack, setCurrentTrack] = useState<YtTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const pendingVideoIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getYtMusicAuthStatus()
      .then((res) => {
        if (!cancelled) setConnected(res.connected);
      })
      .catch(() => {
        if (!cancelled) setConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sets up the official YouTube IFrame Player once; torn down on unmount.
  useEffect(() => {
    let destroyed = false;
    loadYouTubeIframeApi().then(() => {
      if (destroyed || !playerContainerRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(playerContainerRef.current, {
        height: "64",
        width: "64",
        playerVars: { playsinline: 1 },
        events: {
          onReady: () => {
            if (pendingVideoIdRef.current) {
              playerRef.current?.loadVideoById(pendingVideoIdRef.current);
              pendingVideoIdRef.current = null;
            }
          },
          onStateChange: (e) => setIsPlaying(e.data === 1),
        },
      });
    });
    return () => {
      destroyed = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      setCurrent(player.getCurrentTime());
      setDuration(player.getDuration());
    }, 500);
    return () => clearInterval(id);
  }, [isPlaying]);

  useEffect(() => {
    if (!deviceAuth) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await pollYtMusicDeviceAuth();
        if (cancelled) return;
        if (res.status === "connected") {
          setConnected(true);
          setDeviceAuth(null);
        } else if (res.status === "denied") {
          setAuthError("Authorization was denied.");
          setDeviceAuth(null);
        } else if (res.status === "expired") {
          setAuthError("Authorization code expired — try connecting again.");
          setDeviceAuth(null);
        }
      } catch (err) {
        if (!cancelled) {
          setAuthError(
            err instanceof Error ? err.message : "YouTube Music auth failed.",
          );
          setDeviceAuth(null);
        }
      }
    };

    const id = setInterval(poll, deviceAuth.interval * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [deviceAuth]);

  async function handleConnect() {
    setAuthError(null);
    try {
      const res = await startYtMusicDeviceAuth();
      setDeviceAuth(res);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : "Couldn't start YouTube Music login.",
      );
    }
  }

  function handleCopyCode() {
    if (!deviceAuth) return;
    navigator.clipboard.writeText(deviceAuth.user_code).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1200);
    });
  }

  function handleDisconnect() {
    disconnectYtMusic().catch(() => {});
    setConnected(false);
    setTracks([]);
    setPlaylists([]);
    setActivePlaylist(null);
    setCurrentTrack(null);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setView("search");
    setListLoading(true);
    setListError(null);
    try {
      setTracks(await searchYtMusic(query.trim()));
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setListLoading(false);
    }
  }

  async function openLibrary() {
    setView("playlists");
    setActivePlaylist(null);
    setListLoading(true);
    setListError(null);
    try {
      setPlaylists(await getYtMusicLibraryPlaylists());
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Couldn't load your library.");
    } finally {
      setListLoading(false);
    }
  }

  async function openPlaylist(playlist: YtPlaylist) {
    setView("playlist-tracks");
    setActivePlaylist(playlist);
    setListLoading(true);
    setListError(null);
    try {
      setTracks(await getYtMusicPlaylistTracks(playlist.playlistId));
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Couldn't load playlist.");
    } finally {
      setListLoading(false);
    }
  }

  function playTrack(track: YtTrack) {
    setCurrentTrack(track);
    setIsPlaying(true);
    if (playerRef.current) {
      playerRef.current.loadVideoById(track.videoId);
    } else {
      pendingVideoIdRef.current = track.videoId;
    }
  }

  function togglePlay() {
    const player = playerRef.current;
    if (!player || !currentTrack) return;
    if (isPlaying) player.pauseVideo();
    else player.playVideo();
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const value = Number(e.target.value);
    playerRef.current?.seekTo(value, true);
    setCurrent(value);
  }

  if (connected === null) {
    return (
      <p className="my-auto self-center font-mono text-[12px] text-[var(--text-secondary)]">
        Checking connection…
      </p>
    );
  }

  if (!connected) {
    return (
      <div className="my-auto flex flex-col items-center gap-3 self-center text-center">
        {deviceAuth ? (
          <div className="flex flex-col items-center gap-1.5">
            <p className="font-mono text-[11px] text-[var(--text-secondary)]">
              Go to{" "}
              <a
                href={deviceAuth.verification_url}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent-secondary)] underline"
              >
                {deviceAuth.verification_url}
              </a>
            </p>
            <div className="flex items-center gap-1.5">
              <p className="font-mono text-[18px] font-semibold tracking-[0.2em] text-[var(--text-primary)]">
                {deviceAuth.user_code}
              </p>
              <button
                type="button"
                onClick={handleCopyCode}
                title={codeCopied ? "Copied!" : "Copy code"}
                aria-label="Copy code"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--text-primary)]"
              >
                {codeCopied ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="8" y="8" width="12" height="12" rx="1.5" />
                    <path d="M16 8V5.5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1V15a1 1 0 0 0 1 1H8" />
                  </svg>
                )}
              </button>
            </div>
            <p className="font-mono text-[11px] text-[var(--text-secondary)]">
              Waiting for authorization…
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            className="flex h-8 shrink-0 items-center gap-2 rounded-full px-3.5 transition-all duration-200 ease-out hover:scale-[1.04] hover:shadow-[0_0_16px_rgba(255,0,0,0.3)] active:scale-95 motion-reduce:transition-none"
            style={{ background: "#ff0000", color: "#fff" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
              <path d="M21.6 7.2s-.2-1.5-.8-2.2c-.8-.8-1.7-.8-2.1-.9C15.9 4 12 4 12 4h0s-3.9 0-6.7.1c-.4.1-1.3.1-2.1.9-.6.7-.8 2.2-.8 2.2S2 9 2 10.8v1.4C2 14 2.2 15.8 2.2 15.8s.2 1.5.8 2.2c.8.8 1.9.8 2.4.9C7.2 19 12 19 12 19s3.9 0 6.7-.1c.4-.1 1.3-.1 2.1-.9.6-.7.8-2.2.8-2.2s.2-1.8.2-3.6v-1.4c0-1.8-.2-3.6-.2-3.6zM9.9 14.6V8.6l5.4 3-5.4 3z" />
            </svg>
            <span className="whitespace-nowrap font-mono text-[12px] font-medium uppercase tracking-wider">
              Connect YouTube Music
            </span>
          </button>
        )}
        {authError && (
          <p className="font-mono text-[11px] text-[var(--text-secondary)]">{authError}</p>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <form onSubmit={handleSearch} className="flex flex-1 items-center gap-1.5">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs…"
            className="h-7 min-w-0 flex-1 rounded-full border border-[var(--hairline)] bg-transparent px-3 font-mono text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[var(--accent-secondary)]"
          />
        </form>
        <button
          type="button"
          onClick={openLibrary}
          className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)] transition-colors duration-200 hover:text-[var(--accent-secondary)]"
        >
          Library
        </button>
      </div>

      {view === "playlist-tracks" && activePlaylist && (
        <button
          type="button"
          onClick={openLibrary}
          className="shrink-0 self-start font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)] transition-colors duration-200 hover:text-[var(--accent-secondary)]"
        >
          ← {activePlaylist.title}
        </button>
      )}

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {listLoading ? (
          <p className="font-mono text-[12px] text-[var(--text-secondary)]">Loading…</p>
        ) : listError ? (
          <p className="font-mono text-[12px] text-[var(--text-secondary)]">{listError}</p>
        ) : view === "playlists" ? (
          <ul className="flex flex-col gap-1.5">
            {playlists.map((p) => (
              <li key={p.playlistId}>
                <button
                  type="button"
                  onClick={() => openPlaylist(p)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-white/5"
                >
                  {p.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnail} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="h-9 w-9 shrink-0 rounded-md bg-[var(--hairline)]" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-serif text-[13px] font-semibold text-[var(--text-primary)]">
                      {p.title}
                    </p>
                    {p.count != null && (
                      <p className="font-mono text-[11px] text-[var(--text-secondary)]">
                        {p.count} tracks
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tracks.map((t) => (
              <li key={t.videoId}>
                <button
                  type="button"
                  onClick={() => playTrack(t)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-white/5"
                  style={{
                    background:
                      currentTrack?.videoId === t.videoId ? "var(--hairline)" : undefined,
                  }}
                >
                  {t.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumbnail} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="h-9 w-9 shrink-0 rounded-md bg-[var(--hairline)]" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-serif text-[13px] font-semibold text-[var(--text-primary)]">
                      {t.title}
                    </p>
                    <p className="truncate font-mono text-[11px] text-[var(--text-secondary)]">
                      {t.artist}
                    </p>
                  </div>
                </button>
              </li>
            ))}
            {view === "search" && tracks.length === 0 && (
              <p className="font-mono text-[12px] text-[var(--text-secondary)]">
                Search for a song to get started.
              </p>
            )}
          </ul>
        )}
      </div>

      {/* Kept tiny rather than hidden entirely: a visible (if small) player
          is the ToS-compliant way to use the official IFrame embed. Pinned
          to the corner so it doesn't disturb the rest of the layout. */}
      <div
        ref={playerContainerRef}
        className="absolute right-3 bottom-3 h-16 w-16 shrink-0 overflow-hidden rounded-md shadow-lg"
      />

      {currentTrack && (
        <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--hairline)] pt-2.5">
          <div className="flex items-center gap-3">
            {currentTrack.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentTrack.thumbnail}
                alt=""
                className="h-9 w-9 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="h-9 w-9 shrink-0 rounded-md bg-[var(--hairline)]" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-serif text-[12px] font-semibold text-[var(--text-primary)]">
                {currentTrack.title}
              </p>
              <p className="truncate font-mono text-[11px] text-[var(--text-secondary)]">
                {currentTrack.artist}
              </p>
            </div>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200 ease-out hover:scale-105 active:scale-90 motion-reduce:transition-none"
              style={{ background: "#ff0000", color: "#fff" }}
            >
              {isPlaying ? (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="2" width="4" height="12" rx="1" />
                  <rect x="9" y="2" width="4" height="12" rx="1" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 2.5v11l9-5.5-9-5.5z" />
                </svg>
              )}
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={current}
            onChange={handleSeek}
            aria-label="Seek"
            className="h-1 cursor-pointer accent-[#ff0000]"
          />
          <div className="flex justify-between font-mono text-[11px] text-[var(--text-secondary)]">
            <span>{formatTime(current)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleDisconnect}
        className="shrink-0 self-start font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)] transition-colors duration-200 hover:text-[var(--accent-secondary)]"
      >
        Disconnect YouTube Music
      </button>
    </div>
  );
}
