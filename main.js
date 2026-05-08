const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
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

// Servidor temporal para capturar el token de Google Auth (Flujo en navegador externo)
ipcMain.on('start-google-auth', (event) => {
    const client_id = "879480744232-f39a9gr3uqitbos8ubgvvagfumoo2rc9.apps.googleusercontent.com";
    const redirect_uri = "http://localhost:8081";
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=token&scope=https://www.googleapis.com/auth/drive.file&prompt=consent`;

    const http = require('http');
    let authServer;
    
    try {
        authServer = http.createServer((req, res) => {
            if (req.url === '/') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`
                    <html>
                    <head><title>Autorización ZEUS POS</title></head>
                    <body style="display: flex; justify-content: center; align-items: center; height: 100vh; background: #fdfaf6; font-family: sans-serif; text-align: center;">
                    <div>
                        <h2 id="msg" style="color: #c28a5c;">ZEUS POS: Verificando acceso seguro...</h2>
                        <p style="color: #8c5a35;">Por favor, espera un momento.</p>
                    </div>
                    <script>
                        const hash = window.location.hash.substring(1);
                        const params = new URLSearchParams(hash);
                        const token = params.get('access_token');
                        if (token) {
                            fetch('/token', { method: 'POST', body: token }).then(() => {
                                document.getElementById('msg').innerHTML = '✅ Conexión Exitosa';
                                document.getElementById('msg').style.color = '#2a7d2e';
                                document.querySelector('p').innerText = 'Ya puedes cerrar esta pestaña y volver a tu sistema ZEUS POS.';
                                window.close(); // Intenta cerrar la pestaña automáticamente
                            });
                        } else {
                            document.getElementById('msg').innerHTML = '❌ Error de Autenticación';
                            document.getElementById('msg').style.color = '#c2470f';
                            document.querySelector('p').innerText = 'Hubo un problema. Cierra esta ventana y vuelve a intentarlo.';
                        }
                    </script>
                    </body></html>
                `);
            } else if (req.url === '/token' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk.toString(); });
                req.on('end', () => {
                    event.sender.send('google-auth-success', body);
                    res.writeHead(200);
                    res.end('OK');
                    if(authServer) authServer.close();
                });
            } else {
                res.writeHead(404);
                res.end();
            }
        });

        authServer.listen(8081, '127.0.0.1', () => {
            // Abrir el navegador externo por defecto del cliente (Chrome, Edge, etc.)
            shell.openExternal(authUrl);
            
            // Timeout de seguridad de 5 minutos: cerrar el servidor si no hubo respuesta
            setTimeout(() => {
                if(authServer && authServer.listening) authServer.close();
            }, 300000);
        });
    } catch (err) {
        console.error("Error al arrancar servidor de auth local", err);
    }
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
