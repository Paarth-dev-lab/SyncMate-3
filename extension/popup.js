// Popup UI Logic
document.addEventListener('DOMContentLoaded', async () => {
    // --- Elements ---
    const defaultView = document.getElementById('default-view');
    const connectedView = document.getElementById('connected-view');

    const createBtn = document.getElementById('create-btn');
    const joinBtn = document.getElementById('join-btn');
    const roomIdInput = document.getElementById('room-id');
    const statusPill = document.getElementById('status-pill');
    const statusText = document.getElementById('status-text');

    const displayRoomId = document.getElementById('display-room-id');
    const copyBtn = document.getElementById('copy-btn');
    const exitBtn = document.getElementById('exit-btn');

    // Inject Toast Element
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = 'Copied to Clipboard!';
    document.body.appendChild(toast);

    // --- Helpers ---
    const showToast = (msg = 'Copied!') => {
        toast.textContent = msg;
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 2000);
    };

    const showError = (element) => {
        element.classList.add('shake');
        setTimeout(() => element.classList.remove('shake'), 400);
    };

    const updateUI = (state) => {
        if (state.connected && state.roomId) {
            // Connected View
            defaultView.style.display = 'none';
            connectedView.style.display = 'flex';
            connectedView.style.flexDirection = 'column';
            connectedView.style.gap = '16px'; // Add gap

            statusPill.setAttribute('data-connected', 'true');
            statusText.textContent = 'Connected';
            displayRoomId.textContent = state.roomId;
        } else {
            // Default View
            connectedView.style.display = 'none';
            defaultView.style.display = 'flex';
            defaultView.style.flexDirection = 'column';
            defaultView.style.gap = '16px'; // Add gap

            statusPill.removeAttribute('data-connected');
            statusText.textContent = 'Disconnected';
            roomIdInput.value = '';
            createBtn.innerHTML = 'Create Room';
            joinBtn.innerHTML = 'Join Room';
        }
    };

    // --- Init: Check Status ---
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
        if (response) {
            updateUI(response);
        }
    });

    // --- Actions ---

    // 1. Create Room
    createBtn.addEventListener('click', () => {
        createBtn.innerHTML = 'Creating...';
        chrome.runtime.sendMessage({ type: 'CREATE_ROOM' }, (response) => {
            if (response && response.success) {
                navigator.clipboard.writeText(response.roomId);
                showToast(`Room ${response.roomId} Copied!`);
                updateUI({ connected: true, roomId: response.roomId });
            } else {
                createBtn.innerHTML = 'Create Room';
                showError(createBtn);
            }
        });
    });

    // 2. Join Room
    joinBtn.addEventListener('click', () => {
        const roomId = roomIdInput.value.trim().toUpperCase();
        if (!roomId || roomId.length !== 6) {
            showError(roomIdInput.parentElement);
            return;
        }

        joinBtn.innerHTML = 'Joining...';
        chrome.runtime.sendMessage({ type: 'JOIN_ROOM', roomId }, (response) => {
            if (response && response.success) {
                showToast('Joined Successfully!');
                updateUI({ connected: true, roomId });
            } else {
                joinBtn.innerHTML = 'Join Room';
                showError(roomIdInput.parentElement);
            }
        });
    });

    // 3. Copy ID (Connected View)
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(displayRoomId.textContent);
        showToast('ID Copied!');
    });

    // 4. Exit Room
    exitBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'EXIT_ROOM' }, () => {
            updateUI({ connected: false });
        });
    });
});
