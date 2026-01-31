# 🔮 SyncMate | The Digital Bridge for Long Distance

> **"Distance is just a bug. We fixed it."**
# ⚡ SyncMate: Distributed Real-Time Media Synchronization Engine

![Architecture](https://img.shields.io/badge/Architecture-Event--Driven-blue?style=for-the-badge&logo=structure)
![Tech](https://img.shields.io/badge/Core-WebRTC%20%7C%20Socket.IO%20%7C%20ShadowDOM-7000FF?style=for-the-badge)
![Performance](https://img.shields.io/badge/Latency-%3C50ms%20(P2P)-success?style=for-the-badge)

**SyncMate** is an advanced Chrome Extension engineered to facilitate **frame-perfect media synchronization** ⏱️ and low-latency peer-to-peer video teleportation 📹 for remote users. It acts as a middleware between the YouTube DOM and a distributed room system, enforcing state consistency across clients with sub-50ms variance.

Unlike traditional screen-sharing which degrades quality, SyncMate leverages **Command Pattern injection** 💉 to control the native player directly, preserving **4K HDR fidelity** ✨ while overlaying a **Shadow DOM-encapsulated** communication layer.

---

## 🏗️ Architectural Highlights

### 1. Heuristic Synchronization Protocol (HSP) 🧠
SyncMate implements a custom `HSP` to handle non-deterministic network jitter:
- **Event Deduplication**: Filters redundant seek/pause events using a locally buffered time-window (500ms jitter buffer) to prevent "feedback loops" 🔄 between clients.
- **Micro-State Monkey Patching** 🐒: Injects a navigation sensor by overriding the browser's `History API` (`pushState`/`replaceState`) to detect Single Page Application (SPA) transitions like YouTube Shorts scrolling.
- **Optimistic UI Updates** ⚡: Applies state changes locally for instant feedback while reconciling consistency asynchronously.

### 2. Isomorphic Persistence Layer 💾
To combat the ephemeral nature of Chrome's Manifest V3 Service Workers, SyncMate utilizes a **Hybrid Storage Strategy**:
- **Transient State**: Uses `chrome.storage.session` to maintain cryptographic room keys and connection state in RAM, ensuring sessions survive Service Worker termination but auto-purge on browser exit 🚪.
- **State Rehydration** 💧: Automatically re-injects the communication interface into the DOM upon page navigation or reload (HMR-like experience).

### 3. Shadow DOM Encapsulation 🛡️
The "Luxury" UI is rendered inside an isolated `ShadowRoot` (#shadow-root open), ensuring complete CSS modularity. SyncMate's styles (Glassmorphism, Backdrop Filters 🌫️) remain unaffected by YouTube's global stylesheets, and conversely, the extension prevents style leakage into the host site.

### 4. Zero-Server P2P Mesh 🌐
- **Signaling Server**: A lightweight Node.js/Socket.IO relay used *only* for initial handshake (SDP Exchange) 🤝.
- **Data/Media Plane**: Once connected, video and audio streams flow directly between clients via **WebRTC (RTCPeerConnection)**, guaranteeing end-to-end encryption (DTLS/SRTP) 🔒 and minimal latency.

---

## 💻 Tech Stack

| Layer | Technologies | Role |
| :--- | :--- | :--- |
| **Extension Core** | Manifest V3, Service Workers, `chrome.scripting` | Life-cycle management & execution context. |
| **Frontend** 🎨 | Vanilla ES6+, Web Components, CSS Variables | High-performance, framework-less UI rendering. |
| **Real-time** ⚡ | Socket.IO, WebRTC (PeerJS) | Full-duplex communication & media streaming. |
| **State** 🧠 | Chrome Storage API (Session) | Persistence across navigation contexts. |

---

## 🚀 Try It Now (Live Demo)

The backend is deployed on **Render.com**, so you can test the extension immediately without running any local servers.

1.  **Download Code**:
    *   Click **Code** -> **Download ZIP** (or clone this repo).
    *   Unzip the folder.
2.  **Install in Chrome**:
    *   Open `chrome://extensions`.
    *   Enable **Developer Mode** (top right toggle).
    *   Click **Load Unpacked**.
    *   Select the `extension` folder from the unzipped code.
3.  **Sync!**:
    *   Open YouTube.
    *   Click the SyncMate icon to Create a Room.
    *   (Optional) Send the Room ID to a friend (they need to install it too) or open a second window to test solo.

---

## 🛠️ Local Development (Optional)

If you want to modify the backend or run your own signaling server:

1.  **Hydrate Signaling Server**
    ```bash
    cd backend && npm install
    node server.js
    ```
3.  **Load Extension**
    *   Navigate to `chrome://extensions`
    *   Enable **Developer Mode**
    *   Select **Load Unpacked** -> `./extension` directory.

---

## 📸 Key Capabilities

*   **Atomic State Sync** ⚛️: Guarantees widespread video state consistency (Play/Pause/Seek/Rate).
*   **Adaptive Layout** 📐: Sidebar physically reparents itself into the `document.fullscreenElement` to maintain visibility during full-screen playback.
*   **Draggable Overlay** 🖱️: Implementation of custom collision-free drag physics for the video bubble.

---

*Built with ❤️ for LDRs.*

*Architected with ❤️ by [Paarth-dev-lab](https://github.com/Paarth-dev-lab)*
