import React, { useState } from 'react';
import { Loader, Download, AlertCircle, CheckCircle, FileText, RotateCw, Image, Target, AlertTriangle, MapPin, Palette } from 'lucide-react';

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
    handleClearDatabase: () => void;
    clearingDatabase: boolean;
    clearDatabaseMessage: string | null;
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
    handleClearDatabase,
    clearingDatabase,
    clearDatabaseMessage,
}) => {
  const [adjustingColorsLoading, setAdjustingColorsLoading] = useState<boolean>(false);
  const [adjustColorsMessage, setAdjustColorsMessage] = useState<string | null>(null);

  const handleAdjustColors = async () => {
    setAdjustingColorsLoading(true);
    setAdjustColorsMessage(null);
    try {
      const response = await fetch('/api/colors/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      if (response.ok) {
        setAdjustColorsMessage(`Success: ${data.message} ${JSON.stringify(data.summary.average_percentages)}`);
      } else {
        setAdjustColorsMessage(`Error: ${data.detail || 'Failed to adjust colors'}`);
      }
    } catch (error) {
      setAdjustColorsMessage(`Network error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setAdjustingColorsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl p-8 mx-auto mb-8 border shadow-2xl backdrop-blur-xl bg-white/10 border-white/20 rounded-xl shadow-black/30">
      <h2 className="mb-6 text-2xl font-bold text-white">Scrape a Yupoo Store</h2>
      <form onSubmit={handleScrape} className="space-y-4">
        <div>
          <label className="block mb-2 text-sm font-semibold text-white">Yupoo Store URL</label>
          <input
            type="url"
            value={scrapeUrl}
            onChange={(e) => setScrapeUrl(e.target.value)}
            placeholder="https://example.x.yupoo.com"
            className="w-full p-3 text-white border rounded-lg backdrop-blur-md bg-white/10 border-white/20 placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:shadow-lg focus:shadow-blue-500/30"
            disabled={scrapingLoading}
          />
        </div>
        <div>
          <label className="block mb-2 text-sm font-semibold text-white">Maximum Albums: {maxAlbums}</label>
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
          className="flex items-center justify-center w-full gap-2 py-3 font-semibold text-white transition-colors border rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 backdrop-blur-md border-white/20 hover:shadow-lg hover:shadow-blue-500/50 disabled:bg-gray-400"
        >
          {scrapingLoading ? (
            <>
              <Loader size={20} className="animate-spin" />
              Scraping...
            </>
          ) : (
            <>
              <Download size={20} />
              Start Scraping
            </>
          )}
        </button>
      </form>
      {/* New button for color adjustment */}
      <button
        onClick={handleAdjustColors}
        disabled={adjustingColorsLoading || scrapingLoading}
        className="flex items-center justify-center w-full gap-2 py-3 mt-4 font-semibold text-white transition-colors border rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 backdrop-blur-md border-white/20 hover:shadow-lg hover:shadow-purple-500/50 disabled:bg-gray-400"
      >
        {adjustingColorsLoading ? (
          <>
            <Loader size={20} className="animate-spin" />
            Adjusting Colors...
          </>
        ) : (
          <>
            <Palette size={20} />
            Adjust Special Color Percentages
          </>
        )}
      </button>

      {/* Clear Database button */}
      <button
        onClick={handleClearDatabase}
        disabled={clearingDatabase || scrapingLoading || adjustingColorsLoading}
        className="flex items-center justify-center w-full gap-2 py-3 mt-4 font-semibold text-white transition-colors border rounded-lg bg-gradient-to-r from-red-500 to-rose-500 backdrop-blur-md border-white/20 hover:shadow-lg hover:shadow-red-500/50 disabled:bg-gray-400"
      >
        {clearingDatabase ? (
          <>
            <Loader size={20} className="animate-spin" />
            Clearing Database...
          </>
        ) : (
          <>
            <Trash2 size={20} />
            Clear Database
          </>
        )}
      </button>
      {clearDatabaseMessage && (
        <div className={`flex items-center gap-2 p-4 mt-4 text-white transition-opacity border rounded-lg shadow-lg backdrop-blur-md ${clearDatabaseMessage.includes('Error') ? 'bg-red-500/30 border-red-400/50 shadow-red-500/30' : 'bg-green-500/30 border-green-400/50 shadow-green-500/30'}`}>
          {clearDatabaseMessage.includes('Error') ? <AlertTriangle size={20} /> : <CheckCircle size={20} />} {clearDatabaseMessage}
        </div>
      )}


      {adjustColorsMessage && (
        <div className={`flex items-center gap-2 p-4 mt-4 text-white transition-opacity border rounded-lg shadow-lg backdrop-blur-md ${adjustColorsMessage.startsWith('Error') ? 'bg-red-500/30 border-red-400/50 shadow-red-500/30' : 'bg-green-500/30 border-green-400/50 shadow-green-500/30'}`}>
          {adjustColorsMessage.startsWith('Error') ? <AlertTriangle size={20} /> : <CheckCircle size={20} />} {adjustColorsMessage}
        </div>
      )}

      {scrapingLoading && scrapeLogs.length > 0 && (
        <div className="mt-6 space-y-3">
          {scrapeProgress && scrapeProgress.type === 'progress' && (
            <div className="p-4 border rounded-lg shadow-lg backdrop-blur-md bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-white/20 shadow-blue-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-white">Processing Albums</span>
                <span className="text-sm text-white/70">{scrapeProgress.current}/{scrapeProgress.total}</span>
              </div>
              <div className="w-full h-3 rounded-full bg-white/10">
                <div
                  className="h-3 transition-all duration-300 rounded-full shadow-lg bg-gradient-to-r from-blue-500 to-cyan-500 shadow-blue-500/50"
                  style={{ width: `${((scrapeProgress.current || 0) / (scrapeProgress.total || 1)) * 100}%` }}
                ></div>
              </div>
              <p className="flex items-center gap-2 mt-3 text-sm text-white/90">
                <MapPin size={16} className="text-cyan-400" /> <span className="font-mono text-white/70">{scrapeProgress.album_url?.substring(0, 50)}...</span>
              </p>
            </div>
          )}
          {scrapeLogs.length > 0 && (
            <div className="p-4 overflow-y-auto border rounded-lg shadow-lg backdrop-blur-md bg-white/10 border-white/20 shadow-black/20 max-h-64">
              <p className="mb-2 text-xs font-semibold text-white/70">Activity Log:</p>
              <div className="space-y-1">
                {scrapeLogs.map((log, idx) => {
                  let displayText = '';
                  let icon: React.ReactNode = <AlertCircle size={16} />;
                  let color = 'text-gray-600';
                  if (log.type === 'error') {
                    icon = <AlertCircle size={16} />;
                    color = 'text-red-600';
                    displayText = log.message || 'An error occurred';
                  } else if (log.type === 'success') {
                    icon = <CheckCircle size={16} />;
                    color = 'text-green-600';
                    displayText = log.message || 'Success';
                  } else if (log.type === 'page_scanned') {
                    icon = <FileText size={16} />;
                    displayText = `Page ${log.page}: Found ${log.albums_found} albums total`;
                  } else if (log.type === 'scan_complete') {
                    icon = <CheckCircle size={16} />;
                    color = 'text-green-600';
                    displayText = `Scan complete: ${log.total_albums} albums available, will fetch ${log.will_fetch}`;
                  } else if (log.type === 'fetching_page') {
                    icon = <RotateCw size={16} className="animate-spin" />;
                    displayText = `Fetching page ${log.page}...`;
                  } else if (log.type === 'album_scanning') {
                    icon = <Image size={16} />;
                    displayText = `Album ${log.album_number}/${log.max}: Scanning...`;
                  } else if (log.type === 'album_found') {
                    icon = <Target size={16} />;
                    color = 'text-green-600';
                    displayText = `Album ${log.album_number}: "${log.title}" ${log.tags?.length ? `[${log.tags.join(', ')}]` : ''}`;
                  } else if (log.message) {
                    displayText = log.message;
                  }
                  return (
                    <p key={idx} className={`text-xs font-mono ${color} flex items-center gap-2`}>{icon} {displayText}</p>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {scrapeError && <div className="flex items-center gap-2 p-4 mt-4 text-white transition-opacity border rounded-lg shadow-lg backdrop-blur-md bg-red-500/30 border-red-400/50 shadow-red-500/30"><AlertTriangle size={20} /> {scrapeError}</div>}
      {scrapeSuccess && <div className="flex items-center gap-2 p-4 mt-4 text-white transition-opacity border rounded-lg shadow-lg backdrop-blur-md bg-green-500/30 border-green-400/50 shadow-green-500/30"><CheckCircle size={20} /> {scrapeSuccess}</div>}
    </div>
  );
};

export default ScraperGUI;
