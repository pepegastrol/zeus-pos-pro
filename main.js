const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

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
        mainWindow.show();
    });
}

// Inicializar la app
app.whenReady().then(() => {
    createWindow();

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
