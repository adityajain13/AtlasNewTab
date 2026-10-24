# Atlas New Tab

A Firefox new tab page with live Unsplash landscape wallpapers, a search bar with selectable engines, and a customizable grid of circular quick links. Everything is adjustable in real time from a settings flyout.

[**Install from Firefox Add-ons**](https://addons.mozilla.org/en-CA/firefox/addon/atlas-new-tab/)

![The Atlas new tab page](https://addons.mozilla.org/user-media/previews/full/377/377613.png?modified=1780445858)

## Features

- **Fresh wallpaper on every new tab.** High-resolution Unsplash photos from a search query you choose (default: `landscape wallpaper`), with photographer credit linking back to Unsplash.
- **Instant loads.** A background script keeps a cache of pre-downloaded photos and tops it up hourly or when it runs low, so tabs never wait on the network.
- **Search bar with multiple engines.** Enable the engines you want; with only one enabled, the dropdown disappears.
- **Quick links grid.** Circular icons in a grid you size yourself (columns, rows, icon size, gaps, labels). Add, edit and reorder links, and set custom icons.
- **Live settings flyout.** Reposition and resize the search bar and grid, adjust text sizes, background dim, and photo query and quality. Changes apply instantly.
- **Export and import.** Move your layout, links and custom icons between devices.
- **Private.** Settings stay in your browser. The only network calls go to Unsplash. No telemetry.

## Screenshots

| Settings panel | Customize links |
| --- | --- |
| ![Settings panel](https://addons.mozilla.org/user-media/previews/thumbs/377/377614.jpg?modified=1780445848) | ![Customize links panel](https://addons.mozilla.org/user-media/previews/thumbs/377/377615.jpg?modified=1780445848) |

## Setup

1. Install Atlas from [Firefox Add-ons](https://addons.mozilla.org/en-CA/firefox/addon/atlas-new-tab/).
2. Create a free app at the [Unsplash developer portal](https://unsplash.com/developers) and copy its **Access Key**.
3. Open a new tab and paste the key on the setup screen.

The key is stored locally in your browser and is never included in exports.

## Development

Requires Node.js. Only `tailwind.css` is generated; everything else is plain, unminified source with no bundler.

```sh
npm install
npm run build   # regenerates tailwind.css from input.css
```

To run it locally, open `about:debugging` > **This Firefox** > **Load Temporary Add-on** and select `manifest.json`.

### Project layout

| File | Purpose |
| --- | --- |
| `manifest.json` | MV2 manifest, overrides the new tab page |
| `newtab.html` / `newtab.js` | New tab UI, settings flyout, links editor |
| `background.js` | Photo cache and hourly refill |
| `newtab.css` | Styles Tailwind cannot express (animations, scrollbars) |
| `tailwind.config.js` / `input.css` | Tailwind v3 build inputs |

## Credits

Photos are provided by photographers on [Unsplash](https://unsplash.com) via the Unsplash API. Fonts: Cormorant Garamond and Rajdhani via Google Fonts.
