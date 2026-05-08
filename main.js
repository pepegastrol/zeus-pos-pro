const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;

// Configuración del Auto Updater (Descarga Manual Controlada por UI)
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Eventos de Actualización conectados con el Frontend
autoUpdater.on('update-available', (info) => {
    if(mainWindow) mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('update-not-available', (info) => {
    if(mainWindow) mainWindow.webContents.send('update-not-available', info);
});

autoUpdater.on('download-progress', (progressObj) => {
    if(mainWindow) mainWindow.webContents.send('download-progress', progressObj);
});

autoUpdater.on('update-downloaded', (info) => {
    if(mainWindow) mainWindow.webContents.send('update-downloaded', info);
});

autoUpdater.on('error', (err) => {
    console.error('Error de actualización:', err);
});

ipcMain.on('start-download', () => {
    autoUpdater.downloadUpdate();
});

ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
});

function createWindow() {
    // Crear la ventana del navegador.
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 768,
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // Quitar el menú por defecto
    Menu.setApplicationMenu(null);

    // Arrancar un mini servidor web interno para evitar el error origin=file:// de Google
    const http = require('http');
    const fs = require('fs');

    const server = http.createServer((req, res) => {
        let urlPath = req.url.split('?')[0];
        if (urlPath === '/') urlPath = '/puntodeventas.html';
        
        let filePath = path.normalize(path.join(__dirname, urlPath));
        if (!filePath.startsWith(__dirname)) {
            res.writeHead(403); return res.end('Forbidden');
        }

        let extname = path.extname(filePath);
        let contentType = 'text/html';
        const mimeTypes = {
            '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
            '.png': 'image/png', '.jpg': 'image/jpg', '.ico': 'image/x-icon',
            '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2'
        };
        if (mimeTypes[extname]) contentType = mimeTypes[extname];

        fs.readFile(filePath, (error, content) => {
            if (error) { 
                res.writeHead(404); res.end('Not found'); 
            } else { 
                res.writeHead(200, { 'Content-Type': contentType }); 
                res.end(content, 'utf-8'); 
            }
        });
    });

    // Escuchar en el puerto 8080 de forma local
    server.listen(8080, '127.0.0.1', () => {
        // Cargar el sistema desde el servidor interno (localhost) en lugar de file://
        mainWindow.loadURL('http://localhost:8080');
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
    });
}

// Falsificar el User-Agent GLOBALMENTE antes de que inicie la app para evitar el bloqueo de Google (Insecure Browser)
app.userAgentFallback = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Inicializar la app
app.whenReady().then(() => {

    createWindow();

    // Iniciar radar de actualizaciones manualmente vía IPC cuando el frontend esté listo
    ipcMain.on('check-for-updates', () => {
        if (app.isPackaged) {
            autoUpdater.checkForUpdates();
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Interceptar la creación de ventanas emergentes (como el popup de Google Auth)
// para forzar que parezcan ventanas de Chrome normales y evitar el bloqueo.
app.on('web-contents-created', (event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
        if (url.includes('accounts.google.com')) {
            return {
                action: 'allow',
                overrideBrowserWindowOptions: {
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true,
                        enableRemoteModule: false
                    }
                }
            };
        }
        return { action: 'allow' };
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
