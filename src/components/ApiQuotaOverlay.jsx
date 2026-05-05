import { publicAsset } from '../utils/assetUrl'

const LIGHT_LOGO_SRC = publicAsset('images/logo.png')
const DARK_LOGO_SRC = publicAsset('images/logo-darkmode.png')
const LIGHT_QUOTA_IMAGE_SRC = publicAsset('images/403.png')
const DARK_QUOTA_IMAGE_SRC = publicAsset('images/403-darkmode.png')
const QUOTA_MESSAGE_PRIMARY = 'Looks like YouTube told us to get lost.'
const QUOTA_MESSAGE_SECONDARY = "Our API pass got bounced at the door. We'll be back tomorrow."

function ApiQuotaOverlay({ isDarkMode = false, onRetry, onBrowseDemo }) {
  const logoSrc = isDarkMode ? DARK_LOGO_SRC : LIGHT_LOGO_SRC
  const quotaImageSrc = isDarkMode ? DARK_QUOTA_IMAGE_SRC : LIGHT_QUOTA_IMAGE_SRC

  return (
    <div
      className={`api-quota-overlay ${isDarkMode ? 'api-quota-overlay-dark' : ''}`}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="api-quota-title"
      aria-describedby="api-quota-description"
    >
      <div className="api-quota-overlay-panel">
        <img src={logoSrc} alt="Crate Digger" className="api-quota-logo" />
        <img src={quotaImageSrc} alt="403" className="api-quota-image" />
        <h2 id="api-quota-title" className="sr-only">YouTube API quota exceeded</h2>
        <p id="api-quota-description" className="api-quota-message">
          <span>{QUOTA_MESSAGE_PRIMARY}</span>
          <span>{QUOTA_MESSAGE_SECONDARY}</span>
        </p>
        <div className="api-quota-actions" aria-label="Quota actions">
          {onBrowseDemo && (
            <button type="button" onClick={onBrowseDemo} className="api-quota-action api-quota-action-primary">
              Browse Demo
            </button>
          )}
          <button
            type="button"
            onClick={onRetry}
            className={`api-quota-action ${onBrowseDemo ? 'api-quota-action-secondary' : 'api-quota-action-primary'}`}
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  )
}

export default ApiQuotaOverlay
