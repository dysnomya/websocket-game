package com.src;

import io.quarkus.websockets.next.*;
import jakarta.inject.Inject;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

@WebSocket(path = "/whiteboard/{room}")
public class WhiteboardSocket {

    @Inject
    WebSocketConnection connection;

    private static final Map<String, List<byte[]>> roomHistories = new ConcurrentHashMap<>();
    private static final String SYSTEM_ROOM = "system-registry";

    @OnOpen
    public void onOpen(@PathParam("room") String room) {
        System.out.println("User connected to path: " + room);

        if (!SYSTEM_ROOM.equals(room)) {
            roomHistories.putIfAbsent(room, new CopyOnWriteArrayList<>());
            sendRoomHistory(room);
        }
        broadcastActiveRooms();
    }

    @OnBinaryMessage
    public void onBinaryMessage(byte[] message, @PathParam("room") String room) {
        if (SYSTEM_ROOM.equals(room) || message.length < 8) return;

        parseAndStoreStrokes(message, room);

        for (WebSocketConnection c : connection.getOpenConnections()) {
            if (room.equals(c.pathParam("room")) && !c.id().equals(connection.id())) {
                c.sendBinary(message)
                        .subscribe()
                        .with(success -> {}, failure -> System.err.println("Failed streaming batch: " + failure.getMessage()));
            }
        }
    }

    @OnClose
    public void onClose(@PathParam("room") String room) {
        if (!SYSTEM_ROOM.equals(room)) {
            boolean roomStillActive = connection.getOpenConnections().stream()
                    .anyMatch(c -> room.equals(c.pathParam("room")));

            if (!roomStillActive) {
                roomHistories.remove(room);
            }
        }
        broadcastActiveRooms();
    }

    private void sendRoomHistory(String room) {
        List<byte[]> history = roomHistories.get(room);
        if (history == null || history.isEmpty()) return;

        int index = 0;
        while (index < history.size()) {
            byte[] currentStroke = history.get(index);
            byte r = currentStroke[4];
            byte g = currentStroke[5];
            byte b = currentStroke[6];
            byte packedByte = currentStroke[7];

            int currentToolState = packedByte & ~0x40;

            int count = 0;
            while (index + count < history.size()) {
                byte[] nextStroke = history.get(index + count);
                int nextToolState = nextStroke[7] & ~0x40;
                boolean nextIsNew = (nextStroke[7] & 0x40) != 0;

                if (count > 0 && (nextIsNew || nextStroke[4] != r || nextStroke[5] != g || nextStroke[6] != b || nextToolState != currentToolState)) {
                    break;
                }
                count++;
            }

            byte[] playbackFrame = new byte[8 + (count * 4)];
            playbackFrame[0] = (byte) ((count >> 8) & 0xFF);
            playbackFrame[1] = (byte) (count & 0xFF);
            playbackFrame[2] = r;
            playbackFrame[3] = g;
            playbackFrame[4] = b;
            playbackFrame[5] = packedByte;
            playbackFrame[6] = 0;
            playbackFrame[7] = 0;

            for (int i = 0; i < count; i++) {
                byte[] strokeData = history.get(index + i);
                System.arraycopy(strokeData, 0, playbackFrame, 8 + (i * 4), 4);
            }

            connection.sendBinary(playbackFrame)
                    .subscribe()
                    .with(success -> {}, failure -> System.err.println("Failed history playback frame transmission"));

            index += count;
        }
    }

    private void parseAndStoreStrokes(byte[] message, String room) {
        int strokeCount = ((message[0] & 0xFF) << 8) | (message[1] & 0xFF);
        List<byte[]> history = roomHistories.computeIfAbsent(room, k -> new CopyOnWriteArrayList<>());

        byte r = message[2];
        byte g = message[3];
        byte b = message[4];
        byte packedByte = message[5];

        for (int i = 0; i < strokeCount; i++) {
            int offset = 8 + (i * 4);
            if (offset + 4 <= message.length) {
                byte[] historicalStroke = new byte[8];
                System.arraycopy(message, offset, historicalStroke, 0, 4);
                historicalStroke[4] = r;
                historicalStroke[5] = g;
                historicalStroke[6] = b;
                historicalStroke[7] = (i == 0) ? packedByte : (byte) (packedByte & ~0x40);

                history.add(historicalStroke);
            }
        }
    }

    private void broadcastActiveRooms() {
        Map<String, Long> roomUserCounts = connection.getOpenConnections().stream()
                .map(c -> c.pathParam("room"))
                .filter(r -> !SYSTEM_ROOM.equals(r))
                .collect(Collectors.groupingBy(r -> r, Collectors.counting()));

        for (String activeRoomKey : roomHistories.keySet()) {
            if (!SYSTEM_ROOM.equals(activeRoomKey)) {
                roomUserCounts.putIfAbsent(activeRoomKey, 0L);
            }
        }

        String jsonPayload = roomUserCounts.entrySet().stream()
                .map(e -> "\"" + e.getKey() + "\":" + e.getValue())
                .collect(Collectors.joining(",", "{", "}"));

        for (WebSocketConnection c : connection.getOpenConnections()) {
            c.sendText(jsonPayload)
                    .subscribe()
                    .with(success -> {}, failure -> System.err.println("Failed room counter broadcast"));
        }
    }
}