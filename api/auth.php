<?php
header('Content-Type: application/json');

$data = json_decode(file_get_contents('php://input'), true);
$pin = $data['pin'] ?? '';
$action = $data['action'] ?? 'validate'; // 'save' or 'validate'

$pinFile = __DIR__ . '/pin.txt';

if ($action === 'save') {
    // In a real app, you'd hash it here or receive a hash
    // We'll store the hash sent by the client for simplicity in this POS demo
    file_put_contents($pinFile, $pin);
    echo json_encode(['success' => true, 'message' => 'PIN saved on server']);
    exit;
}

if ($action === 'validate') {
    if (!file_exists($pinFile)) {
        // If no PIN saved, let's say it's valid to allow first setup
        echo json_encode(['success' => true, 'message' => 'No PIN set']);
        exit;
    }

    $storedHash = trim(file_get_contents($pinFile));
    
    if ($pin === $storedHash) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Invalid PIN']);
    }
    exit;
}
