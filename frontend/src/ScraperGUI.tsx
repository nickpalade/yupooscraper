import React from 'react';

interface ScrapeProgress {
    type: 'info' | 'progress' | 'success' | 'error' | 'complete' |
           'scanning_pages' | 'page_scanned' | 'scan_complete' | 'scrape_start' |
           'fetching_page' | 'album_scanning' | 'album_found' | 'page_scanned';
    message?: string;
    current?: number;
    total?: number;
    album_url?: string;
    albums_processed?: number;
    products_inserted?: number;
    failed?: number;
    page?: number;
    albums_found?: number;
    total_albums?: number;
    will_fetch?: number;
    album_number?: number;
    max?: number;
    url?: string;
    title?: string;
    tags?: string[];
  }

interface ScraperGUIProps {
    scrapeUrl: string;
    setScrapeUrl: (url: string) => void;
    maxAlbums: number;
    setMaxAlbums: (max: number) => void;
    sliderValue: number;
    setSliderValue: (value: number) => void;
    scrapingLoading: boolean;
    scrapeError: string | null;
    scrapeSuccess: string | null;
    scrapeProgress: ScrapeProgress | null;
    scrapeLogs: ScrapeProgress[];
    handleScrape: (e: React.FormEvent) => void;
    exponentialSliderToValue: (sliderValue: number) => number;
}

const ScraperGUI: React.FC<ScraperGUIProps> = ({
    scrapeUrl,
    setScrapeUrl,
    maxAlbums,
    setMaxAlbums,
    sliderValue,
    setSliderValue,
    scrapingLoading,
    scrapeError,
    scrapeSuccess,
    scrapeProgress,
    scrapeLogs,
    handleScrape,
    exponentialSliderToValue,
}) => {
  return (
    <div className="max-w-2xl p-8 mx-auto mb-8 bg-white rounded-lg shadow-lg">
      <h2 className="mb-6 text-2xl font-bold text-gray-800">Scrape a Yupoo Store</h2>
      <form onSubmit={handleScrape} className="space-y-4">
        <div>
          <label className="block mb-2 text-sm font-semibold text-gray-700">Yupoo Store URL</label>
          <input
            type="url"
            value={scrapeUrl}
            onChange={(e) => setScrapeUrl(e.target.value)}
            placeholder="https://example.x.yupoo.com"
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={scrapingLoading}
          />
        </div>
        <div>
          <label className="block mb-2 text-sm font-semibold text-gray-700">Maximum Albums: {maxAlbums}</label>
          <input
            type="range"
            min="0"
            max="100"
            value={sliderValue}
            onChange={(e) => {
              const newSliderValue = parseFloat(e.target.value);
              setSliderValue(newSliderValue);
              setMaxAlbums(exponentialSliderToValue(newSliderValue));
            }}
            className="w-full"
            disabled={scrapingLoading}
          />
          <p className="mt-1 text-xs text-gray-500">Higher values take longer but scrape more albums</p>
        </div>
        <button
          type="submit"
          disabled={scrapingLoading}
          className="w-full py-3 font-semibold text-white transition-colors bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          {scrapingLoading ? '⏳ Scraping...' : '📥 Start Scraping'}
        </button>
      </form>
      {scrapingLoading && scrapeLogs.length > 0 && (
        <div className="mt-6 space-y-3">
          {scrapeProgress && scrapeProgress.type === 'progress' && (
            <div className="p-4 border border-blue-200 rounded-lg bg-blue-50">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-gray-800">Processing Albums</span>
                <span className="text-sm text-gray-600">{scrapeProgress.current}/{scrapeProgress.total}</span>
              </div>
              <div className="w-full h-3 bg-gray-200 rounded-full">
                <div
                  className="h-3 transition-all duration-300 bg-blue-600 rounded-full"
                  style={{ width: `${((scrapeProgress.current || 0) / (scrapeProgress.total || 1)) * 100}%` }}
                ></div>
              </div>
              <p className="mt-3 text-sm text-gray-700">
                📍 Current: <span className="font-mono text-blue-600">{scrapeProgress.album_url?.substring(0, 50)}...</span>
              </p>
            </div>
          )}
          {scrapeLogs.length > 0 && (
            <div className="p-4 overflow-y-auto border border-gray-200 rounded-lg bg-gray-50 max-h-64">
              <p className="mb-2 text-xs font-semibold text-gray-600">Activity Log:</p>
              <div className="space-y-1">
                {scrapeLogs.map((log, idx) => {
                  let displayText = '';
                  let icon = 'ℹ️';
                  let color = 'text-gray-600';
                  if (log.type === 'error') {
                    icon = '❌';
                    color = 'text-red-600';
                    displayText = log.message || 'An error occurred';
                  } else if (log.type === 'success') {
                    icon = '✅';
                    color = 'text-green-600';
                    displayText = log.message || 'Success';
                  } else if (log.type === 'page_scanned') {
                    icon = '📄';
                    displayText = `Page ${log.page}: Found ${log.albums_found} albums total`;
                  } else if (log.type === 'scan_complete') {
                    icon = '✔️';
                    color = 'text-green-600';
                    displayText = `Scan complete: ${log.total_albums} albums available, will fetch ${log.will_fetch}`;
                  } else if (log.type === 'fetching_page') {
                    icon = '🔄';
                    displayText = `Fetching page ${log.page}...`;
                  } else if (log.type === 'album_scanning') {
                    icon = '📸';
                    displayText = `Album ${log.album_number}/${log.max}: Scanning...`;
                  } else if (log.type === 'album_found') {
                    icon = '🎯';
                    color = 'text-green-600';
                    displayText = `Album ${log.album_number}: "${log.title}" ${log.tags?.length ? `[${log.tags.join(', ')}]` : ''}`;
                  } else if (log.message) {
                    displayText = log.message;
                  }
                  return (
                    <p key={idx} className={`text-xs font-mono ${color}`}>{icon} {displayText}</p>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {scrapeError && <div className="p-4 mt-4 text-red-700 border border-red-200 rounded-lg bg-red-50">⚠️ {scrapeError}</div>}
      {scrapeSuccess && <div className="p-4 mt-4 text-green-700 border border-green-200 rounded-lg bg-green-50">{scrapeSuccess}</div>}
    </div>
  );
};

export default ScraperGUI;
