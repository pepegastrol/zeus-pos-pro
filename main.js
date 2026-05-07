const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Configuración del Auto Updater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Eventos de Actualización
autoUpdater.on('update-available', () => {
    dialog.showMessageBox({
        type: 'info',
        title: '🌟 Actualización ZEUS',
        message: 'Se ha detectado una nueva versión en la nube. Se descargará en segundo plano automáticamente para no interrumpir tus ventas.',
        buttons: ['Excelente']
    });
});

autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
        type: 'info',
        title: '✅ Actualización Lista',
        message: 'La nueva versión se descargó con éxito. ¿Deseas reiniciar ZEUS ahora para aplicar los cambios o prefieres esperar a que cierres tu turno?',
        buttons: ['Reiniciar y Actualizar Ahora', 'Más tarde']
    }).then((result) => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});

autoUpdater.on('error', (err) => {
    console.error('Error de actualización:', err);
});

function createWindow() {
    // Crear la ventana del navegador.
    const mainWindow = new BrowserWindow({
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
