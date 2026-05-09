import { useCallback, useEffect, useMemo, useState } from 'react'

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function toRgbString(color) {
  return `rgb(${clampChannel(color.r)}, ${clampChannel(color.g)}, ${clampChannel(color.b)})`
}

function mixRgb(colorA, colorB, blend) {
  const ratio = Math.max(0, Math.min(Number(blend) || 0, 1))
  return {
    r: colorA.r * (1 - ratio) + colorB.r * ratio,
    g: colorA.g * (1 - ratio) + colorB.g * ratio,
    b: colorA.b * (1 - ratio) + colorB.b * ratio,
  }
}

function dimColor(color, factor = 0.6) {
  return {
    r: color.r * factor,
    g: color.g * factor,
    b: color.b * factor,
  }
}

function getLuminance(color) {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b
}

function getSaturation(color) {
  const max = Math.max(color.r, color.g, color.b)
  const min = Math.min(color.r, color.g, color.b)
  if (max === 0) return 0
  return (max - min) / max
}

function getColorDistance(colorA, colorB) {
  const deltaR = colorA.r - colorB.r
  const deltaG = colorA.g - colorB.g
  const deltaB = colorA.b - colorB.b
  return Math.sqrt(deltaR * deltaR + deltaG * deltaG + deltaB * deltaB)
}

export function toRgba(rgb, alpha) {
  const values = String(rgb).match(/\d+/g)
  if (!values || values.length < 3) return `rgba(0, 0, 0, ${alpha})`
  return `rgba(${values[0]}, ${values[1]}, ${values[2]}, ${alpha})`
}

export function getArtworkCandidates(value) {
  const source = String(value || '').trim()
  if (!source) return []

  const match = source.match(/img\.youtube\.com\/vi(?:_webp)?\/([^/?#]+)/i)
  if (!match) return [source]

  const videoId = match[1]

  return [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    source,
  ].filter((candidate, index, list) => candidate && list.indexOf(candidate) === index)
}

export function useArtworkTheme(artworkUrl, { isDarkMode = false } = {}) {
  const [dynamicTheme, setDynamicTheme] = useState(null)
  const [artworkFallback, setArtworkFallback] = useState({ key: '', index: 0 })
  const artworkCandidates = useMemo(() => getArtworkCandidates(artworkUrl), [artworkUrl])
  const artworkKey = artworkUrl || ''
  const artworkCandidateIndex = artworkFallback.key === artworkKey ? artworkFallback.index : 0
  const artworkSrc = artworkCandidates[artworkCandidateIndex] || ''

  const handleArtworkError = useCallback(() => {
    if (!artworkKey || artworkCandidateIndex >= artworkCandidates.length - 1) return

    setArtworkFallback({
      key: artworkKey,
      index: artworkCandidateIndex + 1,
    })
  }, [artworkCandidateIndex, artworkCandidates.length, artworkKey])

  useEffect(() => {
    if (!artworkSrc) {
      const resetTimer = window.setTimeout(() => setDynamicTheme(null), 0)
      return () => window.clearTimeout(resetTimer)
    }

    let isCancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      if (isCancelled) return

      try {
        const canvas = document.createElement('canvas')
        canvas.width = 24
        canvas.height = 24

        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        const buckets = new Map()

        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            const idx = (y * canvas.width + x) * 4
            const r = pixels[idx]
            const g = pixels[idx + 1]
            const b = pixels[idx + 2]
            const alpha = pixels[idx + 3]

            if (alpha < 120) continue

            const bucketR = clampChannel(Math.round(r / 32) * 32)
            const bucketG = clampChannel(Math.round(g / 32) * 32)
            const bucketB = clampChannel(Math.round(b / 32) * 32)
            const key = `${bucketR}-${bucketG}-${bucketB}`
            const existing = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 }

            existing.count += 1
            existing.r += r
            existing.g += g
            existing.b += b

            buckets.set(key, existing)
          }
        }

        const palette = [...buckets.values()]
          .sort((left, right) => right.count - left.count)
          .slice(0, 10)
          .map((bucket) => ({
            r: bucket.r / Math.max(bucket.count, 1),
            g: bucket.g / Math.max(bucket.count, 1),
            b: bucket.b / Math.max(bucket.count, 1),
          }))

        if (palette.length === 0) {
          setDynamicTheme(null)
          return
        }

        let mainColor = palette[0]
        let textColor = palette[0]

        if (isDarkMode) {
          const paletteByLightness = [...palette].sort((left, right) => getLuminance(left) - getLuminance(right))
          mainColor = paletteByLightness[0]
          textColor = paletteByLightness[paletteByLightness.length - 1]

          if (getLuminance(mainColor) > 95) {
            mainColor = mixRgb(mainColor, { r: 0, g: 0, b: 0 }, 0.45)
          }

          if (getLuminance(textColor) < 185) {
            textColor = mixRgb(textColor, { r: 255, g: 255, b: 255 }, 0.55)
          }
        } else {
          mainColor = dimColor(palette[0], 0.65)
          const lightCandidates = palette.filter((c) => getLuminance(c) > 180)
          textColor = lightCandidates.length > 0 ? lightCandidates[0] : { r: 255, g: 255, b: 255 }
        }

        const accentCandidate = palette
          .filter((candidate) => getColorDistance(candidate, mainColor) >= 70)
          .sort((left, right) => getSaturation(right) - getSaturation(left))[0]

        const accentColor = accentCandidate || textColor
        const surfaceColor = isDarkMode ? mixRgb(mainColor, accentColor, 0.16) : mainColor
        const cardColor = isDarkMode ? mixRgb(mainColor, accentColor, 0.22) : mainColor
        const mutedTextColor = isDarkMode ? mixRgb(textColor, mainColor, 0.22) : textColor

        const mainColorText = toRgbString(mainColor)
        const surfaceColorText = toRgbString(surfaceColor)
        const cardColorText = toRgbString(cardColor)
        const accentColorText = toRgbString(accentColor)
        const textColorText = toRgbString(textColor)
        const mutedTextColorText = toRgbString(mutedTextColor)

        setDynamicTheme({
          mainColor: mainColorText,
          surfaceColor: surfaceColorText,
          cardColor: cardColorText,
          accentColor: accentColorText,
          textColor: textColorText,
          mutedTextColor: mutedTextColorText,
          borderColor: toRgba(textColorText, 0.34),
          softBorderColor: toRgba(textColorText, 0.22),
          panelBackground: `linear-gradient(140deg, ${mainColorText} 0%, ${surfaceColorText} 56%, ${cardColorText} 100%)`,
          articleBackground: `linear-gradient(150deg, ${surfaceColorText} 0%, ${mainColorText} 100%)`,
          cardBackground: `linear-gradient(180deg, ${cardColorText} 0%, ${mainColorText} 100%)`,
          mutedBackground: toRgba(cardColorText, 0.95),
          chipBackground: toRgba(accentColorText, 0.2),
        })
      } catch {
        setDynamicTheme(null)
      }
    }

    img.onerror = () => setDynamicTheme(null)
    img.src = artworkSrc

    return () => {
      isCancelled = true
    }
  }, [artworkSrc, isDarkMode])

  return {
    artworkSrc,
    dynamicTheme,
    handleArtworkError,
  }
}
