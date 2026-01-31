const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');

// --- Configuration ---
const PORT = process.env.PORT || 3000;

// --- Application Setup ---
const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for extension usage
        methods: ["GET", "POST"]
    }
});

// --- Structured Logging ---
const log = (type, message) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${type}] ${message}`);
};

// --- State Management ---
// Map<RoomID, RoomState>
// RoomState: { users: Set<SocketID>, currentUrl: string | null }
const rooms = new Map();

// --- Health Check (Critical for Render.com Keep-Alive) ---
app.get('/', (req, res) => {
    res.status(200).send('SyncMate Server is Running. Luxury awaits.');
});

// --- Helper: Generate Secure Room ID ---
const generateRoomId = () => {
    return crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 chars, e.g., "A1B2C3"
};

// --- Socket Logic ---
io.on('connection', (socket) => {
    log('INFO', `New Client Connected: ${socket.id}`);

    // Wrapper for safe execution
    const safeExec = (label, handler) => {
        return async (...args) => {
            try {
                await handler(...args);
            } catch (err) {
                log('ERROR', `Exception in ${label}: ${err.message}`);
                // Optional: Emit error back to client if needed
                // socket.emit('error', { message: 'Internal Server Error' });
            }
        };
    };

    // 1. Create Room
    socket.on('create_room', safeExec('create_room', (callback) => {
        const roomId = generateRoomId();

        // Initialize Room State
        rooms.set(roomId, {
            users: new Set([socket.id]),
            currentUrl: null
        });

        socket.join(roomId);
        socket.roomId = roomId; // Tag socket for cleanup

        log('ROOM', `Room Created: ${roomId} by ${socket.id}`);

        if (typeof callback === 'function') {
            callback({ success: true, roomId });
        }
    }));

    // 2. Join Room
    socket.on('join_room', safeExec('join_room', (roomId, callback) => {
        const room = rooms.get(roomId);

        if (!room) {
            log('WARN', `Join Failed: Room ${roomId} not found`);
            if (typeof callback === 'function') {
                callback({ success: false, error: "Room not found" });
            }
            return;
        }

        room.users.add(socket.id);
        socket.join(roomId);
        socket.roomId = roomId;

        log('ROOM', `User ${socket.id} joined Room: ${roomId}`);

        // Send current state to new user if available
        if (room.currentUrl) {
            socket.emit('sync_shorts', { url: room.currentUrl, force: true });
        }

        socket.to(roomId).emit('user_joined', { userId: socket.id });

        if (typeof callback === 'function') {
            callback({ success: true, roomId });
        }
    }));

    // 3. Sync Actions (Play, Pause, Seek)
    socket.on('sync_action', safeExec('sync_action', (payload) => {
        if (!socket.roomId) return;

        // Broadcast to everyone else in the room
        socket.to(socket.roomId).emit('sync_action', payload);
        log('INFO', `Action in ${socket.roomId}: ${payload.type} from ${socket.id}`);
    }));

    // 4. Shorts Sync (URL Change)
    socket.on('sync_shorts', safeExec('sync_shorts', (payload) => {
        if (!socket.roomId) return;

        const { url } = payload;
        const room = rooms.get(socket.roomId);

        if (room) {
            room.currentUrl = url;
            // Broadcast new URL to partner
            socket.to(socket.roomId).emit('sync_shorts', payload);
            log('INFO', `Shorts Sync in ${socket.roomId}: ${url}`);
        }
    }));

    // 6. Signal Peer (WebRTC Handshake)
    socket.on('signal_peer', safeExec('signal_peer', (payload) => {
        if (!socket.roomId) return;

        // Broadcast to everyone else in the room (Partner)
        socket.to(socket.roomId).emit('signal_peer', payload);
    }));

    // 7. Text Chat & Avatars
    socket.on('chat_message', safeExec('chat_message', (payload) => {
        if (!socket.roomId) return;
        // Payload: { text, avatar, senderId, timestamp }
        socket.to(socket.roomId).emit('chat_message', payload);
        log('INFO', `Chat in ${socket.roomId}: ${payload.text}`);
    }));

    socket.on('update_avatar', safeExec('update_avatar', (payload) => {
        if (!socket.roomId) return;
        // Payload: { avatar }
        socket.to(socket.roomId).emit('update_avatar', { userId: socket.id, avatar: payload.avatar });
    }));

    // 8. Disconnect & Cleanup
    socket.on('disconnect', safeExec('disconnect', () => {
        log('INFO', `Client Disconnected: ${socket.id}`);

        if (socket.roomId) {
            const room = rooms.get(socket.roomId);
            if (room) {
                room.users.delete(socket.id);

                // Notify others
                socket.to(socket.roomId).emit('user_left', { userId: socket.id });

                // STRICT CLEANUP: Delete room if empty
                if (room.users.size === 0) {
                    rooms.delete(socket.roomId);
                    log('ROOM', `Room ${socket.roomId} Deleted (Empty)`);
                }
            }
        }
    }));
});

// --- Server Start ---
server.listen(PORT, () => {
    log('INFO', `SyncMate Server running on port ${PORT}`);
});
