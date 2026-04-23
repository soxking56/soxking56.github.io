(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }

    // RPG Maker command codes that contain translatable text
    // 101 = Show Message (MV/MZ), 401 = message continuation line
    // 102 = Show Choices, 402 = choice branch
    // 405 = scroll text line
    const TRANSLATABLE_CODES = new Set([101, 401, 102, 402, 405]);

    const SCAN_DEPTH_INITIAL = 60;
    const SCAN_DEPTH_MAX = 600;
    const SCAN_DEPTH_STEP = 60;
    // Minimum ms between scans to avoid hammering the main thread
    const SCAN_INTERVAL_MS = 500;

    function extractTextFromCommand(cmd) {
        if (!cmd || typeof cmd.code !== 'number') return null;
        const code = cmd.code;
        const params = cmd.parameters;

        // 101: Show Message header — params[0]=faceName, [1]=faceIndex, [2]=background, [3]=position, [4]=speakerName (MZ only)
        // The actual text is in subsequent 401 lines; skip 101 itself (no text in params)
        if (code === 101) {
            // MZ: speaker name in params[4]
            if (params && typeof params[4] === 'string' && params[4].trim()) {
                return params[4].trim();
            }
            return null;
        }

        // 401: message text line
        if (code === 401) {
            if (params && typeof params[0] === 'string' && params[0].trim()) {
                return params[0].trim();
            }
            return null;
        }

        // 402: choice branch label
        if (code === 402) {
            if (params && typeof params[1] === 'string' && params[1].trim()) {
                return params[1].trim();
            }
            return null;
        }

        // 102: Show Choices — params[0] is array of choice strings
        if (code === 102) {
            if (params && Array.isArray(params[0])) {
                return params[0].filter((s) => typeof s === 'string' && s.trim()).join('\n') || null;
            }
            return null;
        }

        // 405: scroll text line
        if (code === 405) {
            if (params && typeof params[0] === 'string' && params[0].trim()) {
                return params[0].trim();
            }
            return null;
        }

        return null;
    }

    function collectCommandsFromInterpreter(interpreter, currentDepth, fullScan) {
        const results = [];
        if (!interpreter) return results;

        try {
            const list = interpreter._list || interpreter.list;
            const index = typeof interpreter._index === 'number'
                ? interpreter._index
                : (typeof interpreter.index === 'number' ? interpreter.index : 0);

            if (Array.isArray(list)) {
                // fullScan: 리스트 전체(0~끝), 아니면 현재 index 이후 currentDepth개
                const start = fullScan ? 0 : Math.max(0, index + 1);
                const end = fullScan ? list.length : Math.min(list.length, index + 1 + currentDepth);
                for (let i = start; i < end; i++) {
                    const cmd = list[i];
                    if (cmd && TRANSLATABLE_CODES.has(cmd.code)) {
                        results.push(cmd);
                    }
                }
            }

            // Also scan child interpreter if active (e.g., common events)
            const child = interpreter._childInterpreter || interpreter.childInterpreter;
            if (child && child !== interpreter) {
                const childResults = collectCommandsFromInterpreter(child, Math.floor(currentDepth / 2), fullScan);
                for (const c of childResults) results.push(c);
            }
        } catch (_) {}

        return results;
    }

    function resolveInterpreters() {
        const interpreters = [];
        try {
            // $gameMap._interpreter is the main map interpreter
            if (typeof $gameMap !== 'undefined' && $gameMap && $gameMap._interpreter) {
                interpreters.push($gameMap._interpreter);
            }
        } catch (_) {}
        try {
            // $gameTroop._interpreter for battle events
            if (typeof $gameTroop !== 'undefined' && $gameTroop && $gameTroop._interpreter) {
                interpreters.push($gameTroop._interpreter);
            }
        } catch (_) {}
        try {
            // Fallback: scene-level interpreter (some plugins expose this)
            if (typeof SceneManager !== 'undefined'
                && SceneManager._scene
                && SceneManager._scene._interpreter) {
                const si = SceneManager._scene._interpreter;
                if (!interpreters.includes(si)) interpreters.push(si);
            }
        } catch (_) {}
        return interpreters;
    }

    globalScope.LiveTranslatorModules.createLookAheadPrefetcher = function createLookAheadPrefetcher(options) {
        const {
            translationCache,
            stripRpgmEscapes,
            logger,
            settings = {},
        } = options || {};

        if (!translationCache || typeof translationCache.requestTranslation !== 'function') {
            throw new Error('[LookAheadPrefetcher] translationCache with requestTranslation is required.');
        }

        const prefetchSettings = (settings && settings.prefetch) || {};
        const enabled = prefetchSettings.enabled !== false; // default: true
        const scanDepthInitial = Number(prefetchSettings.scanDepth) > 0
            ? Number(prefetchSettings.scanDepth)
            : SCAN_DEPTH_INITIAL;
        const scanDepthMax = Number(prefetchSettings.scanDepthMax) > 0
            ? Number(prefetchSettings.scanDepthMax)
            : SCAN_DEPTH_MAX;
        const scanDepthStep = Number(prefetchSettings.scanDepthStep) > 0
            ? Number(prefetchSettings.scanDepthStep)
            : SCAN_DEPTH_STEP;
        const intervalMs = Number(prefetchSettings.intervalMs) > 0
            ? Number(prefetchSettings.intervalMs)
            : SCAN_INTERVAL_MS;

        if (!enabled) {
            if (logger) logger.info('[LookAheadPrefetcher] Disabled via settings.prefetch.enabled=false');
            return { start() {}, stop() {} };
        }

        let timerId = null;
        let running = false;
        let currentScanDepth = scanDepthInitial;
        let fullScanReached = false;
        const queued = new Set(); // tracks texts currently being prefetched to avoid duplicates

        function stripText(raw) {
            if (typeof stripRpgmEscapes === 'function') {
                try { return stripRpgmEscapes(raw); } catch (_) {}
            }
            // Minimal fallback: strip \X[n] style escape codes
            return String(raw).replace(/\\[A-Z]+\[\d*\]/gi, '').replace(/\\[.$|^!><{}\\]/g, '').trim();
        }

        function prefetchText(raw) {
            const text = stripText(raw);
            if (!text) return;
            if (translationCache.shouldSkip && translationCache.shouldSkip(text)) return;
            if (translationCache.completed && translationCache.completed.has(text)) return;
            if (translationCache.ongoing && translationCache.ongoing.has(text)) return;
            if (queued.has(text)) return;

            queued.add(text);
            translationCache.requestTranslation(text).then(
                () => { queued.delete(text); },
                () => { queued.delete(text); }
            );
        }

        function scan() {
            if (!running) return;
            try {
                const interpreters = resolveInterpreters();
                for (const interp of interpreters) {
                    const cmds = collectCommandsFromInterpreter(interp, currentScanDepth, fullScanReached);
                    for (const cmd of cmds) {
                        const text = extractTextFromCommand(cmd);
                        if (text) {
                            // 102 (choices) may return newline-joined; prefetch each line separately
                            for (const line of text.split('\n')) {
                                prefetchText(line);
                            }
                        }
                    }
                }

                // 매 tick마다 scanDepth를 step씩 늘려 최대치에 도달하면 전체 스캔으로 전환
                if (!fullScanReached) {
                    currentScanDepth = Math.min(currentScanDepth + scanDepthStep, scanDepthMax);
                    if (currentScanDepth >= scanDepthMax) {
                        fullScanReached = true;
                        if (logger) logger.info('[LookAheadPrefetcher] Full-event scan mode activated');
                    }
                }
            } catch (err) {
                if (logger) logger.warn('[LookAheadPrefetcher] scan error:', err);
            }
        }

        function tick() {
            if (!running) return;
            scan();
            timerId = setTimeout(tick, intervalMs);
        }

        function start() {
            if (running) return;
            running = true;
            currentScanDepth = scanDepthInitial;
            fullScanReached = false;
            if (logger) logger.info(`[LookAheadPrefetcher] Started (scanDepth=${scanDepthInitial}→${scanDepthMax}, interval=${intervalMs}ms)`);
            timerId = setTimeout(tick, intervalMs);
        }

        function stop() {
            running = false;
            if (timerId !== null) {
                clearTimeout(timerId);
                timerId = null;
            }
            queued.clear();
            currentScanDepth = scanDepthInitial;
            fullScanReached = false;
            if (logger) logger.info('[LookAheadPrefetcher] Stopped');
        }

        return { start, stop };
    };
})();
