// assetUrl.js - Utility for generating public asset URLs

const RAW_BASE_URL = import.meta.env.BASE_URL || '/'
const BASE_URL = RAW_BASE_URL.endsWith('/') ? RAW_BASE_URL : `${RAW_BASE_URL}/`

export function publicAsset(path = '') {
  const normalizedPath = String(path).replace(/^\/+/, '')
  return `${BASE_URL}${normalizedPath}`
}

