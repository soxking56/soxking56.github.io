This is a WIP for an alternative web-based installer for a RPG MV/MZ Translator plugin. Normally, users would invoke installer.ps1 to install the script. Instead, this project will take that functionality and put it inside a static website.

live-translator-installer/ - the raw translator plugin.
game_example/ - injection destination

Project rules
1. Static website only - No server side help!
2. [ ] Emulate the functionality of the installer.ps1 file in a nice, user friendly GUI way.
3. [ ] (To be implemented) settings.json and translator.json validation with DeepL API key input and validation.
4. [ ] (To be implemented) Update NW.JS version.

How it works
1. User goes to example.com where this project is hosted.
2. User is prompted a folder picker (target: Chrome)
3. User selects the game folder (in which case, we are experimenting with game_example/)
4. The website injects the JS files (hosted alongside the main page) to the appropriate folders and edits appropriate files, perfectly emulating the ps1 script behavior.

