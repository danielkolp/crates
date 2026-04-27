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
import mockCrates from './data/mockCrates'
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
import { addTrackToCrate as addTrackToCrateApi, getLastSearchStatus, searchTracks } from './api/youtubeClient'

const SCREEN_TO_PATH = {
  digger: '/search',
  swipe: '/swipe',
  crates: '/crates',
  liked: '/liked',
  gems: '/gems',
  history: '/history',
}
const THEME_STORAGE_KEY = 'music-ui-theme-mode'

const DEFAULT_FILTERS = {
  genre: 'all',
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

  return action
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()

  const activeScreen = getActiveScreen(location.pathname)
  const defaultCrates = useMemo(() => mockCrates.map((crate) => ({ ...crate, trackIds: [] })), [])

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
  const [searchStatus, setSearchStatus] = useState({
    source: 'loading',
    usedFallback: false,
    message: '',
  })
  const [allTracks, setAllTracks] = useState([])
  const [trackCatalog, setTrackCatalog] = useState({})
  const [selectedTrackId, setSelectedTrackId] = useState(null)
  const [currentTrackId, setCurrentTrackId] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playerProgress, setPlayerProgress] = useState(0)
  const [volume, setVolume] = useState(72)
  const [playerReservedHeight, setPlayerReservedHeight] = useState(112)
  const [crates, setCrates] = useState(() => getStoredCrates(defaultCrates))
  const [likedTrackIds, setLikedTrackIds] = useState(() => getLikedTrackIds())
  const [gemTrackIds, setGemTrackIds] = useState(() => getGemTrackIds())
  const [history, setHistory] = useState(() => getHistory())
  const [swipedTrackIds, setSwipedTrackIds] = useState([])
  const [searchRefreshKey, setSearchRefreshKey] = useState(0)
  const autoplayNextSwipeRef = useRef(false)

  const filteredTracks = allTracks
  const tracksById = trackCatalog
  const playbackQueue = activeScreen === 'digger' ? filteredTracks : allTracks
  const selectedTrack = selectedTrackId ? tracksById[selectedTrackId] : null
  const currentTrack = currentTrackId ? tracksById[currentTrackId] : null
  const swipeQueue = filteredTracks
  const swipeVisitedSet = useMemo(() => new Set(swipedTrackIds), [swipedTrackIds])
  const remainingSwipeTracks = useMemo(
    () => swipeQueue.filter((track) => !swipeVisitedSet.has(track.id)),
    [swipeQueue, swipeVisitedSet],
  )
  const swipeTrack = remainingSwipeTracks[0] ?? null
  const nextSwipeTracks = remainingSwipeTracks.slice(1, 4)
  const queueCount = activeScreen === 'swipe'
    ? (isLoadingTracks ? 0 : remainingSwipeTracks.length)
    : playbackQueue.length
  const shouldApplyDarkMode = isDarkMode && activeScreen !== 'swipe'
  const shouldApplyChromeDarkMode = isDarkMode

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
      // Ignore write failures (private mode / blocked storage).
    }
  }, [isDarkMode])

  useEffect(() => {
    let isCancelled = false
    setIsLoadingTracks(true)
    const searchTimer = window.setTimeout(() => {
      async function runSearch() {
        const tracks = await searchTracks('', withLockedTrackFilters({
          ...filters,
          digDeeperTags: digDeeperActive ? digDeeperTags : [],
          refreshKey: searchRefreshKey,
        }))

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
        setSelectedTrackId((prev) => (prev && tracks.some((track) => track.id === prev) ? prev : tracks[0]?.id ?? null))
        setCurrentTrackId((prev) => (prev && tracks.some((track) => track.id === prev) ? prev : tracks[0]?.id ?? null))
        setSwipedTrackIds([])
        setSearchStatus(getLastSearchStatus())
        setIsLoadingTracks(false)
      }

      runSearch()
    }, 500)

    return () => {
      isCancelled = true
      window.clearTimeout(searchTimer)
    }
  }, [filters, digDeeperActive, digDeeperTags, searchRefreshKey])

  useEffect(() => {
    if (activeScreen !== 'swipe' || !swipeTrack) {
      return undefined
    }

    const shouldAutoplay = autoplayNextSwipeRef.current
    autoplayNextSwipeRef.current = false

    setSelectedTrackId(swipeTrack.id)

    if (currentTrackId === swipeTrack.id) {
      if (shouldAutoplay) {
        setIsPlaying(true)
      }
      return undefined
    }

    setCurrentTrackId(swipeTrack.id)
    setIsPlaying(shouldAutoplay)
    setPlayerProgress(0)

    return undefined
  }, [activeScreen, currentTrackId, swipeTrack])

  function appendHistory(trackId, action) {
    setHistory((prev) => {
      const nextEntry = buildHistoryEntry(trackId, action)
      return [nextEntry, ...prev].slice(0, 80)
    })
  }

  function handleScreenChange(screenId) {
    const nextPath = SCREEN_TO_PATH[screenId] ?? '/search'
    navigate(nextPath)
  }

  function handleSelectTrack(trackId) {
    setSelectedTrackId(trackId)
    appendHistory(trackId, 'selected')
  }

  function handlePlayTrack(trackId) {
    setCurrentTrackId(trackId)
    setSelectedTrackId(trackId)
    setIsPlaying(true)
    setPlayerProgress(0)
    appendHistory(trackId, 'played')
  }

  function handleToggleTrackPlayback(trackId) {
    if (!trackId) {
      return
    }

    if (currentTrackId === trackId) {
      setSelectedTrackId(trackId)
      setIsPlaying((prev) => !prev)
      return
    }

    handlePlayTrack(trackId)
  }

  function handleTogglePlayback() {
    if (!currentTrackId && filteredTracks.length > 0) {
      handlePlayTrack(filteredTracks[0].id)
      return
    }

    setIsPlaying((prev) => !prev)
  }

  async function handleLikeTrack(trackId) {
    if (!trackId) {
      return
    }

    setLikedTrackIds((prev) => (prev.includes(trackId) ? prev : [trackId, ...prev]))
    await addTrackToCrateApi(trackId, 'liked-tracks')
  }

  async function handleGemTrack(trackId) {
    if (!trackId) {
      return
    }

    setGemTrackIds((prev) => (prev.includes(trackId) ? prev : [trackId, ...prev]))
    setLikedTrackIds((prev) => (prev.includes(trackId) ? prev : [trackId, ...prev]))
    await addTrackToCrateApi(trackId, 'gems')
  }

  function handleRemoveFromCrate(trackId, crateId) {
    setCrates((prev) =>
      prev.map((crate) =>
        crate.id === crateId
          ? { ...crate, trackIds: crate.trackIds.filter((id) => id !== trackId) }
          : crate,
      ),
    )
  }

  function handleRemoveFromLiked(trackId) {
    setLikedTrackIds((prev) => prev.filter((id) => id !== trackId))
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
    if (!swipeTrack) {
      return
    }

    autoplayNextSwipeRef.current = true
    const nextSwiped = new Set(swipedTrackIds)
    nextSwiped.add(swipeTrack.id)

    const hasConsumedSwipeBatch = swipeQueue.length > 0 && nextSwiped.size >= swipeQueue.length
    if (hasConsumedSwipeBatch) {
      setSwipedTrackIds([])
      setIsLoadingTracks(true)
      setSearchRefreshKey((prev) => prev + 1)
      return
    }

    setSwipedTrackIds(Array.from(nextSwiped))

    if (forcePlaybackAdvance) {
      const nextTrack = swipeQueue.find((track) => !nextSwiped.has(track.id))
      if (nextTrack) {
        setCurrentTrackId(nextTrack.id)
        setSelectedTrackId(nextTrack.id)
        setIsPlaying(true)
        setPlayerProgress(0)
      }
    }
  }

  async function handleSwipeSave() {
    if (!swipeTrack) {
      return
    }

    await handleLikeTrack(swipeTrack.id)
    appendHistory(swipeTrack.id, 'saved')
    handleSwipeAdvance({ forcePlaybackAdvance: activeScreen !== 'swipe' })
  }

  function handleSwipeSkip() {
    if (!swipeTrack) {
      return
    }

    appendHistory(swipeTrack.id, 'skipped')
    handleSwipeAdvance({ forcePlaybackAdvance: activeScreen !== 'swipe' })
  }

  async function handleSwipeGem() {
    if (!swipeTrack) {
      return
    }

    await handleGemTrack(swipeTrack.id)
    appendHistory(swipeTrack.id, 'gem')
    handleSwipeAdvance({ forcePlaybackAdvance: activeScreen !== 'swipe' })
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
      className={`app-grid overflow-hidden bg-zinc-100 text-zinc-900 ${shouldApplyDarkMode ? 'theme-dark' : ''}`}
      style={{ height: `calc(100dvh - ${playerReservedHeight}px)` }}
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
            activeScreen === 'digger' ? 'grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem]' : 'grid-cols-1',
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
                    {searchStatus.usedFallback && (
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
                    isLoading={isLoadingTracks}
                    onSave={handleSwipeSave}
                    onSkip={handleSwipeSkip}
                    onGem={handleSwipeGem}
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
                      <h2 className="text-lg font-semibold">Your Dig History</h2>
                      <span className="mono text-xs text-zinc-500">{historyItems.length} tracks</span>
                    </header>

                    {historyItems.length === 0 && (
                      <EmptyState
                        title="History is empty"
                        description="Select or play a track to start building your dig timeline."
                      />
                    )}

                    {historyItems.length > 0 && (
                      <div className="space-y-2">
                        {historyItems.map((item, index) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelectTrack(item.track.id)}
                            className="tooltip-anchor flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-left transition hover:border-zinc-400 hover:bg-white"
                            data-tooltip="Select this history track"
                          >
                            <div className="flex min-w-0 items-center gap-3">
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
                              <span className="chip capitalize">{getHistoryActionLabel(item.action)}</span>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handlePlayTrack(item.track.id)
                                }}
                                className="tooltip-anchor rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
                                data-tooltip="Play this track"
                              >
                                Play
                              </button>
                            </div>
                          </button>
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
            />
          )}
        </div>
      </section>

      <BottomPlayer
        currentTrack={currentTrack}
        queueCount={queueCount}
        isPlaying={isPlaying}
        progress={playerProgress}
        volume={volume}
        onTogglePlay={handleTogglePlayback}
        canSwipeActions={Boolean(swipeTrack)}
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
    </div>
  )
}

export default App
