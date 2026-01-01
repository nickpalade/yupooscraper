import React, { useState } from 'react';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Product, TagCategory, formatTag } from './types';

interface TagSearchSectionProps {
  allTags: string[];
  selectedTags: Set<string>;
  toggleTag: (tag: string) => void;
  clearSelectedTags: () => void;
  colorSearchQuery: string;
  setColorSearchQuery: (query: string) => void;
  typeSearchQuery: string;
  setTypeSearchQuery: (query: string) => void;
  brandSearchQuery: string;
  setBrandSearchQuery: (query: string) => void;
  exclusiveTypeSearch: boolean;
  setExclusiveTypeSearch: (exclusive: boolean) => void;
  performSearch: (tagsToSearch: Set<string>) => Promise<void>;
}

const TagSearchSection: React.FC<TagSearchSectionProps> = ({
  allTags,
  selectedTags,
  toggleTag,
  clearSelectedTags,
  colorSearchQuery,
  setColorSearchQuery,
  typeSearchQuery,
  setTypeSearchQuery,
  brandSearchQuery,
  setBrandSearchQuery,
  exclusiveTypeSearch,
  setExclusiveTypeSearch,
  performSearch,
}) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    color: false,
    type: false,
    company: false,
  });

  const toggleSection = (cat: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [cat]: !prev[cat],
    }));
  };

  const categories: TagCategory = { color: [], type: [], brand: [] };
  allTags.forEach(tag => {
    if (tag.startsWith('color_')) categories.color.push(tag);
    else if (tag.startsWith('type_')) categories.type.push(tag);
    else if (tag.startsWith('company_')) categories.brand.push(tag);
  });

  const categoryInfo: Array<[keyof TagCategory, string, string]> = [
    ['color', 'Color', 'colorSearchQuery'],
    ['type', 'Type', 'typeSearchQuery'],
    ['brand', 'Brand', 'brandSearchQuery'], // Changed from 'company' to 'brand'
  ];

  const getSearchValue = (catKey: string) => {
    if (catKey === 'colorSearchQuery') return colorSearchQuery;
    if (catKey === 'typeSearchQuery') return typeSearchQuery;
    if (catKey === 'brandSearchQuery') return brandSearchQuery;
    return '';
  };

  const setSearchValue = (catKey: string, value: string) => {
    if (catKey === 'colorSearchQuery') setColorSearchQuery(value);
    if (catKey === 'typeSearchQuery') setTypeSearchQuery(value);
    if (catKey === 'brandSearchQuery') setBrandSearchQuery(value);
  };

  const handleExclusiveTypeSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;
    setExclusiveTypeSearch(isChecked);
    // Trigger search with the current selected tags
    performSearch(selectedTags);
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-color)' }}>Available Tags</h3>
        {selectedTags.size > 0 && (
          <button onClick={clearSelectedTags} className="text-sm font-medium transition-colors" style={{ color: 'var(--accent-color)' }}>
            Clear all ({selectedTags.size} selected)
          </button>
        )}
      </div>

      <div className="space-y-4">
        {categoryInfo.map(([cat, label, searchKey]) => {
          let catTags = categories[cat];
          const searchValue = getSearchValue(searchKey);
          const isExpanded = expandedSections[cat];

          // Filter by search query
          if (searchValue) {
            catTags = catTags.filter(tag =>
              formatTag(tag).toLowerCase().includes(searchValue.toLowerCase())
            );
          }

          if (categories[cat].length === 0) return null;

          return (
            <div key={cat} className="glass-container">
              <div
                onClick={() => toggleSection(cat)}
                className="flex items-center justify-between p-3 transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'var(--glass-bg)',
                  borderColor: 'var(--glass-border)',
                  color: 'var(--text-color)'
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">{label}:</span>
                  <span className="text-sm">({categories[cat].length})</span>
                </div>
                <span className="text-xl">
                  {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </span>
              </div>

              {isExpanded && (
                <div className="p-3 space-y-3" style={{ borderTop: '1px solid var(--border-color)' }}>
                  <input
                    type="text"
                    placeholder={`Search ${label.toLowerCase()}...`}
                    value={searchValue}
                    onChange={(e) => setSearchValue(searchKey, e.target.value)}
                    className="w-full px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-opacity-50"
                    style={{
                      backgroundColor: 'var(--input-bg)',
                      border: '1px solid var(--input-border)',
                      color: 'var(--input-text)',
                      outlineColor: 'var(--primary-color)',
                      boxShadow: 'var(--glass-shadow)',
                    }}
                  />

                  {cat === 'type' && (
                    <div className="flex items-center mt-2">
                      <input
                        type="checkbox"
                        id="exclusiveTypeSearch"
                        checked={exclusiveTypeSearch}
                        onChange={handleExclusiveTypeSearchChange}
                        className="mr-2 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--input-border)' }}
                      />
                      <label htmlFor="exclusiveTypeSearch" className="text-sm cursor-pointer" style={{ color: 'var(--text-color)' }}>
                        Exclusive Type Search
                      </label>
                    </div>
                  )}

                  {cat === 'brand' ? (
                    // Alphabetical grouping for brands
                    (() => {
                      const sortedTags = catTags.sort((a, b) =>
                        formatTag(a).localeCompare(formatTag(b))
                      );

                      const groupedByLetter: Record<string, string[]> = {};
                      sortedTags.forEach(tag => {
                        const firstLetter = formatTag(tag).charAt(0).toUpperCase();
                        if (!groupedByLetter[firstLetter]) {
                          groupedByLetter[firstLetter] = [];
                        }
                        groupedByLetter[firstLetter].push(tag);
                      });

                      return catTags.length > 0 ? (
                        Object.entries(groupedByLetter).map(([letter, letterTags]) => (
                          <div key={`${cat}-${letter}`}>
                            <p className="mb-2 text-xs font-semibold uppercase" style={{ color: 'var(--text-color)' }}>{letter}</p>
                            <div className="flex flex-wrap gap-2 ml-2">
                              {letterTags.map((tag) => (
                                <button
                                  key={tag}
                                  onClick={() => toggleTag(tag)}
                                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors whitespace-nowrap glass-button glow-${cat} ${
                                    selectedTags.has(tag)
                                      ? 'shadow-lg'
                                      : ''
                                  }`}
                                  style={{
                                    backgroundColor: selectedTags.has(tag) ? 'var(--primary-color)' : `var(--tag-${cat}-bg)`,
                                    color: selectedTags.has(tag) ? 'var(--button-text)' : `var(--tag-${cat}-text)`,
                                    borderColor: selectedTags.has(tag) ? 'var(--primary-color)' : `var(--tag-${cat}-bg)`,
                                  }}
                                >
                                  {formatTag(tag)}
                                  {selectedTags.has(tag) && ' ✓'}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm italic" style={{ color: 'var(--text-color)' }}>No results found</p>
                      );
                    })()
                  ) : (
                    // No grouping for colors and types
                    catTags.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {catTags.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => toggleTag(tag)}
                            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors whitespace-nowrap glass-button ${
                              selectedTags.has(tag)
                                ? 'shadow-lg'
                                : ''
                            }`}
                            style={{
                              backgroundColor: selectedTags.has(tag) ? 'var(--primary-color)' : `var(--tag-${cat}-bg)`,
                              color: selectedTags.has(tag) ? 'var(--button-text)' : `var(--tag-${cat}-text)`,
                              borderColor: selectedTags.has(tag) ? 'var(--primary-color)' : `var(--tag-${cat}-bg)`,
                            }}
                          >
                            {formatTag(tag)}
                            {selectedTags.has(tag) && ' ✓'}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm italic" style={{ color: 'var(--text-color)' }}>No results found</p>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TagSearchSection;