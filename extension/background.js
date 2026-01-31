import './libs/socket.io.js';

// --- Configuration ---
const SERVER_URL = "https://syncmate-x068.onrender.com"; // Production URL
let socket = null;
let keepAliveInterval = null;

// Helper to get state (Using Session Storage for "Browser-Session" persistence only)
// This clears when the browser/profile closes, but survives SW sleep.
const getState = async () => {
    return new Promise(resolve => {
        // Fallback to local if session not set (for migration), but primarily use session.
        // Actually, just switching to session is cleaner for the "auto-exit" requirement.
        chrome.storage.session.get(['currentRoomId', 'chatHistory'], (res) => {
            resolve({
                currentRoomId: res.currentRoomId || null,
                chatHistory: res.chatHistory || []
            });
        });
    });
};

// Helper to save state
const saveState = (updates) => {
    chrome.storage.session.set(updates);
};

// --- Socket Initialization ---
const connectSocket = async () => {
    if (socket && socket.connected) return;

    socket = io(SERVER_URL, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        transports: ['websocket']
    });

    socket.on('connect', async () => {
        console.log(`[SyncMate] Connected to Server Level: ${socket.id} `);
        // Attempt Rejoin if we were in a room
        const { currentRoomId } = await getState();
        if (currentRoomId) {
            console.log(`[SyncMate] Rejoining Room: ${currentRoomId} `);
            socket.emit('join_room', currentRoomId, () => { });
        }
        startKeepAlive();
    });

    socket.on('disconnect', () => {
        console.log('[SyncMate] Disconnected from Server');
        // Do NOT clear storage here, as SW might just be sleeping/waking
        stopKeepAlive();
    });

    // --- Incoming Sync Events ---
    socket.on('sync_action', (payload) => {
        sendMessageToActiveTab(payload);
    });

    socket.on('sync_shorts', (payload) => {
        // Loop Protection: Only navigate if truly different
        ensureTabIsOnUrl(payload.url).then((didNavigate) => {
            if (didNavigate) {
                // Nothing extra needed, the page reload will fetch START_CHAT
            } else {
                // Currently on page, maybe just verify parameters?
                // sendMessageToActiveTab({ type: 'SHORTS_NAV', ...payload }); // Content script handles redundancy too
            }
        });
    });

    socket.on('user_joined', (payload) => {
        console.log(`[SyncMate] User Joined: ${payload.userId} `);
    });

    socket.on('signal_peer', (payload) => {
        sendMessageToActiveTab({ type: 'SIGNAL_PEER', payload });
    });

    socket.on('chat_message', async (payload) => {
        const { chatHistory } = await getState();
        const newHistory = [...chatHistory, payload];
        saveState({ chatHistory: newHistory });
        sendMessageToActiveTab({ type: 'CHAT_MESSAGE', payload });
    });
};

// --- Keep-Alive Mechanism ---
const startKeepAlive = () => {
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    keepAliveInterval = setInterval(() => {
        if (socket && socket.connected) {
            socket.emit('ping');
        }
    }, 20000);
};

const stopKeepAlive = () => {
    if (keepAliveInterval) clearInterval(keepAliveInterval);
};

// --- Navigation Listener ---
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com')) {
        const { currentRoomId, chatHistory } = await getState();
        if (currentRoomId) {
            console.log("[SyncMate] Tab Updated - Reinjecting Chat State");
            setTimeout(() => {
                chrome.tabs.sendMessage(tabId, {
                    type: 'START_CHAT',
                    roomId: currentRoomId,
                    history: chatHistory
                }).catch(() => { });
            }, 1000);
        }
    }
});

// --- Message Handling ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle async logic by returning true
    (async () => {
        if (!socket) await connectSocket();

        switch (message.type) {
            case 'CREATE_ROOM':
                socket.emit('create_room', (response) => {
                    if (response.success) {
                        saveState({ currentRoomId: response.roomId, chatHistory: [] });
                        injectOrRedirect(response.roomId);
                    }
                    sendResponse(response);
                });
                break;

            case 'JOIN_ROOM':
                socket.emit('join_room', message.roomId, (response) => {
                    if (response.success) {
                        saveState({ currentRoomId: message.roomId, chatHistory: [] });
                        injectOrRedirect(message.roomId);
                    }
                    sendResponse(response);
                });
                break;

            case 'EXIT_ROOM':
                if (socket) socket.disconnect();
                saveState({ currentRoomId: null, chatHistory: [] });
                sendMessageToActiveTab({ type: 'STOP_CHAT' });
                connectSocket(); // Ready for new
                sendResponse({ success: true });
                break;

            case 'GET_STATUS':
                const { currentRoomId } = await getState();
                sendResponse({ connected: socket && socket.connected && !!currentRoomId, roomId: currentRoomId });
                break;

            case 'VIDEO_EVENT':
                socket.emit('sync_action', message.payload);
                break;

            case 'SHORTS_NAV':
                // Outgoing Navigation: Just emit. 
                // The server will broadcast. 
                // The Receiver will check ensureTabIsOnUrl.
                // The Sender (Us) will also receive it back?
                // If using broadcast from server (socket.broadcast.emit), sender doesn't get it.
                // If using io.to(room).emit, sender gets it.
                // Assuming server uses io.to(room).
                // We need to ignore our own loop if strictly matching.
                socket.emit('sync_shorts', { url: message.url });
                break;

            case 'SIGNAL_PEER':
                socket.emit('signal_peer', message.payload);
                break;

            case 'CHAT_MESSAGE':
                const { chatHistory } = await getState();
                const newHistory = [...chatHistory, { ...message.payload, isMe: true }];
                saveState({ chatHistory: newHistory });
                socket.emit('chat_message', message.payload);
                break;
        }
    })();
    return true; // Keep channel open
});

// --- Window Close Listener (Cleanup) ---
chrome.windows.onRemoved.addListener((windowId) => {
    // Optional: Check if we should clear state?
    // With storage.session, closing the browser handles it.
    // Closing a SINGLE window might not mean exit if extension is running in background?
    // But for this use case, "Exit on window close" is requested.
    // Let's be aggressive: If no YouTube tabs are open, exit room.
    checkAndCleanup();
});

const checkAndCleanup = () => {
    chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
        if (tabs.length === 0) {
            console.log("[SyncMate] No YT tabs open. Cleaning up session.");
            if (socket) socket.disconnect();
            saveState({ currentRoomId: null, chatHistory: [] });
            connectSocket();
        }
    });
};

// --- Helpers ---
const injectOrRedirect = (roomId) => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const tab = tabs[0];
        const { chatHistory } = await getState();

        if (tab && tab.url.includes("youtube.com")) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'START_CHAT',
                roomId,
                history: chatHistory
            });
        } else {
            chrome.tabs.update(tab.id, { url: "https://www.youtube.com" });
        }
    });
};

const ensureTabIsOnUrl = async (targetUrl) => {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab) return resolve(false);

            // Strict checking to prevent infinite reload loops
            // Ignore query params order maybe? For now exact match is safest for stopping loops.
            // If we are at "youtube.com/watch?v=A", and target is "youtube.com/watch?v=A", DO NOT RELOAD.

            // Normalize: Remove trailing slashes
            const current = tab.url.replace(/\/+$/, '');
            const target = targetUrl.replace(/\/+$/, '');

            if (current === target) {
                // Already there. Do nothing.
                console.log("[SyncMate] Already on target URL. Ignoring nav.");
                resolve(false);
            } else {
                console.log(`[SyncMate] Navigating from ${current} to ${target}`);
                chrome.tabs.update(tab.id, { url: targetUrl }, () => {
                    resolve(true);
                });
            }
        });
    });
};

const sendMessageToActiveTab = async (payload) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id && tab.url.includes("youtube.com")) {
        chrome.tabs.sendMessage(tab.id, payload).catch(err => {
            // Content script might not be ready
        });
    }
};

// Initialize
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }); // Allow accessible
connectSocket();
