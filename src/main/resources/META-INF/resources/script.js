// Screen Elements
const lobbyScreen = document.getElementById('lobby-screen');
const gameContainer = document.getElementById('game-container');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');

// Game Elements
const canvas = document.getElementById('paintCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const drawBtn = document.getElementById('drawBtn');
const eraseBtn = document.getElementById('eraseBtn');
const sizeSlider = document.getElementById('sizeSlider');

let socket;
let drawing = false;
let isEraser = false;
let currentColor = '#000000';
let currentSize = 5;

let lastX = 0;
let lastY = 0;
let remoteLastX = null;
let remoteLastY = null;

// Event Listeners for joining
joinBtn.addEventListener('click', joinRoom);
roomInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinRoom();
});

function joinRoom() {
    const roomName = roomInput.value.trim() || "lobby";

    // Hide lobby screen and reveal the canvas game
    lobbyScreen.classList.add('hidden');
    gameContainer.classList.remove('hidden');

    document.getElementById('room-title').innerText = `Room: ${roomName}`;

    // Initialize Networking
    initNetwork(roomName);
}

function initNetwork(roomName) {
    socket = new WebSocket(`ws://${window.location.host}/whiteboard/${roomName}`);
    socket.binaryType = 'arraybuffer';

    socket.onmessage = function(event) {
        if (event.data instanceof ArrayBuffer) {
            const view = new DataView(event.data);
            const x = view.getUint16(0);
            const y = view.getUint16(2);
            const r = view.getUint8(4);
            const g = view.getUint8(5);
            const b = view.getUint8(6);
            const size = view.getUint8(7);
            const isNewStroke = view.getUint8(8) === 1;
            const isEraserMode = view.getUint8(9) === 1;

            const startX = isNewStroke || remoteLastX === null ? x : remoteLastX;
            const startY = isNewStroke || remoteLastY === null ? y : remoteLastY;

            renderLine(startX, startY, x, y, r, g, b, size, isNewStroke, isEraserMode);

            remoteLastX = x;
            remoteLastY = y;
        }
    };
}

// Controls configuration
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
    drawing = true;
    const rect = canvas.getBoundingClientRect();
    lastX = Math.round(e.clientX - rect.left);
    lastY = Math.round(e.clientY - rect.top);
    sendStroke(lastX, lastY, true);
}

function stopDrawing() {
    drawing = false;
}

function draw(e) {
    if (!drawing) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);

    sendStroke(x, y, false);
}

function sendStroke(x, y, isNewStroke) {
    if (!socket) return; // Protect against sending before connecting

    const buffer = new ArrayBuffer(10);
    const view = new DataView(buffer);

    view.setUint16(0, x);
    view.setUint16(2, y);

    const r = parseInt(currentColor.slice(1, 3), 16);
    const g = parseInt(currentColor.slice(3, 5), 16);
    const b = parseInt(currentColor.slice(5, 7), 16);
    view.setUint8(4, r);
    view.setUint8(5, g);
    view.setUint8(6, b);

    view.setUint8(7, currentSize);
    view.setUint8(8, isNewStroke ? 1 : 0);
    view.setUint8(9, isEraser ? 1 : 0);

    renderLine(lastX, lastY, x, y, r, g, b, currentSize, isNewStroke, isEraser);

    lastX = x;
    lastY = y;

    if (socket.readyState === WebSocket.OPEN) {
        socket.send(buffer);
    }
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