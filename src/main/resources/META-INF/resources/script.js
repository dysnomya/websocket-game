const lobbyScreen = document.getElementById('lobby-screen');
const gameContainer = document.getElementById('game-container');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const roomsListElement = document.getElementById('rooms-list');
const lobbyRoomsListElement = document.getElementById('lobby-rooms-list');
const sidebarRoomInput = document.getElementById('sidebarRoomInput');
const sidebarCreateBtn = document.getElementById('sidebarCreateBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');

const canvas = document.getElementById('paintCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const drawBtn = document.getElementById('drawBtn');
const eraseBtn = document.getElementById('eraseBtn');
const sizeSlider = document.getElementById('sizeSlider');

let socket = null;
let currentRoomName = "";
let isInGame = false;
let drawing = false;
let isEraser = false;
let currentColor = '#000000';
let currentSize = 5;

let lastX = 0;
let lastY = 0;
let remoteLastX = null;
let remoteLastY = null;

let strokeBuffer = [];
let bufferFlushInterval = null;
const FLUSH_RATE_MS = 60;

function sanitizeRoomName(name) {
    return name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]/g, '');
}

window.addEventListener('DOMContentLoaded', () => {
    const savedRoomHash = window.location.hash.substring(1).trim().toLowerCase();
    if (savedRoomHash) {
        enterGameView(sanitizeRoomName(savedRoomHash));
    } else {
        initNetwork("system-registry");
    }
    startBufferTicker();
});

window.addEventListener('hashchange', () => {
    const currentHash = window.location.hash.substring(1).trim().toLowerCase();
    if (currentHash && currentHash !== currentRoomName) {
        enterGameView(sanitizeRoomName(currentHash));
    } else if (!currentHash && isInGame) {
        leaveGameView();
    }
});

joinBtn.addEventListener('click', () => {
    const roomName = sanitizeRoomName(roomInput.value);
    if (!roomName) {
        alert("Please enter a valid room name (letters, numbers, hyphens, or underscores)!");
        return;
    }
    enterGameView(roomName);
});

roomInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinBtn.click();
});

sidebarCreateBtn.addEventListener('click', () => {
    const roomName = sanitizeRoomName(sidebarRoomInput.value);
    if (roomName) {
        sidebarRoomInput.value = '';
        enterGameView(roomName);
    }
});

sidebarRoomInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sidebarCreateBtn.click();
});

leaveRoomBtn.addEventListener('click', leaveGameView);

roomInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
});

sidebarRoomInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
});

function enterGameView(roomName) {
    isInGame = true;
    window.location.hash = roomName;

    lobbyScreen.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    switchToRoom(roomName);
}

function leaveGameView() {
    isInGame = false;
    currentRoomName = "";
    window.location.hash = "";

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
    }

    strokeBuffer = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    remoteLastX = null;
    remoteLastY = null;

    gameContainer.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');

    initNetwork("system-registry");
}

function switchToRoom(newRoomName) {
    if (currentRoomName === newRoomName) return;

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    currentRoomName = newRoomName;
    remoteLastX = null;
    remoteLastY = null;
    strokeBuffer = [];

    document.getElementById('room-title').innerText = `Room: ${currentRoomName}`;
    initNetwork(currentRoomName);
}

function initNetwork(roomName) {
    socket = new WebSocket(`ws://${window.location.host}/whiteboard/${roomName}`);
    socket.binaryType = 'arraybuffer';

    socket.onmessage = function(event) {
        if (typeof event.data === 'string') {
            try {
                const activeRoomsList = JSON.parse(event.data);
                updateRoomsUI(activeRoomsList);
            } catch (e) {
                console.error("Failed handling Text frame JSON processing:", e);
            }
            return;
        }

        if (isInGame && event.data instanceof ArrayBuffer) {
            const view = new DataView(event.data);

            if (event.data.byteLength >= 8) {
                const count = view.getUint16(0);
                const r = view.getUint8(2);
                const g = view.getUint8(3);
                const b = view.getUint8(4);
                const packedByte = view.getUint8(5);
                const size = packedByte & 0x3F;
                const isNewStroke = (packedByte & 0x40) !== 0;
                const isEraserMode = (packedByte & 0x80) !== 0;

                for (let i = 0; i < count; i++) {
                    const offset = 8 + (i * 4);
                    if (offset + 4 <= event.data.byteLength) {
                        const x = view.getUint16(offset + 0);
                        const y = view.getUint16(offset + 2);
                        const isFirstPoint = (i === 0) ? isNewStroke : false;

                        const startX = isFirstPoint || remoteLastX === null ? x : remoteLastX;
                        const startY = isFirstPoint || remoteLastY === null ? y : remoteLastY;

                        renderLine(startX, startY, x, y, r, g, b, size, isFirstPoint, isEraserMode);

                        remoteLastX = x;
                        remoteLastY = y;
                    }
                }
            }
        }
    };
}

function startBufferTicker() {
    if (bufferFlushInterval) clearInterval(bufferFlushInterval);

    bufferFlushInterval = setInterval(() => {
        flushStrokeBuffer();
    }, FLUSH_RATE_MS);
}

function flushStrokeBuffer() {
    if (strokeBuffer.length === 0 || !socket || socket.readyState !== WebSocket.OPEN) return;

    const count = strokeBuffer.length;
    const totalByteLength = 8 + (count * 4);
    const buffer = new ArrayBuffer(totalByteLength);
    const view = new DataView(buffer);

    const firstStroke = strokeBuffer[0];

    view.setUint16(0, count);
    view.setUint8(2, firstStroke.r);
    view.setUint8(3, firstStroke.g);
    view.setUint8(4, firstStroke.b);

    const packedByte = firstStroke.size | (firstStroke.isNewStroke << 6) | (firstStroke.isEraser << 7);
    view.setUint8(5, packedByte);
    view.setUint16(6, 0);

    strokeBuffer.forEach((stroke, index) => {
        const offset = 8 + (index * 4);
        view.setUint16(offset + 0, stroke.x);
        view.setUint16(offset + 2, stroke.y);
    });

    socket.send(buffer);
    strokeBuffer = [];
}

function queueStroke(x, y, isNewStroke) {
    const r = parseInt(currentColor.slice(1, 3), 16);
    const g = parseInt(currentColor.slice(3, 5), 16);
    const b = parseInt(currentColor.slice(5, 7), 16);

    if (strokeBuffer.length > 0 && (strokeBuffer[0].isNewStroke !== isNewStroke || strokeBuffer[0].isEraser !== isEraser)) {
        flushStrokeBuffer();
    }

    renderLine(lastX, lastY, x, y, r, g, b, currentSize, isNewStroke, isEraser);

    lastX = x;
    lastY = y;

    strokeBuffer.push({
        x: x, y: y,
        r: r, g: g, b: b,
        size: currentSize,
        isNewStroke: isNewStroke,
        isEraser: isEraser
    });
}

function updateRoomsUI(roomsObject) {
    roomsListElement.innerHTML = '';
    lobbyRoomsListElement.innerHTML = '';

    const roomKeys = Object.keys(roomsObject);

    if (isInGame && !roomKeys.includes(currentRoomName)) {
        roomKeys.push(currentRoomName);
        roomsObject[currentRoomName] = (roomsObject[currentRoomName] || 0);
    }

    if (roomKeys.length === 0) {
        lobbyRoomsListElement.innerHTML = '<span class="no-rooms">No active rooms right now. Create one above!</span>';
    } else {
        roomKeys.forEach(room => {
            const count = roomsObject[room] || 0;

            const badge = document.createElement('span');
            badge.className = 'room-badge';
            badge.textContent = `${room} (${count})`;

            badge.addEventListener('click', () => enterGameView(room));
            lobbyRoomsListElement.appendChild(badge);
        });
    }

    roomKeys.forEach(room => {
        const count = roomsObject[room] || 0;

        const containerDiv = document.createElement('div');
        containerDiv.className = 'room-item-container';

        if (room === currentRoomName && isInGame) {
            containerDiv.classList.add('current-active-room');
        }

        const textSpan = document.createElement('span');
        textSpan.textContent = room;

        const countSpan = document.createElement('span');
        countSpan.className = 'user-counter-badge';
        countSpan.textContent = `${count} online`;

        containerDiv.appendChild(textSpan);
        containerDiv.appendChild(countSpan);

        containerDiv.addEventListener('click', () => {
            enterGameView(room);
        });

        roomsListElement.appendChild(containerDiv);
    });
}

colorPicker.addEventListener('input', (e) => { currentColor = e.target.value; isEraser = false; toggleButtons(); });
sizeSlider.addEventListener('input', (e) => currentSize = parseInt(e.target.value));
drawBtn.addEventListener('click', () => { isEraser = false; toggleButtons(); });
eraseBtn.addEventListener('click', () => { isEraser = true; toggleButtons(); });

function toggleButtons() {
    drawBtn.classList.toggle('active', !isEraser);
    eraseBtn.classList.toggle('active', isEraser);
}

canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

function startDrawing(e) {
    if (!isInGame) return;
    drawing = true;
    const rect = canvas.getBoundingClientRect();
    lastX = Math.round(e.clientX - rect.left);
    lastY = Math.round(e.clientY - rect.top);
    queueStroke(lastX, lastY, true);
}

function stopDrawing() { drawing = false; }

function draw(e) {
    if (!drawing || !isInGame) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    queueStroke(x, y, false);
}

function renderLine(x1, y1, x2, y2, r, g, b, size, isNewStroke, isEraserMode) {
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = isEraserMode ? '#ffffff' : `rgb(${r},${g},${b})`;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}