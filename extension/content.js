// SyncMate Content Script
// Sensors & Actuators for YouTube

console.log("%c [SyncMate] Engine Started ", "background: #000; color: #00ff00; font-size: 14px; font-weight: bold;");

let isRemoteUpdate = false; // Flag to prevent infinite loops

// --- 1. Shorts Navigation Sensor (Monkey Patch + Event Listener) ---
const injectNavigationSensor = () => {
    const script = document.createElement('script');
    script.textContent = `
        (function() {
            const pushState = history.pushState;
            const replaceState = history.replaceState;

            history.pushState = function() {
                pushState.apply(history, arguments);
                window.dispatchEvent(new Event('locationchange'));
            };

            history.replaceState = function() {
                replaceState.apply(history, arguments);
                window.dispatchEvent(new Event('locationchange'));
            };
        })();
    `;
    document.documentElement.appendChild(script);
    script.remove();

    // Listen for the custom event
    window.addEventListener('locationchange', () => {
        handleUrlChange();
    });

    // YouTube's native SPF/SPA event
    window.addEventListener('yt-navigate-finish', () => {
        handleUrlChange();
    });
};

const handleUrlChange = () => {
    if (isRemoteUpdate) return;
    console.log("[SyncMate] URL Changed detected:", window.location.href);
    chrome.runtime.sendMessage({ type: 'SHORTS_NAV', url: window.location.href });
};

// --- 2. Video Sensor (Play/Pause/Seek) ---
const attachVideoListeners = () => {
    const video = document.querySelector('video');
    if (!video || video.dataset.syncmateAttached) return;

    video.dataset.syncmateAttached = "true";
    console.log("[SyncMate] Attached to Video Element");

    const events = ['play', 'pause', 'seeked'];
    events.forEach(event => {
        video.addEventListener(event, (e) => {
            if (isRemoteUpdate) return;

            // Jitter Buffer: Don't send if just seeking locally for microseconds
            // (Simple implementation for now)

            const payload = {
                type: event,
                currentTime: video.currentTime,
                rate: video.playbackRate
            };

            console.log(`[SyncMate] Local Event: ${event}`, payload);
            chrome.runtime.sendMessage({ type: 'VIDEO_EVENT', payload });
        });
    });
};

// Re-attach listeners when video element changes (common in SPA)
setInterval(attachVideoListeners, 2000);


// --- 3. Actuator (Receive Remote Events) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SHORTS_NAV') {
        const currentUrl = window.location.href;
        if (currentUrl !== message.url) {
            isRemoteUpdate = true;
            window.location.href = message.url;
            setTimeout(() => { isRemoteUpdate = false; }, 2000);
        }
    }

    if (message.type === 'play' || message.type === 'pause' || message.type === 'seeked') {
        const video = document.querySelector('video');
        if (!video) return;

        isRemoteUpdate = true;
        const updateVideo = async () => {
            const timeDiff = Math.abs(video.currentTime - message.currentTime);
            if (timeDiff > 0.5) video.currentTime = message.currentTime;

            if (message.type === 'play') await video.play().catch(e => { });
            else if (message.type === 'pause') video.pause();
        };
        updateVideo().then(() => setTimeout(() => { isRemoteUpdate = false; }, 300));
    }

    // --- Signaling & Chat ---
    if (message.type === 'SIGNAL_PEER') {
        handleSignal(message.payload);
    }

    if (message.type === 'CHAT_MESSAGE') {
        appendMessage(message.payload);
    }
});

// --- 4. Sidebar UI (Shadow DOM) ---
let shadowRoot = null;
let peer = null;
let remoteStream = null;
let myAvatar = '🦊'; // Default

const UI_STYLES = `
    :host {
        all: initial;
        display: block;
        position: fixed;
        top: 0;
        right: 0;
        height: 100vh;
        width: 320px; /* Default Width */
        min-width: 260px;
        max-width: 600px;
        z-index: 2147483647;
        font-family: 'Inter', sans-serif;
        box-shadow: -4px 0 24px rgba(0,0,0,0.5);
        transform: translateX(100%);
        transition: transform 0.3s cubic-bezier(0.19, 1, 0.22, 1);
    }

    :host(.visible) {
        transform: translateX(0);
    }
    
    :host(.minimized) {
        transform: translateX(100%); /* Hide sidebar */
    }

    /* Floating Toggle Button (Visible when minimized) */
    #toggle-fab {
        position: fixed;
        top: 50%;
        right: 0;
        transform: translateY(-50%);
        width: 48px;
        height: 48px;
        background: #000;
        border: 2px solid #db2777;
        border-right: none;
        border-radius: 12px 0 0 12px;
        cursor: pointer;
        z-index: 2147483648;
        display: none; /* Hidden by default */
        align-items: center;
        justify-content: center;
        font-size: 24px;
        box-shadow: -4px 0 12px rgba(219, 39, 119, 0.3);
        transition: right 0.3s;
    }
    
    :host(.minimized) + #toggle-fab, 
    :host:not(.visible) + #toggle-fab { 
        /* Logic handled better via JS toggling classes, simplified here */
    }

    /* Fullscreen Mode Overrides */
    :host(.fullscreen-mode) {
        position: absolute; 
        height: 100%;
        box-shadow: none;
        border-left: 1px solid rgba(255,255,255,0.05);
    }

    .glass-sidebar {
        width: 100%;
        height: 100%;
        background: rgba(10, 10, 10, 0.9);
        backdrop-filter: blur(24px) saturate(180%);
        border-left: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        flex-direction: column;
        position: relative;
    }
    
    /* Resizer Handle */
    .resizer {
        position: absolute;
        left: -4px;
        top: 0;
        width: 8px;
        height: 100%;
        cursor: ew-resize;
        z-index: 100;
        background: transparent;
    }
    .resizer:hover {
        background: rgba(219, 39, 119, 0.2);
    }

    /* Video Area with Controls */
    .video-area {
        position: relative;
        height: 240px;
        background: #000;
        flex-shrink: 0;
        border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .video-controls-overlay {
        position: absolute;
        top: 12px;
        left: 12px;
        z-index: 20;
        display: flex;
        gap: 8px;
    }

    .control-btn {
        background: rgba(0,0,0,0.6);
        border: 1px solid rgba(255,255,255,0.2);
        color: white;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
    }
    
    .control-btn:hover { background: rgba(255,255,255,0.2); transform: scale(1.1); }
    .control-btn.active { background: #ef4444; border-color: #ef4444; }

    video { width: 100%; height: 100%; object-fit: cover; }
    #remote-video { width: 100%; height: 100%; }
    
    #local-video {
        position: absolute;
        bottom: 12px;
        right: 12px;
        width: 80px;
        height: 60px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.3);
        background: #111;
        z-index: 10;
        cursor: pointer;
    }

    /* Chat Area */
    .chat-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .messages-list {
        flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;
        scroll-behavior: smooth;
    }
    .message { display: flex; gap: 8px; align-items: flex-start; animation: fadeIn 0.2s ease; }
    .message .avatar {
        width: 32px; height: 32px; background: rgba(255,255,255,0.1); border-radius: 50%;
        display: flex; align-items: center; justify-content: center; font-size: 18px;
        flex-shrink: 0;
    }
    .message .content {
        background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 0 12px 12px 12px;
        font-size: 13px; color: #eee; line-height: 1.4; word-break: break-word;
    }
    .message.mine { flex-direction: row-reverse; }
    .message.mine .content { background: linear-gradient(135deg, #c084fc, #db2777); color: #fff; border-radius: 12px 0 12px 12px; }

    /* Input Area */
    .input-area { padding: 16px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; gap: 8px; }
    input {
        flex: 1; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px;
        padding: 10px 16px; color: white; font-size: 13px; outline: none;
    }
    input:focus { border-color: #db2777; }
    button.send-btn { background: none; border: none; font-size: 18px; cursor: pointer; opacity: 0.8; }
    button.send-btn:hover { opacity: 1; }

    /* Avatar Selector */
    .avatar-selector { padding: 12px; display: flex; gap: 8px; justify-content: center; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .avatar-opt { cursor: pointer; font-size: 20px; opacity: 0.5; transition: 0.2s; }
    .avatar-opt:hover, .avatar-opt.active { opacity: 1; transform: scale(1.2); }

    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
`;

const injectInterface = () => {
    // 1. Host
    let host = document.getElementById('syncmate-root');
    let fab = document.getElementById('syncmate-fab');

    if (host) {
        host.classList.remove('minimized');
        host.classList.add('visible');
        if (fab) fab.style.display = 'none';
        return;
    }

    host = document.createElement('div');
    host.id = 'syncmate-root';
    document.body.appendChild(host);

    // 2. FAB (Floating Toggle)
    fab = document.createElement('div');
    fab.id = 'syncmate-fab';
    fab.style.cssText = `
        position: fixed; top: 15%; right: 0; width: 40px; height: 40px;
        background: #000; border: 1px solid #db2777; border-right: none;
        border-radius: 8px 0 0 8px; cursor: pointer; z-index: 2147483640;
        display: none; align-items: center; justify-content: center; font-size: 20px;
    `;
    fab.textContent = '⚡';
    document.body.appendChild(fab);

    // Toggle Logic
    fab.addEventListener('click', () => {
        host.classList.remove('minimized');
        host.classList.add('visible');
        fab.style.display = 'none';
    });

    requestAnimationFrame(() => host.classList.add('visible'));

    shadowRoot = host.attachShadow({ mode: 'open' });

    const styleTag = document.createElement('style');
    styleTag.textContent = UI_STYLES;
    shadowRoot.appendChild(styleTag);

    const container = document.createElement('div');
    container.className = 'glass-sidebar';
    container.innerHTML = `
        <div class="resizer" id="resizer"></div>
        <div class="video-area">
            <div class="video-controls-overlay">
                <button class="control-btn" id="toggle-video" title="Toggle Cam">📷</button>
                <button class="control-btn" id="toggle-mic" title="Toggle Mic">🎙️</button>
                <button class="control-btn" id="minimize-sidebar" title="Minimize">─</button>
                <button class="control-btn" id="exit-sidebar" title="Exit Room" style="background: rgba(239,68,68,0.4); border-color: #ef4444;">✖</button>
            </div>
            <video id="remote-video" autoplay playsinline></video>
            <video id="local-video" autoplay playsinline muted></video>
        </div>
        
        <div class="avatar-selector">
            <span class="avatar-opt active" data-av="🦊">🦊</span>
            <span class="avatar-opt" data-av="🤖">🤖</span>
            <span class="avatar-opt" data-av="👽">👽</span>
            <span class="avatar-opt" data-av="👻">👻</span>
            <span class="avatar-opt" data-av="🦄">🦄</span>
        </div>

        <div class="chat-area">
            <div class="messages-list" id="msg-list">
                <div class="message">
                    <div class="avatar">👋</div>
                    <div class="content">Welcome to SyncMate v2.1! 🚀<br>Click '✖' to Exit. Drag edge to resize.</div>
                </div>
            </div>
            <div class="input-area">
                <input type="text" id="chat-input" placeholder="Type a message...">
                <button class="send-btn" id="send-btn">➤</button>
            </div>
        </div>
    `;

    shadowRoot.appendChild(container);

    // --- Resizing Logic ---
    const resizer = shadowRoot.getElementById('resizer');
    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'ew-resize';
        e.preventDefault();
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 260 && newWidth < 800) {
            host.style.width = `${newWidth}px`;
        }
    });

    // --- UI Listeners ---
    const input = shadowRoot.getElementById('chat-input');
    const sendBtn = shadowRoot.getElementById('send-btn');
    const msgList = shadowRoot.getElementById('msg-list');
    const avatarOpts = shadowRoot.querySelectorAll('.avatar-opt');

    // Avatar Selection
    avatarOpts.forEach(opt => {
        opt.addEventListener('click', () => {
            avatarOpts.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            myAvatar = opt.dataset.av;
        });
    });

    // Send Message
    const sendMessage = () => {
        const text = input.value.trim();
        if (!text) return;

        const payload = { text, avatar: myAvatar };
        chrome.runtime.sendMessage({ type: 'CHAT_MESSAGE', payload });

        appendMessage({ ...payload, mine: true });
        input.value = '';
    };

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

    // Controls Listeners
    shadowRoot.getElementById('toggle-video').addEventListener('click', (e) => {
        e.target.classList.toggle('active');
        const track = window.localStream?.getVideoTracks()[0];
        if (track) track.enabled = !track.enabled;
    });

    shadowRoot.getElementById('toggle-mic').addEventListener('click', (e) => {
        e.target.classList.toggle('active');
        const track = window.localStream?.getAudioTracks()[0];
        if (track) track.enabled = !track.enabled;
    });

    // Minimize Logic (Instead of remove)
    shadowRoot.getElementById('minimize-sidebar').addEventListener('click', () => {
        host.classList.add('minimized');
        host.classList.remove('visible'); // Slid out
        fab.style.display = 'flex';
    });

    // Exit Logic (Clean Disconnect)
    shadowRoot.getElementById('exit-sidebar').addEventListener('click', () => {
        if (confirm("Leave this sync room?")) {
            chrome.runtime.sendMessage({ type: 'EXIT_ROOM' });
            removeInterface();
        }
    });
};

const appendMessage = ({ text, avatar, mine }) => {
    if (!shadowRoot) return;
    const list = shadowRoot.getElementById('msg-list');

    const div = document.createElement('div');
    div.className = `message ${mine ? 'mine' : ''}`;
    div.innerHTML = `
        <div class="avatar">${avatar || '👤'}</div>
        <div class="content">${text}</div>
    `;

    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
};

// --- Remove Interface (Full Exit) ---
const removeInterface = () => {
    const host = document.getElementById('syncmate-root');
    const fab = document.getElementById('syncmate-fab');
    if (host) host.remove();
    if (fab) fab.remove();
    if (peer) { peer.destroy(); peer = null; }
};

// --- 5. PeerJS Video Logic ---
const initVideoChat = (roomId, history = []) => {
    if (peer) return; // Already running

    injectInterface();
    const remoteVid = shadowRoot.getElementById('remote-video');
    const localVid = shadowRoot.getElementById('local-video');

    // Restore History
    if (history && history.length > 0) {
        // We need to know who sent what. 
        // Background sends the payload: { text, avatar, senderId? }
        // BUT my outgoing messages in background are pushed as { text, avatar }.
        // Incoming are same.
        // Wait, how do I know if "mine"? 
        // Ideally background also stored 'mine' flag or senderId?
        // Simplification: We pushed raw payloads. 
        // To distinguish "mine" vs "others" properly, we need a userId.
        // For now, let's just render them. 
        // Note: The user just wants history. 
        // Let's assume background didn't store 'mine' boolean. 
        // We will default to gray (received) unless we improve storage logic.
        // Improvement: Background pushes { ...payload, isMe: true } for outgoing.

        // Actually, let's just render them all as 'received' style or neutral if we can't tell, 
        // OR better: Assume we can't distinguish for old messages easily without ID.
        // We will just render them.
        const list = shadowRoot.getElementById('msg-list');
        list.innerHTML = ''; // Clear welcome

        history.forEach(msg => {
            // Check if it looks like mine? (We don't have ID here easily persited).
            // Let's just append.
            appendMessage({ ...msg, mine: msg.isMe });
        });
    }

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            localVid.srcObject = stream;
            window.localStream = stream;

            const peerConfig = {
                debug: 2,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' }
                    ]
                }
            };

            peer = new Peer(undefined, peerConfig);
            peer.on('open', (id) => {
                chrome.runtime.sendMessage({ type: 'SIGNAL_PEER', payload: { type: 'PEER_ID', peerId: id, roomId } });
            });
            peer.on('call', (call) => {
                call.answer(stream);
                call.on('stream', (userStream) => { remoteVid.srcObject = userStream; });
            });
        })
        .catch(err => console.error("Media Error", err));
};

const handleSignal = (signal) => {
    if (!peer) return;
    if (signal.type === 'PEER_ID') {
        const call = peer.call(signal.peerId, window.localStream);
        call.on('stream', (userStream) => {
            const remoteVid = shadowRoot.getElementById('remote-video');
            if (remoteVid) remoteVid.srcObject = userStream;
        });
    }
};

// Start/Stop Listeners
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'START_CHAT') initVideoChat(message.roomId, message.history);
    if (message.type === 'STOP_CHAT') removeInterface();
});

// --- 6. Fullscreen Logic (Reparenting) ---
document.addEventListener('fullscreenchange', () => {
    const host = document.getElementById('syncmate-root');
    if (!host) return;

    if (document.fullscreenElement) {
        console.log("[SyncMate] Entering Fullscreen - Reparenting Sidebar");
        document.fullscreenElement.appendChild(host);
        host.classList.add('fullscreen-mode');
    } else {
        console.log("[SyncMate] Exiting Fullscreen");
        document.body.appendChild(host);
        host.classList.remove('fullscreen-mode');
    }
});

// --- 7. Persistence & Auto-Join ---
setInterval(() => {
    if (!peer && !document.getElementById('syncmate-root')) {
        // Poll status 
        chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
            if (res && res.connected && res.roomId) {
                console.log("[SyncMate] Recovering Session...");
                initVideoChat(res.roomId);
            }
        });
    }
}, 3000);

// Initialize
injectNavigationSensor();
attachVideoListeners();
