<?php
header('Content-Type: application/json');
require_once 'db_config.php';

$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    echo json_encode(['success' => false, 'message' => 'No hay datos para sincronizar']);
    exit;
}

$action = $input['action'] ?? '';
$data   = $input['data'] ?? [];

try {
    if ($action === 'sync_sales') {
        $stmt = $pdo->prepare("INSERT IGNORE INTO ventas (id_local, timestamp, fecha, total, items) VALUES (?, ?, ?, ?, ?)");
        foreach ($data as $sale) {
            $stmt->execute([
                $sale['id'], 
                $sale['timestamp'], 
                $sale['fecha'], 
                $sale['total'], 
                json_encode($sale['items'])
            ]);
        }
        echo json_encode(['success' => true, 'message' => 'Ventas sincronizadas']);
    } 
    
    else if ($action === 'sync_logs') {
        $stmt = $pdo->prepare("INSERT INTO logs (timestamp, tipo, descripcion, detalles) VALUES (?, ?, ?, ?)");
        foreach ($data as $log) {
            $stmt->execute([
                $log['timestamp'], 
                $log['tipo'], 
                $log['descripcion'], 
                json_encode($log['detalles'])
            ]);
        }
        echo json_encode(['success' => true, 'message' => 'Logs sincronizados']);
    }

} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
?>
