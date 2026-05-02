import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import TopNav from './components/TopNav'
import FilterBar from './components/FilterBar'
import TrackTable from './components/TrackTable'
import TrackDetails from './components/TrackDetails'
import BottomPlayer from './components/BottomPlayer'
import CrateList from './components/CrateList'
import EmptyState from './components/EmptyState'
import SwipeMode from './components/SwipeMode'
import TrackCollectionView from './components/TrackCollectionView'
import ToastViewport from './components/ToastViewport'

import {
  getStoredCrates,
  getHistory,
  saveCrates,
  saveHistory,
  buildHistoryEntry,
  getLikedTrackIds,
  saveLikedTrackIds,
  getGemTrackIds,
  saveGemTrackIds,
} from './utils/storage'

import {
  addTrackToCrate as addTrackToCrateApi,
  getLastSearchStatus,
  getYouTubeGemScore,
  getYouTubeGemScoreDetails,
  logYouTubeGemScore,
  searchTracks,
} from './api/youtubeClient'

const SCREEN_TO_PATH = {
  digger: '/search',
  swipe: '/swipe',
  crates: '/crates',
  liked: '/liked',
  gems: '/gems',
  history: '/history',
}

const THEME_STORAGE_KEY = 'music-ui-theme-mode'

const DEFAULT_CRATES = []

const DEFAULT_FILTERS = {
  genre: 'all',
  style: 'all',
  format: 'all',
  vibe: 'all',
  maxViews: 'any',
  minGemScore: 'any',
  lowViewsOnly: false,
  strictGemsOnly: false,
  strictCrateDiggingMode: false,
  musicTracksOnly: true,
  preferTopicChannels: true,
  hideShorts: true,
  sortBy: 'gemScore',
  activeTags: [],
}

const DEFAULT_SEARCH_STATUS = {
  source: 'youtube',
  usedFallback: false,
  message: 'Ready for live YouTube search.',
}

const TOAST_EXIT_MS = 220

function slugifyPlaylistName(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'playlist'
}

function buildPlaylistId(name, existingPlaylists) {
  const baseId = `playlist-${slugifyPlaylistName(name)}`
  const existingIds = new Set(existingPlaylists.map((playlist) => playlist.id))

  if (!existingIds.has(baseId)) {
    return baseId
  }

  let suffix = 2
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1
  }

  return `${baseId}-${suffix}`
}

function withLockedTrackFilters(filters) {
  return {
    ...filters,
    musicTracksOnly: true,
    preferTopicChannels: true,
    hideShorts: true,
  }
}

function getActiveScreen(pathname) {
  if (pathname.startsWith('/swipe')) {
    return 'swipe'
  }

  if (pathname.startsWith('/crates')) {
    return 'crates'
  }

  if (pathname.startsWith('/liked')) {
    return 'liked'
  }

  if (pathname.startsWith('/gems')) {
    return 'gems'
  }

  if (pathname.startsWith('/history')) {
    return 'history'
  }

  return 'digger'
}

function getHistoryActionLabel(action) {
  if (action === 'gem') {
    return 'Best Find'
  }

  if (action === 'saved') {
    return 'Saved'
  }

  if (action === 'skipped') {
    return 'Skipped'
  }

  if (action === 'selected') {
    return 'Selected'
  }

  if (action === 'played') {
    return 'Played'
  }

  return action
}

function getHistoryActionClass(action) {
  if (action === 'skipped') {
    return 'border-zinc-300 bg-zinc-100 text-zinc-600'
  }

  if (action === 'saved') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-700'
  }

  if (action === 'gem') {
    return 'border-amber-300 bg-amber-50 text-amber-800'
  }

  if (action === 'played') {
    return 'border-sky-300 bg-sky-50 text-sky-700'
  }

  return 'border-zinc-300 bg-zinc-50 text-zinc-700'
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()

  const activeScreen = getActiveScreen(location.pathname)

  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark'
    } catch {
      return false
    }
  })

  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [digDeeperTags, setDigDeeperTags] = useState([])
  const [digDeeperActive, setDigDeeperActive] = useState(false)
  const [isLoadingTracks, setIsLoadingTracks] = useState(false)
  const [searchStatus, setSearchStatus] = useState(DEFAULT_SEARCH_STATUS)
  const [allTracks, setAllTracks] = useState([])
  const [trackCatalog, setTrackCatalog] = useState({})
  const [selectedTrackId, setSelectedTrackId] = useState(null)
  const [currentTrackId, setCurrentTrackId] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackCommand, setPlaybackCommand] = useState({ id: 0, trackId: null, shouldPlay: false })
  const [playerProgress, setPlayerProgress] = useState(0)
  const [volume, setVolume] = useState(72)
  const [playerReservedHeight, setPlayerReservedHeight] = useState(112)
  const [crates, setCrates] = useState(() => getStoredCrates(DEFAULT_CRATES))
  const [likedTrackIds, setLikedTrackIds] = useState(() => getLikedTrackIds())
  const [gemTrackIds, setGemTrackIds] = useState(() => getGemTrackIds())
  const [history, setHistory] = useState(() => getHistory())
  const [swipedTrackIds, setSwipedTrackIds] = useState([])
  const [searchRefreshKey, setSearchRefreshKey] = useState(0)
  const [swipeTheme, setSwipeTheme] = useState(null)
  const [toasts, setToasts] = useState([])

  const autoplayNextSwipeRef = useRef(false)
  const toastTimersRef = useRef(new Map())

  const filteredTracks = allTracks
  const tracksById = trackCatalog
  const playbackQueue = activeScreen === 'digger' ? filteredTracks : allTracks
  const selectedTrack = selectedTrackId ? tracksById[selectedTrackId] : null
  const currentTrack = currentTrackId ? tracksById[currentTrackId] : null
  const swipeQueue = filteredTracks
  const likedTrackIdSet = useMemo(() => new Set(likedTrackIds), [likedTrackIds])

  const swipeVisitedSet = useMemo(() => new Set(swipedTrackIds), [swipedTrackIds])

  const remainingSwipeTracks = useMemo(
    () => swipeQueue.filter((track) => !swipeVisitedSet.has(track.id)),
    [swipeQueue, swipeVisitedSet],
  )

  const swipeTrack = remainingSwipeTracks[0] ?? null
  const nextSwipeTracks = remainingSwipeTracks.slice(1, 4)

  const queueCount =
    activeScreen === 'swipe'
      ? isLoadingTracks
        ? 0
        : remainingSwipeTracks.length
      : playbackQueue.length

  const shouldApplyDarkMode = isDarkMode && activeScreen !== 'swipe'
  const shouldApplySwipeDarkMode = isDarkMode && activeScreen === 'swipe'
  const shouldApplyChromeDarkMode = isDarkMode
  const shouldUseSwipeTheme = activeScreen === 'swipe' && swipeTheme

  const shouldShowSearchNotice =
    Boolean(searchStatus.message) &&
    !isLoadingTracks &&
    (searchStatus.usedFallback || allTracks.length === 0)

  const swipeThemeStyle =
    shouldUseSwipeTheme
      ? {
          '--swipe-main': swipeTheme.mainColor,
          '--swipe-surface': swipeTheme.surfaceColor,
          '--swipe-card': swipeTheme.cardColor,
          '--swipe-accent': swipeTheme.accentColor,
          '--swipe-text': swipeTheme.textColor,
        }
      : undefined

  const historyItems = useMemo(
    () =>
      history
        .map((entry) => ({
          ...entry,
          track: tracksById[entry.trackId],
        }))
        .filter((item) => item.track),
    [history, tracksById],
  )

  useEffect(() => {
    if (location.pathname === '/') {
      navigate('/search', { replace: true })
    }
  }, [location.pathname, navigate])

  useEffect(() => () => {
    toastTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    toastTimersRef.current.clear()
  }, [])

  useEffect(() => {
    window.getYouTubeGemScore = getYouTubeGemScore
    window.getYouTubeGemScoreDetails = getYouTubeGemScoreDetails
    window.logYouTubeGemScore = logYouTubeGemScore

    return () => {
      delete window.getYouTubeGemScore
      delete window.getYouTubeGemScoreDetails
      delete window.logYouTubeGemScore
    }
  }, [])

  useEffect(() => {
    saveCrates(crates)
  }, [crates])

  useEffect(() => {
    saveLikedTrackIds(likedTrackIds)
  }, [likedTrackIds])

  useEffect(() => {
    saveGemTrackIds(gemTrackIds)
  }, [gemTrackIds])

  useEffect(() => {
    saveHistory(history)
  }, [history])

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? 'dark' : 'light')
    } catch {
      // Ignore write failures.
    }
  }, [isDarkMode])

  useEffect(() => {
    let isCancelled = false
    const loadingTimer = window.setTimeout(() => {
      if (!isCancelled) {
        setIsLoadingTracks(true)
      }
    }, 0)

    const searchTimer = window.setTimeout(() => {
      async function runSearch() {
        try {
          const tracks = await searchTracks(
            '',
            withLockedTrackFilters({
              ...filters,
              digDeeperTags: digDeeperActive ? digDeeperTags : [],
              refreshKey: searchRefreshKey,
            }),
          )

          if (isCancelled) {
            return
          }

          setAllTracks(tracks)

          setTrackCatalog((prevCatalog) => {
            const nextCatalog = { ...prevCatalog }

            tracks.forEach((track) => {
              nextCatalog[track.id] = track
            })

            return nextCatalog
          })

          setSelectedTrackId((prev) =>
            prev && tracks.some((track) => track.id === prev) ? prev : tracks[0]?.id ?? null,
          )

          setCurrentTrackId((prev) =>
            prev && tracks.some((track) => track.id === prev) ? prev : tracks[0]?.id ?? null,
          )

          setSwipedTrackIds([])
          setSearchStatus(getLastSearchStatus())
        } catch (error) {
          console.error('[CrateDigger][app] search failed', error)

          if (!isCancelled) {
            setAllTracks([])
            setSelectedTrackId(null)
            setCurrentTrackId(null)
            setSearchStatus({
              source: 'youtube',
              usedFallback: false,
              message: 'Search failed. Check your YouTube API key or quota.',
            })
          }
        } finally {
          if (!isCancelled) {
            setIsLoadingTracks(false)
          }
        }
      }

      runSearch()
    }, 500)

    return () => {
      isCancelled = true
      window.clearTimeout(loadingTimer)
      window.clearTimeout(searchTimer)
    }
  }, [filters, digDeeperActive, digDeeperTags, searchRefreshKey])

  useEffect(() => {
    if (activeScreen !== 'swipe' || !swipeTrack || isLoadingTracks) {
      return undefined
    }

    const syncTimer = window.setTimeout(() => {
      const shouldAutoplay = autoplayNextSwipeRef.current
      autoplayNextSwipeRef.current = false

      setSelectedTrackId(swipeTrack.id)

      if (currentTrackId === swipeTrack.id) {
        if (shouldAutoplay) {
          setIsPlaying(true)
          requestPlaybackSync(swipeTrack.id, true)
        }

        return
      }

      setCurrentTrackId(swipeTrack.id)
      setIsPlaying(shouldAutoplay)
      setPlayerProgress(0)

      if (shouldAutoplay) {
        requestPlaybackSync(swipeTrack.id, true)
      }
    }, 0)

    return () => {
      window.clearTimeout(syncTimer)
    }
  }, [activeScreen, currentTrackId, isLoadingTracks, swipeTrack])

  function appendHistory(trackId, action) {
    if (!trackId) {
      return
    }

    setHistory((prev) => {
      const nextEntry = buildHistoryEntry(trackId, action)
      return [nextEntry, ...prev].slice(0, 80)
    })
  }

  function requestPlaybackSync(trackId, shouldPlay) {
    setPlaybackCommand((prev) => ({
      id: prev.id + 1,
      trackId: trackId || null,
      shouldPlay: Boolean(shouldPlay),
    }))
  }

  function dismissToast(toastId) {
    const timerId = toastTimersRef.current.get(toastId)

    if (timerId) {
      window.clearTimeout(timerId)
      toastTimersRef.current.delete(toastId)
    }

    let shouldScheduleRemoval = false

    setToasts((prev) =>
      prev.map((toast) => {
        if (toast.id !== toastId) {
          return toast
        }

        if (!toast.exiting) {
          shouldScheduleRemoval = true
        }

        return {
          ...toast,
          exiting: true,
        }
      }),
    )

    if (shouldScheduleRemoval) {
      const removalTimerId = window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== toastId))
        toastTimersRef.current.delete(toastId)
      }, TOAST_EXIT_MS)

      toastTimersRef.current.set(toastId, removalTimerId)
    }
  }

  function pushToast({ tone = 'success', title, message }) {
    const toastId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`

    setToasts((prev) => [
      {
        id: toastId,
        tone,
        title,
        message,
        exiting: false,
      },
      ...prev,
    ].slice(0, 4))

    const timerId = window.setTimeout(() => {
      dismissToast(toastId)
    }, tone === 'error' ? 5200 : 3600)

    toastTimersRef.current.set(toastId, timerId)
  }

  function getTrackTitle(trackId) {
    return tracksById[trackId]?.title || 'Track'
  }

  function handleScreenChange(screenId) {
    const nextPath = SCREEN_TO_PATH[screenId] ?? '/search'
    navigate(nextPath)
  }

  function handleSelectTrack(trackId) {
    setSelectedTrackId(trackId)
    appendHistory(trackId, 'selected')
  }

  function syncSwipeQueueToTrack(trackId) {
    if (!trackId) {
      return
    }

    const catalogTrack = tracksById[trackId]
    const queue = allTracks.some((track) => track.id === trackId)
      ? allTracks
      : catalogTrack
        ? [catalogTrack, ...allTracks]
        : allTracks

    if (catalogTrack && !allTracks.some((track) => track.id === trackId)) {
      setAllTracks((prev) => (prev.some((track) => track.id === trackId) ? prev : [catalogTrack, ...prev]))
    }

    const targetIndex = queue.findIndex((track) => track.id === trackId)
    setSwipedTrackIds(targetIndex > 0 ? queue.slice(0, targetIndex).map((track) => track.id) : [])
  }

  function handlePlayTrack(trackId) {
    if (!trackId) {
      return
    }

    syncSwipeQueueToTrack(trackId)
    setIsPlaying(false)
    setPlayerProgress(0)
    setCurrentTrackId(trackId)
    setSelectedTrackId(trackId)
    setIsPlaying(true)
    requestPlaybackSync(trackId, true)
    appendHistory(trackId, 'played')
  }

  function handleToggleTrackPlayback(trackId, nextPlaying = null) {
    if (!trackId) {
      return
    }

    if (currentTrackId === trackId) {
      const shouldPlay = typeof nextPlaying === 'boolean' ? nextPlaying : !isPlaying

      setSelectedTrackId(trackId)
      setIsPlaying(shouldPlay)
      requestPlaybackSync(trackId, shouldPlay)
      return
    }

    handlePlayTrack(trackId)
  }

  function handleTogglePlayback(nextPlaying = null) {
    const shouldPlay = typeof nextPlaying === 'boolean' ? nextPlaying : !isPlaying

    if (activeScreen === 'swipe' && swipeTrack?.id && currentTrackId !== swipeTrack.id) {
      handlePlayTrack(swipeTrack.id)
      return
    }

    if (!currentTrackId || !tracksById[currentTrackId]) {
      const fallbackTrack = swipeTrack || filteredTracks[0] || allTracks[0]

      if (fallbackTrack?.id) {
        handlePlayTrack(fallbackTrack.id)
      }

      return
    }

    setIsPlaying(shouldPlay)
    requestPlaybackSync(currentTrackId, shouldPlay)
  }

  function handleSwipeTogglePlayback(nextPlaying = null) {
    if (swipeTrack?.id) {
      handleToggleTrackPlayback(swipeTrack.id, nextPlaying)
      return
    }

    handleTogglePlayback(nextPlaying)
  }

  async function handleLikeTrack(trackId) {
    if (!trackId) {
      pushToast({
        tone: 'error',
        title: 'Could not save track',
        message: 'No track was selected.',
      })
      return
    }

    if (likedTrackIds.includes(trackId)) {
      pushToast({
        tone: 'info',
        title: 'Already in Liked',
        message: getTrackTitle(trackId),
      })
      return
    }

    setLikedTrackIds((prev) => (prev.includes(trackId) ? prev : [trackId, ...prev]))

    try {
      await addTrackToCrateApi(trackId, 'liked-tracks')
      pushToast({
        title: 'Saved to Liked',
        message: getTrackTitle(trackId),
      })
    } catch (error) {
      console.error('[CrateDigger][app] failed to add liked track', error)
      pushToast({
        tone: 'error',
        title: 'Liked locally, sync failed',
        message: 'The track was saved in this browser but the remote action failed.',
      })
    }
  }

  async function handleGemTrack(trackId) {
    if (!trackId) {
      return
    }

    setGemTrackIds((prev) => (prev.includes(trackId) ? prev : [trackId, ...prev]))
    setLikedTrackIds((prev) => (prev.includes(trackId) ? prev : [trackId, ...prev]))

    try {
      await addTrackToCrateApi(trackId, 'gems')
    } catch (error) {
      console.error('[CrateDigger][app] failed to add gem track', error)
    }
  }

  function handleRemoveFromCrate(trackId, crateId) {
    setCrates((prev) =>
      prev.map((crate) =>
        crate.id === crateId
          ? {
              ...crate,
              trackIds: crate.trackIds.filter((id) => id !== trackId),
            }
          : crate,
      ),
    )

    const crate = crates.find((item) => item.id === crateId)
    pushToast({
      title: 'Removed from playlist',
      message: crate ? `${getTrackTitle(trackId)} removed from ${crate.name}.` : getTrackTitle(trackId),
    })
  }

  function handleCreatePlaylist({ name, description = 'Custom playlist', trackId } = {}) {
    const playlistName = String(name || '').trim()
    if (!playlistName) {
      pushToast({
        tone: 'error',
        title: 'Playlist needs a name',
      })
      return ''
    }

    const playlistId = buildPlaylistId(playlistName, crates)
    const initialTrackIds = trackId ? [trackId] : []

    setCrates((prev) => [
      {
        id: playlistId,
        name: playlistName,
        description,
        trackIds: initialTrackIds,
      },
      ...prev,
    ])

    pushToast({
      title: 'Playlist created',
      message: trackId
        ? `${getTrackTitle(trackId)} added to ${playlistName}.`
        : playlistName,
    })

    return playlistId
  }

  function handleAddTrackToPlaylist(trackId, playlistId) {
    if (!trackId || !playlistId) {
      pushToast({
        tone: 'error',
        title: 'Could not add to playlist',
        message: 'Choose a track and playlist first.',
      })
      return
    }

    const playlist = crates.find((crate) => crate.id === playlistId)

    if (!playlist) {
      pushToast({
        tone: 'error',
        title: 'Playlist not found',
        message: 'Create a playlist first, then try again.',
      })
      return
    }

    if (playlist.trackIds.includes(trackId)) {
      pushToast({
        tone: 'info',
        title: 'Already in playlist',
        message: `${getTrackTitle(trackId)} is already in ${playlist.name}.`,
      })
      return
    }

    setCrates((prev) =>
      prev.map((crate) =>
        crate.id === playlistId
          ? {
              ...crate,
              trackIds: crate.trackIds.includes(trackId) ? crate.trackIds : [trackId, ...crate.trackIds],
            }
          : crate,
      ),
    )

    pushToast({
      title: 'Added to playlist',
      message: `${getTrackTitle(trackId)} added to ${playlist.name}.`,
    })
  }

  function handleDeletePlaylist(playlistId) {
    const playlist = crates.find((crate) => crate.id === playlistId)

    if (!playlist) {
      pushToast({
        tone: 'error',
        title: 'Playlist not found',
      })
      return
    }

    setCrates((prev) => prev.filter((crate) => crate.id !== playlistId))
    pushToast({
      title: 'Playlist deleted',
      message: playlist.name,
    })
  }

  function handleRemoveFromLiked(trackId) {
    if (!likedTrackIds.includes(trackId)) {
      pushToast({
        tone: 'error',
        title: 'Track was not in Liked',
        message: getTrackTitle(trackId),
      })
      return
    }

    setLikedTrackIds((prev) => prev.filter((id) => id !== trackId))
    pushToast({
      title: 'Removed from Liked',
      message: getTrackTitle(trackId),
    })
  }

  function handleRemoveFromGems(trackId) {
    setGemTrackIds((prev) => prev.filter((id) => id !== trackId))
  }

  function handleStartDigging() {
    if (!selectedTrack) {
      return
    }

    setDigDeeperTags(selectedTrack.tags.slice(0, 4))
    setDigDeeperActive(true)
    navigate('/search')
  }

  function handleClearDigDeeper() {
    setDigDeeperActive(false)
    setDigDeeperTags([])
  }

  function handleSwipeAdvance({ forcePlaybackAdvance = false } = {}) {
    const currentSwipeTrack = swipeTrack

    if (!currentSwipeTrack) {
      return
    }

    const nextSwiped = new Set(swipedTrackIds)
    nextSwiped.add(currentSwipeTrack.id)
    const nextTrack = swipeQueue.find((track) => !nextSwiped.has(track.id))

    const hasConsumedSwipeBatch = swipeQueue.length > 0 && nextSwiped.size >= swipeQueue.length

    if (hasConsumedSwipeBatch) {
      autoplayNextSwipeRef.current = true
      setSwipedTrackIds([])
      setIsLoadingTracks(true)
      setSearchRefreshKey((prev) => prev + 1)
      return
    }

    setSwipedTrackIds(Array.from(nextSwiped))

    if (nextTrack && (activeScreen === 'swipe' || forcePlaybackAdvance)) {
      setPlayerProgress(0)
      setCurrentTrackId(nextTrack.id)
      setSelectedTrackId(nextTrack.id)
      setIsPlaying(true)
      requestPlaybackSync(nextTrack.id, true)
    }
  }

  function handleSwipeSave() {
    if (!swipeTrack) {
      return
    }

    const trackId = swipeTrack.id
    appendHistory(trackId, 'saved')
    handleSwipeAdvance({ forcePlaybackAdvance: activeScreen !== 'swipe' })
    void handleLikeTrack(trackId)
  }

  function handleSwipeSkip() {
    if (!swipeTrack) {
      return
    }

    const trackId = swipeTrack.id
    appendHistory(trackId, 'skipped')
    handleSwipeAdvance({ forcePlaybackAdvance: activeScreen !== 'swipe' })
  }

  function handleSwipeGem() {
    if (!swipeTrack) {
      return
    }

    const trackId = swipeTrack.id
    appendHistory(trackId, 'gem')
    handleSwipeAdvance({ forcePlaybackAdvance: activeScreen !== 'swipe' })
    void handleGemTrack(trackId)
  }

  function handleBottomSwipeSkip() {
    if (!swipeTrack) {
      return
    }

    handleSwipeSkip()
  }

  function handleBottomSwipeSave() {
    if (!swipeTrack) {
      return
    }

    handleSwipeSave()
  }

  function handleBottomSwipeGem() {
    if (!swipeTrack) {
      return
    }

    handleSwipeGem()
  }

  return (
    <div
      className={`app-grid overflow-hidden bg-zinc-100 text-zinc-900 ${
        shouldApplyDarkMode ? 'theme-dark' : ''
      } ${shouldUseSwipeTheme ? 'theme-swipe' : ''} ${
        shouldApplySwipeDarkMode ? 'theme-swipe-dark' : ''
      }`}
      style={{ height: `calc(100dvh - ${playerReservedHeight}px)`, ...swipeThemeStyle }}
    >
      <Sidebar
        activeScreen={activeScreen}
        onScreenChange={handleScreenChange}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        playbackProgress={playerProgress}
        isDarkMode={shouldApplyChromeDarkMode}
      />

      <section className="flex h-full min-h-0 min-w-0 flex-col border-l border-zinc-300/90">
        <TopNav
          activeScreen={activeScreen}
          onScreenChange={handleScreenChange}
          isDarkMode={shouldApplyChromeDarkMode}
          onToggleTheme={() => setIsDarkMode((prev) => !prev)}
        />

        <div
          className={[
            'grid min-h-0 flex-1 overflow-hidden',
            activeScreen === 'digger'
              ? 'grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem]'
              : 'grid-cols-1',
          ].join(' ')}
        >
          <main
            className={[
              activeScreen === 'swipe' ? 'min-h-0 overflow-hidden' : 'min-h-0 overflow-y-auto',
              activeScreen === 'digger' ? 'border-r border-zinc-300/90' : '',
            ].join(' ')}
          >
            <Routes>
              <Route path="/" element={<Navigate to="/search" replace />} />

              <Route
                path="/search"
                element={
                  <div className="space-y-4">
                    {shouldShowSearchNotice && (
                      <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                        {searchStatus.message}
                      </div>
                    )}

                    <FilterBar
                      tracks={allTracks}
                      filters={filters}
                      onChangeFilters={setFilters}
                      digDeeperTags={digDeeperTags}
                      digDeeperActive={digDeeperActive}
                      onClearDigDeeper={handleClearDigDeeper}
                    />

                    <TrackTable
                      tracks={filteredTracks}
                      isLoading={isLoadingTracks}
                      onSelectTrack={handleSelectTrack}
                      onToggleTrackPlayback={handleToggleTrackPlayback}
                      selectedTrackId={selectedTrackId}
                      currentTrackId={currentTrackId}
                      isPlaying={isPlaying}
                      playbackProgress={playerProgress}
                      likedTrackIds={likedTrackIds}
                      onLikeTrack={handleLikeTrack}
                    />
                  </div>
                }
              />

              <Route
                path="/swipe"
                element={
                  <SwipeMode
                    track={swipeTrack}
                    nextTracks={nextSwipeTracks}
                    tracks={allTracks}
                    filters={filters}
                    onChangeFilters={setFilters}
                    playlists={crates}
                    isLoading={isLoadingTracks}
                    isDarkMode={shouldApplyChromeDarkMode}
                    isPlaying={Boolean(swipeTrack && isPlaying && currentTrackId === swipeTrack.id)}
                    isLiked={Boolean(swipeTrack && likedTrackIdSet.has(swipeTrack.id))}
                    onSave={handleSwipeSave}
                    onSkip={handleSwipeSkip}
                    onGem={handleSwipeGem}
                    onAddToPlaylist={handleAddTrackToPlaylist}
                    onCreatePlaylist={handleCreatePlaylist}
                    onTogglePlayback={handleSwipeTogglePlayback}
                    onThemeChange={setSwipeTheme}
                  />
                }
              />

              <Route
                path="/crates"
                element={
                  <CrateList
                    crates={crates}
                    tracksById={tracksById}
                    selectedTrackId={selectedTrackId}
                    onSelectTrack={handleSelectTrack}
                    onPlayTrack={handlePlayTrack}
                    onCreatePlaylist={handleCreatePlaylist}
                    onDeletePlaylist={handleDeletePlaylist}
                    onRemoveFromCrate={handleRemoveFromCrate}
                  />
                }
              />

              <Route
                path="/liked"
                element={
                  <TrackCollectionView
                    collectionId="liked-tracks"
                    title="Liked Tracks"
                    description="Everything you save from Search and Swipe mode lands here."
                    trackIds={likedTrackIds}
                    tracksById={tracksById}
                    selectedTrackId={selectedTrackId}
                    onSelectTrack={handleSelectTrack}
                    onPlayTrack={handlePlayTrack}
                    likedTrackIds={likedTrackIds}
                    onRemoveTrack={handleRemoveFromLiked}
                    sharePath="/liked"
                  />
                }
              />

              <Route
                path="/gems"
                element={
                  <TrackCollectionView
                    collectionId="gems"
                    title="Gems"
                    description="Diamond picks from swipe mode."
                    trackIds={gemTrackIds}
                    tracksById={tracksById}
                    selectedTrackId={selectedTrackId}
                    onSelectTrack={handleSelectTrack}
                    onPlayTrack={handlePlayTrack}
                    onRemoveTrack={handleRemoveFromGems}
                    sharePath="/gems"
                  />
                }
              />

              <Route
                path="/history"
                element={
                  <section className="panel space-y-3 p-4">
                    <header className="flex items-center justify-between border-b border-zinc-200 pb-3">
                      <h2 className="text-lg font-semibold">Your Discovery History</h2>
                      <span className="mono text-xs text-zinc-500">
                        {historyItems.length} tracks
                      </span>
                    </header>

                    {historyItems.length === 0 && (
                      <EmptyState
                        title="History is empty"
                        description="Select or play a track to start building your discovery timeline."
                      />
                    )}

                    {historyItems.length > 0 && (
                      <div className="space-y-2">
                        {historyItems.map((item, index) => (
                          <div
                            key={item.id}
                            className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-left"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <span className="mono hidden text-xs text-zinc-500 sm:inline">
                                {String(index + 1).padStart(2, '0')}
                              </span>

                              <img
                                src={item.track.artworkUrl}
                                alt={item.track.title}
                                className="h-10 w-10 rounded-lg border border-zinc-200 object-cover"
                                loading="lazy"
                              />

                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{item.track.title}</p>
                                <p className="truncate text-xs text-zinc-500">{item.track.artist}</p>
                              </div>
                            </div>

                            <div className="ml-3 flex items-center gap-2">
                              <span className={`chip capitalize ${getHistoryActionClass(item.action)}`}>
                                {getHistoryActionLabel(item.action)}
                              </span>

                              <button
                                type="button"
                                onClick={() => handlePlayTrack(item.track.id)}
                                className="tooltip-anchor tooltip-left rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium transition hover:border-emerald-500 hover:bg-emerald-500 hover:text-white"
                                data-tooltip="Play this track"
                              >
                                Play
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                }
              />

              <Route path="/settings" element={<Navigate to="/search" replace />} />
            </Routes>
          </main>

          {activeScreen === 'digger' && (
            <TrackDetails
              track={selectedTrack}
              isPlaying={isPlaying && currentTrackId === selectedTrack?.id}
              onToggleTrackPlayback={handleToggleTrackPlayback}
              onLikeTrack={handleLikeTrack}
              playlists={crates}
              onAddToPlaylist={handleAddTrackToPlaylist}
              onCreatePlaylist={handleCreatePlaylist}
              isLiked={Boolean(selectedTrack && likedTrackIdSet.has(selectedTrack.id))}
              onStartDigging={handleStartDigging}
            />
          )}
        </div>
      </section>

      <BottomPlayer
        currentTrack={currentTrack}
        queueCount={queueCount}
        isPlaying={isPlaying}
        progress={playerProgress}
        playbackCommand={playbackCommand}
        volume={volume}
        onTogglePlay={handleTogglePlayback}
        onPlaybackStateChange={setIsPlaying}
        canSwipeActions={Boolean(swipeTrack)}
        isSwipeTrackLiked={Boolean(swipeTrack && likedTrackIdSet.has(swipeTrack.id))}
        onSwipeSkip={handleBottomSwipeSkip}
        onSwipeSave={handleBottomSwipeSave}
        onSwipeGem={handleBottomSwipeGem}
        onVolumeChange={setVolume}
        onProgressChange={setPlayerProgress}
        onTrackEnd={() => setIsPlaying(false)}
        onHeightChange={setPlayerReservedHeight}
        hideSwipeActions={activeScreen === 'swipe'}
        isDarkMode={shouldApplyChromeDarkMode}
      />

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

export default App
