import React from 'react';
import { useSettings, AppSettings } from './SettingsContext';

const Settings: React.FC = () => {
    const { settings, setSettings } = useSettings();

    const handleTagToggle = (setting: keyof AppSettings['tags']) => {
        setSettings(prevSettings => ({
            ...prevSettings,
            tags: {
                ...prevSettings.tags,
                [setting]: !prevSettings.tags[setting],
            }
        }));
    };

    const handleScraperGuiToggle = () => {
        setSettings(prevSettings => ({
            ...prevSettings,
            showScraperGui: !prevSettings.showScraperGui,
        }));
    };

    const tagSettingLabels: Record<keyof AppSettings['tags'], string> = {
        showColor: 'Show Colors',
        showType: 'Show Types',
        showCompany: 'Show Brands',
    };

    return (
        <div className="container p-4 mx-auto">
            <h1 className="mb-4 text-2xl font-bold">Settings</h1>
            <div className="p-4 mb-4 bg-white rounded-lg shadow">
                <h2 className="mb-2 text-lg font-semibold">Product Tag Display</h2>
                <p className="mb-4 text-sm text-gray-600">
                    Choose which tag categories to display on product cards. Changes are saved automatically.
                </p>
                <div className="space-y-4">
                    {(Object.keys(settings.tags) as Array<keyof AppSettings['tags']>).map(key => (
                        <div key={key} className="flex items-center justify-between">
                            <span className="font-medium">{tagSettingLabels[key]}</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={settings.tags[key]}
                                    onChange={() => handleTagToggle(key)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                    ))}
                </div>
            </div>
            <div className="p-4 bg-white rounded-lg shadow">
                <h2 className="mb-2 text-lg font-semibold">UI Settings</h2>
                <div className="flex items-center justify-between">
                    <span className="font-medium">Show Scraper GUI</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings.showScraperGui}
                            onChange={handleScraperGuiToggle}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>
            </div>
        </div>
    );
};

export default Settings;
