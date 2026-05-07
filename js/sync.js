/**
 * ZEUS Sync - Motor de Sincronización Cloud (ES6 Module)
 */
import { getAll, putMany, openDB } from './db.js';
import { showNotification } from './store.js';

let isSyncing = false;

/**
 * Intenta sincronizar datos pendientes con el servidor.
 */
export async function startSync() {
    if (isSyncing || !navigator.onLine) return;
    isSyncing = true;

    try {
        await syncSales();
        await syncLogs();
    } catch (err) {
        console.error("Falla en sincronización:", err);
    } finally {
        isSyncing = false;
    }
}

async function syncSales() {
    const allSales = await getAll("ventas");
    const unsynced = allSales.filter(s => !s.synced);

    if (unsynced.length === 0) return;

    const response = await fetch('api/sync.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_sales', data: unsynced })
    });

    const result = await response.json();
    if (result.success) {
        const syncedData = unsynced.map(s => ({ ...s, synced: true }));
        await putMany("ventas", syncedData);
        console.log("Ventas sincronizadas con éxito");
    }
}

async function syncLogs() {
    const allLogs = await getAll("logs");
    const unsynced = allLogs.filter(l => !l.synced);

    if (unsynced.length === 0) return;

    const response = await fetch('api/sync.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_logs', data: unsynced })
    });

    const result = await response.json();
    if (result.success) {
        const syncedData = unsynced.map(l => ({ ...l, synced: true }));
        await putMany("logs", syncedData);
    }
}

// Escuchar cambios de conexión
window.addEventListener('online', startSync);
// Sincronización automática cada 5 minutos
setInterval(startSync, 5 * 60 * 1000);
