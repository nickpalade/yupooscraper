import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Define the shape of the settings
export interface AppSettings {
  tags: {
    showColor: boolean;
    showType: boolean;
    showCompany: boolean;
  };
  darkMode: boolean; // Add darkMode to settings
}

// Define the context shape
interface SettingsContextType {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  darkMode: boolean;
  updateDarkMode: (value: boolean) => void;
}

// Default settings
const defaultSettings: AppSettings = {
  tags: {
    showColor: true,
    showType: true,
    showCompany: true,
  },
  darkMode: false, // Default to light mode
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
        // Basic validation and migration for existing settings
        let currentSettings = { ...defaultSettings, ...parsed }; // Merge default with saved
        
        if (parsed.tags) {
          if ('showItem' in parsed.tags) { // Migrate old 'showItem' to 'showType'
            currentSettings.tags.showType = parsed.tags.showItem;
            delete parsed.tags.showItem; // Clean up old key if desired
          }
        }

        // Ensure darkMode is a boolean, default to false if not found
        currentSettings.darkMode = typeof parsed.darkMode === 'boolean' ? parsed.darkMode : defaultSettings.darkMode;
        
        return currentSettings;
      }

      // Old tagSettings migration
      const oldTagSettings = localStorage.getItem('tagSettings');
      if (oldTagSettings) {
        const parsed = JSON.parse(oldTagSettings);
        if ('showColor' in parsed && ('showItem' in parsed || 'showType' in parsed) && 'showCompany' in parsed) {
          const newSettings: AppSettings = {
            ...defaultSettings,
            tags: { 
              showColor: parsed.showColor,
              showType: parsed.showItem || parsed.showType,
              showCompany: parsed.showCompany,
            },
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

  // Directly manage darkMode for easier toggling and persistence
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const savedDarkMode = localStorage.getItem('darkMode');
      return savedDarkMode === 'true'; // Default to false (light mode) if not explicitly 'true'
    } catch (error) {
      console.error('Error reading darkMode from localStorage:', error);
      return defaultSettings.darkMode;
    }
  });

  // Effect to update localStorage whenever darkMode changes
  useEffect(() => {
    try {
      localStorage.setItem('darkMode', String(darkMode));
    } catch (error) {
      console.error('Error saving darkMode to localStorage:', error);
    }
  }, [darkMode]);

  // Effect to apply theme to HTML element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);


  // Function to update dark mode state and settings
  const updateDarkMode = useCallback((value: boolean) => {
    setDarkMode(value);
    setSettings(prev => ({
      ...prev,
      darkMode: value,
    }));
  }, []);


  // Effect to save all settings (excluding darkMode which is handled separately for simplicity)
  // This effect needs to be careful not to overwrite darkMode if it's managed separately
  useEffect(() => {
    try {
      // Only save non-darkMode settings here, as darkMode has its own effect
      const { darkMode: _, ...settingsToSave } = settings;
      localStorage.setItem('settings', JSON.stringify(settingsToSave));
    } catch (error) {
      console.error('Error saving settings to localStorage:', error);
    }
  }, [settings]);


  return (
    <SettingsContext.Provider value={{ settings, setSettings, darkMode, updateDarkMode }}>
      {children}
    </SettingsContext.Provider>
  );
};

// ============ SETTINGS MODAL COMPONENT ============

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, setSettings, darkMode, updateDarkMode } = useSettings();

  const handleTagToggle = (setting: keyof AppSettings['tags']) => {
    setSettings(prevSettings => ({
      ...prevSettings,
      tags: {
        ...prevSettings.tags,
        [setting]: !prevSettings.tags[setting],
      }
    }));
  };

  const tagSettingLabels: Record<keyof AppSettings['tags'], string> = {
    showColor: 'Show Colors',
    showType: 'Show Types',
    showCompany: 'Show Brands',
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center" 
      style={{
        backgroundColor: isOpen 
          ? (darkMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.2)')
          : (darkMode ? 'rgba(0, 0, 0, 0)' : 'rgba(0, 0, 0, 0)'),
        backdropFilter: isOpen ? 'blur(8px)' : 'blur(0px)',
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? 'auto' : 'none',
        transition: 'all 300ms ease-in-out',
      }}
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md p-8 overflow-y-auto rounded-2xl max-h-[90vh] transition-all duration-300" 
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: darkMode ? 'var(--glass-bg)' : 'rgba(255, 255, 255, 0.7)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 1px 1px 0 rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(25px)',
          transform: isOpen ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-20px)',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-bold" style={{ color: 'var(--text-color)' }}>Settings</h2>
          <button
            onClick={onClose}
            className="p-2 transition-all duration-200 rounded-full hover:scale-110"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: 'var(--text-color)',
            }}
          >
            <span className="text-2xl">×</span>
          </button>
        </div>

        <div className="pb-8 mb-8" style={{
          borderBottom: '1px solid var(--glass-border)',
        }}>
          <h3 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-color)' }}>Product Tag Display</h3>
          <p className="mb-6 text-sm opacity-80" style={{ color: 'var(--text-color)' }}>
            Choose which tag categories to display on product cards. Changes are saved automatically.
          </p>
          <div className="space-y-4">
            {(Object.keys(settings.tags) as Array<keyof AppSettings['tags']>).map(key => (
              <div key={key} className="flex items-center justify-between p-4 transition-all duration-200 rounded-xl" style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--glass-border)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              }}>
                <span className="font-medium" style={{ color: 'var(--text-color)' }}>{tagSettingLabels[key]}</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.tags[key]}
                    onChange={() => handleTagToggle(key)}
                    className="sr-only peer"
                  />
                  <div 
                    className="w-12 h-7 rounded-full peer transition-all duration-300 after:content-[''] after:absolute after:top-1 after:left-1 after:rounded-full after:h-5 after:w-5 after:transition-all after:duration-300"
                    style={{
                      backgroundColor: settings.tags[key] ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.2)',
                      boxShadow: settings.tags[key] ? '0 0 12px var(--primary-color)' : 'none',
                    }}
                  >
                    <div
                      className="absolute w-5 h-5 transition-all duration-300 rounded-full top-1 left-1"
                      style={{
                        backgroundColor: 'var(--button-text)',
                        transform: settings.tags[key] ? 'translateX(20px)' : 'translateX(0)',
                      }}
                    />
                  </div>
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-8">
          <h3 className="mb-3 text-lg font-semibold" style={{ color: 'var(--text-color)' }}>Theme Settings</h3>
          <div className="flex items-center justify-between p-4 transition-all duration-200 rounded-xl" style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--glass-border)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}>
            <span className="font-medium" style={{ color: 'var(--text-color)' }}>Dark Mode</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={darkMode}
                onChange={(e) => updateDarkMode(e.target.checked)}
                className="sr-only peer"
              />
              <div 
                className="w-12 h-7 rounded-full peer transition-all duration-300 after:content-[''] after:absolute after:top-1 after:left-1 after:rounded-full after:h-5 after:w-5 after:transition-all after:duration-300"
                style={{
                  backgroundColor: darkMode ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.2)',
                  boxShadow: darkMode ? '0 0 12px var(--primary-color)' : 'none',
                }}
              >
                <div
                  className="absolute w-5 h-5 transition-all duration-300 rounded-full top-1 left-1"
                  style={{
                    backgroundColor: 'var(--button-text)',
                    transform: darkMode ? 'translateX(20px)' : 'translateX(0)',
                  }}
                />
              </div>
            </label>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full px-4 py-3 rounded-xl font-semibold transition-all duration-300 hover:scale-[1.02] hover:shadow-lg"
          style={{
            backgroundColor: 'var(--button-bg)',
            color: 'var(--button-text)',
            border: '1px solid var(--glass-border)',
            boxShadow: '0 0 20px var(--primary-color)',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
};

