# Atlas - Build Instructions

## Requirements
- Node.js (any recent version)

## Steps to reproduce tailwind.css from source

1. Install Tailwind CSS:
   npm install tailwindcss@3

2. Generate tailwind.css:
   npx tailwindcss -i input.css -o tailwind.css --minify

That's it. All other files (newtab.html, newtab.js, newtab.css, background.js, manifest.json)
are unminified and require no build step.

The resulting tailwind.css should be identical to the one in the submitted zip.
