import React, { createContext, useContext, useState, useEffect } from 'react';

// Define the shape of the settings
export interface AppSettings {
  tags: {
    showColor: boolean;
    showType: boolean;
    showCompany: boolean;
  };
  showScraperGui: boolean;
}

// Define the context shape
interface SettingsContextType {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

// Default settings
const defaultSettings: AppSettings = {
  tags: {
    showColor: true,
    showType: true,
    showCompany: true,
  },
  showScraperGui: false,
};

// Create the context
const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// Custom hook to use the settings context
export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

// Provider component
export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const savedSettings = localStorage.getItem('settings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        // Basic validation to ensure saved settings match the new shape
        if (parsed.tags && 'showColor' in parsed.tags && ('showItem' in parsed.tags || 'showType' in parsed.tags) && 'showCompany' in parsed.tags && 'showScraperGui' in parsed) {
          // Migration from showItem to showType
          if ('showItem' in parsed.tags) {
            parsed.tags.showType = parsed.tags.showItem;
            delete parsed.tags.showItem;
          }
          return parsed;
        }
      }
      // Migration for old settings
      const oldTagSettings = localStorage.getItem('tagSettings');
      if (oldTagSettings) {
        const parsed = JSON.parse(oldTagSettings);
        if ('showColor' in parsed && ('showItem' in parsed || 'showType' in parsed) && 'showCompany' in parsed) {
          const newSettings = {
            tags: { 
              showColor: parsed.showColor,
              showType: parsed.showItem || parsed.showType,
              showCompany: parsed.showCompany,
            },
            showScraperGui: false,
          };
          localStorage.setItem('settings', JSON.stringify(newSettings));
          localStorage.removeItem('tagSettings');
          return newSettings;
        }
      }
      return defaultSettings;
    } catch (error) {
      console.error('Error reading settings from localStorage:', error);
      return defaultSettings;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('settings', JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings to localStorage:', error);
    }
  }, [settings]);

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

