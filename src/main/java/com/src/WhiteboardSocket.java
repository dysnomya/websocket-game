package com.src;

import io.quarkus.websockets.next.WebSocket;
import io.quarkus.websockets.next.WebSocketConnection;
import io.quarkus.websockets.next.OnBinaryMessage;
import io.quarkus.websockets.next.OnOpen;
import io.quarkus.websockets.next.PathParam;
import jakarta.inject.Inject;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@WebSocket(path = "/whiteboard/{room}")
public class WhiteboardSocket {

    @Inject
    WebSocketConnection connection;

    private static final Map<String, List<byte[]>> roomHistories = new ConcurrentHashMap<>();

    @OnOpen
    public void onOpen(@PathParam("room") String room) {
        System.out.println("User joined room: " + room);

        List<byte[]> history = roomHistories.get(room);

        if (history != null && !history.isEmpty()) {
            System.out.println("Sending " + history.size() + " historical strokes to new user.");

            for (byte[] stroke : history) {
                connection.sendBinary(stroke)
                        .subscribe()
                        .with(success -> {}, failure -> System.err.println("Failed history playback"));
            }
        }
    }

    @OnBinaryMessage
    public void onBinaryMessage(byte[] message, @PathParam("room") String room) {
        roomHistories.computeIfAbsent(room, k -> new CopyOnWriteArrayList<>()).add(message);
        for (WebSocketConnection c : connection.getOpenConnections()) {
            String peerRoom = c.pathParam("room");

            if (room.equals(peerRoom) && !c.id().equals(connection.id())) {
                c.sendBinary(message)
                        .subscribe()
                        .with(
                                success -> {},
                                failure -> System.err.println("Failed to stream coordinates: " + failure.getMessage())
                        );
            }
        }
    }
}