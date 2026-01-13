# URL Routing and State Management

## Overview

The application now supports comprehensive URL-based state management, allowing users to share links that preserve their exact application state. When someone opens a shared link, the app will restore to the same view the sender had.

## Implementation Details

### Architecture

The URL routing system consists of:

1. **BrowserRouter** - Wraps the entire application in `main.tsx` to enable URL routing
2. **useURLState Hook** (`useURLState.ts`) - Custom hook that syncs application state with URL parameters
3. **App.tsx Integration** - Main app component uses URL state for all navigation and modal states
4. **Modal Components** - LoginModal and ImagePreview read from and write to URL state

### URL Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `tab` | string | Current tab (home/scraper/lists) | `?tab=lists` |
| `page` | number | Current page number in search results | `?page=3` |
| `tags` | string | Comma-separated list of selected tags | `?tags=color_red,type_shoes` |
| `preview` | string | Product ID for fullscreen preview | `?preview=123` |
| `login` | boolean | Opens login modal | `?login=true` |
| `signup` | boolean | Opens signup modal | `?signup=true` |
| `settings` | boolean | Opens settings modal | `?settings=true` |

### How It Works

1. **URL State Hook**: A custom `useURLState` hook manages URL parameters using React Router's `useSearchParams`
2. **Automatic Sync**: Application state automatically syncs to URL when changed
3. **State Restoration**: When a URL with parameters is opened, the app automatically restores that state
4. **Clean URLs**: Default values (page 1, home tab) are omitted from URL to keep it clean

### Implementation Details

- **Page number**: Only appears in URL when not on page 1
- **Tab**: Only appears in URL when not on home tab
- **Tags**: Only shown when tags are selected for searching
- **Preview**: Only present when a fullscreen preview is open
- **Modals**: Login/signup/settings parameters are only added when modals are open

All URL updates use `replace` mode (not creating browser history entries) to avoid cluttering the browser's back button navigation.

Now let me create a summary document showing what was implemented:

<function_calls>
<invoke name="create_file">
<parameter name="content"># URL Routing Implementation Summary

## Overview
The application now supports comprehensive URL-based state management, enabling users to share links that preserve their exact view of the application.

## What Was Implemented

### 1. URL State Management Hook (`useURLState.ts`)
Created a custom React hook that synchronizes application state with URL query parameters:
- Reads state from URL on load
- Updates URL when state changes
- Uses `replace` navigation to avoid cluttering browser history

### 2. Integrated URL State in App.tsx

All major application states now sync with the URL:

- **Tab Navigation** (`?tab=home|scraper|lists`)
  - Home tab (default, no param)
  - Scraper tab: `?tab=scraper`
  - My Lists page: `?tab=lists`

- **Pagination** (`?page=2`)
  - Automatically updates when navigating pages
  - Restores page number from shared links

- **Tag Selection** (`?tags=color_red,type_shoes,brand_nike`)
  - All selected tags are synced to URL
  - Shared links will pre-select the same tags
  - Tags are automatically loaded and searched on page load

- **Preview Mode** (`?preview=123`)
  - Opens fullscreen image preview for specific product ID
  - Automatically loads product details when sharing preview links
  - Closes preview when URL param is removed

- **Modal States**:
  - `?login=true` - Opens login modal
  - `?signup=true` - Opens signup modal
  - `?settings=true` - Opens settings modal

### 3. Updated Components

- **LoginModal**: Now accepts `isSignupMode` and `onToggleMode` props to sync with URL
- **ImagePreview**: Automatically syncs preview state with URL parameters
- **Main Router**: Wrapped app with BrowserRouter in `main.tsx`

## Example URLs

```
# Search for red Nike shoes on page 3
http://localhost:5173/?tags=color_red,type_shoes,brand_nike&page=3

# Open specific product preview
http://localhost:5173/?preview=456

# Direct link to My Lists page
http://localhost:5173/?tab=lists

# Open login modal
http://localhost:5173/?login=true

# Open signup modal
http://localhost:5173/?signup=true

# Combined: View red shoes page 2 with preview
http://localhost:5173/?tags=color_red,type_shoes&page=2&preview=789
```

## How It Works

1. **URL Updates Automatically**: As you navigate the app, the URL updates in real-time to reflect your current state
2. **State Restoration**: When someone opens a shared link, the app reads the URL parameters and restores the exact state
3. **Seamless Navigation**: All changes to page number, selected tags, tab selection, and modal states automatically update the URL
4. **No History Pollution**: URL changes use `replace` mode to avoid cluttering browser history with every state change

## Technical Implementation

### useURLState Hook
```typescript
const { urlState, updateURLState } = useURLState();

// Read from URL
const currentTab = urlState.tab;
const currentPage = urlState.page;
const selectedTags = urlState.tags;

// Update URL
updateURLState({ page: 3 });
updateURLState({ tags: ['color_red', 'type_shoes'] });
```

### State Synchronization
The app uses React effects to:
1. Sync URL parameters with internal state on mount
2. Update URL when internal state changes
3. Restore preview state when products are loaded

## Benefits

- **Shareable Links**: Users can share their exact view with others
- **Bookmarkable**: Specific searches and views can be bookmarked
- **Better UX**: Browser back/forward buttons work as expected
- **Deep Linking**: External links can open the app in a specific state
- **Debugging**: Easier to reproduce user issues with exact URL state