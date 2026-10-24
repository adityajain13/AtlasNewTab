# Atlas New Tab

A Firefox new-tab extension with live Unsplash landscape wallpapers, a search bar with selectable engines, and a customizable grid of circular link icons. A settings flyout controls layout live.

## Setup

1. Get a free Unsplash API access key at https://unsplash.com/developers.
2. Load the extension (`about:debugging` > This Firefox > Load Temporary Add-on > select `manifest.json`).
3. Paste your access key on the setup screen. The key is stored locally in the browser only and is never part of this repo.

## Build

Only `tailwind.css` is generated:

```
npm install
npm run build
```

Everything else is plain, unminified source.

## Credits

Photos by contributors on [Unsplash](https://unsplash.com).
