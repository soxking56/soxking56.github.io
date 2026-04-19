# Web Installer for RPG MV/MZ Live Translator 

This is an alternative web-based installer for a RPG MV/MZ Translator plugin. Normally, users would invoke installer.ps1 to install the script. 

## What it does

- Detects RPG Maker folder layouts using either `js/plugins` or `www/js/plugins`
- Copies the loader and support files from `live-translator-installer/`
- Adds the `live-translator-loader` entry to `plugins.js`
- Patches an empty `name` field in `package.json` to `Game` when needed
- Loads, edits, and saves installed `settings.json` and `translator.json`
- Links to an updated NW.js ZIP for games that fail to launch with the bundled runtime

## Requirements

- A Chromium-based browser with the File System Access API, like Chrome or Edge
- A secure context: `https://`, `http://localhost`, or another loopback address
- Read/write permission to the target game folder

## How to use

1. Open the page in a supported browser.
2. Choose the target game folder.
3. Install the plugin bundle.
4. Edit `settings.json` and `translator.json` in the UI if needed, then save.

## Translation providers

- `deepl`: Requires a DeepL API key.
- `local`: Uses a locally hosted translation endpoint and configurable model settings.

## Repository layout

- `index.html`, `app.mjs`, `installer-core.mjs`: Browser UI and install logic
- `config-editor.mjs`: Config field helpers
- `i18n.mjs`: English and Korean UI strings
- `live-translator-installer/`: Plugin files copied into the game
- `game_example/`, `game_example_2/`: Sample target folders for testing
- `tests/`: Node-based tests for config and installer behavior

## Local development

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open the served URL in a supported browser.

## Tests

Run the test suite with:

```bash
node --test tests/*.test.mjs
```
