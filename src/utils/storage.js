// storage.js - Utility functions for managing localStorage persistence of crates, liked tracks, gem tracks, and history. Provides functions to read/write structured data with error handling and default fallbacks. Also includes a helper to build history entries with unique IDs and timestamps.

const STORAGE_KEYS = {
  crates: 'crate-digger/crates/v1',
  likedTrackIds: 'crate-digger/liked-track-ids/v1',
  gemTrackIds: 'crate-digger/gem-track-ids/v1',
  history: 'crate-digger/history/v1',
}

function readStorageValue(key, fallbackValue) {
  try {
    const rawValue = window.localStorage.getItem(key)
    if (!rawValue) {
      return fallbackValue
    }

    return JSON.parse(rawValue)
  } catch {
    return fallbackValue
  }
}

function writeStorageValue(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore quota/serialization issues for now; app stays usable without persistence.
  }
}

export function getStoredCrates(defaultCrates) {
  const storedCrates = readStorageValue(STORAGE_KEYS.crates, null)
  if (!storedCrates || !Array.isArray(storedCrates) || storedCrates.length === 0) {
    return defaultCrates
  }

  return defaultCrates.map((crate) => {
    const found = storedCrates.find((item) => item.id === crate.id)
    return {
      ...crate,
      name: String(found?.name || crate.name),
      description: String(found?.description || crate.description),
      trackIds: Array.isArray(found?.trackIds) ? found.trackIds : [],
    }
  })
}

export function saveCrates(crates) {
  writeStorageValue(STORAGE_KEYS.crates, crates)
}

export function getLikedTrackIds() {
  const likedTrackIds = readStorageValue(STORAGE_KEYS.likedTrackIds, [])
  return Array.isArray(likedTrackIds) ? likedTrackIds : []
}

export function saveLikedTrackIds(trackIds) {
  writeStorageValue(STORAGE_KEYS.likedTrackIds, trackIds)
}

export function getGemTrackIds() {
  const gemTrackIds = readStorageValue(STORAGE_KEYS.gemTrackIds, [])
  return Array.isArray(gemTrackIds) ? gemTrackIds : []
}

export function saveGemTrackIds(trackIds) {
  writeStorageValue(STORAGE_KEYS.gemTrackIds, trackIds)
}

export function getHistory() {
  const history = readStorageValue(STORAGE_KEYS.history, [])
  return Array.isArray(history) ? history : []
}

export function saveHistory(history) {
  writeStorageValue(STORAGE_KEYS.history, history)
}

export function buildHistoryEntry(trackId, action) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 9)}`,
    trackId,
    action,
    at: new Date().toISOString(),
  }
}
