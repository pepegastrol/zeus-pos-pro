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
        icon: path.join(__dirname, 'icon.ico'), // Opcional: añade un ícono luego
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // Quitar el menú por defecto (Archivo, Edición, etc.) para que parezca una app nativa
    Menu.setApplicationMenu(null);

    // Cargar el archivo HTML principal
    mainWindow.loadFile('puntodeventas.html');

    // Ocultar la ventana hasta que esté lista para mostrarse
    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
    });
}

// Inicializar la app
app.whenReady().then(() => {
    // Falsificar el User-Agent para engañar a Google y evitar el bloqueo Error 400 (OAuth)
    app.userAgentFallback = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    createWindow();

    // Iniciar radar de actualizaciones si la app está compilada (.exe)
    if (app.isPackaged) {
        autoUpdater.checkForUpdates();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
