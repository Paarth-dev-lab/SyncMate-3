# 🚀 SyncMate Deployment Guide (Render.com)

Since your code is on GitHub, we will use **Render.com** to host the server for free. It supports WebSockets (Socket.IO) natively.

## Phase 1: Deploy the Server

1.  **Create Account**: Go to [dashboard.render.com](https://dashboard.render.com/) and log in with GitHub.
2.  **New Service**: Click **"New +"** -> **"Web Service"**.
3.  **Connect Repo**: Select your `SyncMate-3` repository.
4.  **Configure Settings** (Important):
    *   **Name**: `syncmate-server` (or similar)
    *   **Region**: Choose closest to you (e.g., Singapore/Oregon)
    *   **Branch**: `main`
    *   **Root Directory**: `backend` (⚠️ **CRITICAL**: Don't miss this, or it will fail)
    *   **Runtime**: `Node`
    *   **Build Command**: `npm install`
    *   **Start Command**: `node server.js`
    *   **Instance Type**: `Free`
5.  **Deploy**: Click **"Create Web Service"**.

Wait for 1-2 minutes.
Once you see **"Live"**, copy the URL at the top left (Example: `https://syncmate-server-xyz.onrender.com`).

---

## Phase 2: Connect Extension to Live Server

Now that the server is online, we need to tell the Chrome Extension to talk to *it* instead of your laptop.

1.  **Open Code**: Go to `extension/background.js` in your editor.
2.  **Update URL**:
    Change Line 5:
    ```javascript
    // const SERVER_URL = "http://localhost:3000"; // Dev URL
    const SERVER_URL = "https://your-render-url.onrender.com"; // Production URL
    ```
    *(Paste the URL you copied from Render)*
3.  **Save**.

## Phase 3: Final Update

1.  **Reload Extension**: Go to `chrome://extensions` -> **Reload** SyncMate.
2.  **Test**:
    *   Close the backend terminal on your laptop (`Ctrl+C`).
    *   Open YouTube.
    *   Click SyncMate -> **Create Room**.
    *   If it generates a Room ID, **Congratulations!** You are now connected to the Cloud. ☁️

---

### 💡 Troubleshooting
*   **"Build Failed"**: Did you set **Root Directory** to `backend`?
*   **"Disconnected"**: Make sure you removed the trailing slash `/` from the Render URL (optional but cleaner).
