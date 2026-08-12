export type YtTrack = {
  videoId: string;
  title: string | null;
  artist: string;
  thumbnail: string | null;
  duration: string | null;
};

export type YtPlaylist = {
  playlistId: string;
  title: string | null;
  thumbnail: string | null;
  count: number | null;
};

export type DeviceAuthStart = {
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
};

export type DeviceAuthPollStatus =
  | "pending"
  | "connected"
  | "denied"
  | "expired";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/ytmusic${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `YouTube Music request failed (${res.status}).`);
  }
  return res.json();
}

export function getYtMusicAuthStatus() {
  return request<{ connected: boolean }>("/auth/status");
}

export function startYtMusicDeviceAuth() {
  return request<DeviceAuthStart>("/auth/device/start", { method: "POST" });
}

export function pollYtMusicDeviceAuth() {
  return request<{ status: DeviceAuthPollStatus }>("/auth/device/poll", {
    method: "POST",
  });
}

export function disconnectYtMusic() {
  return request<{ connected: boolean }>("/auth/disconnect", {
    method: "POST",
  });
}

export function searchYtMusic(query: string) {
  return request<YtTrack[]>(`/search?q=${encodeURIComponent(query)}`);
}

export function getYtMusicLibraryPlaylists() {
  return request<YtPlaylist[]>("/library/playlists");
}

export function getYtMusicPlaylistTracks(playlistId: string) {
  return request<YtTrack[]>(`/playlist/${encodeURIComponent(playlistId)}`);
}
