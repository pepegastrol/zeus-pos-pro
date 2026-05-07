/**
 * ZEUS Cloud - Motor Oficial Google Drive API
 */
import { state, showNotification } from './store.js';
import { getConfig, setConfig, getAll } from './db.js';

let tokenClient;
let accessToken = null;

/**
 * Inicializa el cliente de Google.
 */
export async function initGoogleDrive() {
    accessToken = await getConfig("googleToken");
}

/**
 * Abre la ventana de Google para que el usuario "meta sus datos".
 */
export function connectGoogleDrive() {
    const client_id = "879480744232-f39a9gr3uqitbos8ubgvvagfumoo2rc9.apps.googleusercontent.com";
    
    if (!window.google) return;

    tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: client_id,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: async (response) => {
            if (response.error) return;
            accessToken = response.access_token;
            await setConfig("googleToken", accessToken);
            showNotification("Conectado", "ZEUS ya tiene acceso a tu Google Drive.");
            autoBackupToCloud();
        },
    });

    tokenClient.requestAccessToken({ prompt: 'consent' });
}

/**
 * Sincronización Automática Silenciosa
 */
export async function autoBackupToCloud() {
    if (!navigator.onLine || !accessToken) return;

    // Fase 1: El respaldo toma los datos completos de IndexedDB, 
    // no de la memoria RAM (que ahora solo tiene 30 días)
    const [allProducts, allSales, allMermas, allConfig] = await Promise.all([
        getAll("inventario"),
        getAll("ventas"),
        getAll("mermas"),
        getAll("configuracion")
    ]);

    const backupData = {
        business: state.businessType,
        timestamp: new Date().toISOString(),
        products: allProducts,
        sales: allSales,
        mermas: allMermas,
        configuracion: allConfig
    };

    const fileName = `ZEUS_BACKUP_${state.businessType || "LOCAL"}.json`;
    const fileContent = JSON.stringify(backupData);

    try {
        // 1. Buscar si el archivo ya existe en el Drive del cliente
        const q = `name = '${fileName}' and trashed = false`;
        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        
        if (searchRes.status === 401) {
            console.warn("ZEUS: Sesión de Google Drive expirada. Se requiere reconexión manual.");
            accessToken = null;
            return;
        }
        
        const searchData = await searchRes.json();

        if (searchData.files && searchData.files.length > 0) {
            // 2A. El archivo existe -> Lo sobreescribimos usando PATCH
            const fileId = searchData.files[0].id;
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
                method: 'PATCH',
                headers: { 
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'application/json'
                },
                body: fileContent
            });
            console.log("ZEUS: Respaldo sobrescrito en la nube exitosamente (Drive actualizado).");
        } else {
            // 2B. No existe -> Lo creamos desde cero usando POST
            const fileMetadata = { name: fileName, mimeType: 'application/json' };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
            form.append('file', new Blob([fileContent], { type: 'application/json' }));

            await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + accessToken },
                body: form
            });
            console.log("ZEUS: Primer respaldo creado en Google Drive.");
        }
    } catch (err) {
        console.error("ZEUS: Error al sincronizar con Drive", err);
    }
}

// Re-intentar cada hora
setInterval(autoBackupToCloud, 60 * 60 * 1000);

