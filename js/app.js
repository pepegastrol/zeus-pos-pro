/**
 * ZEUS POS - Inicializador Global (ES6 Module)
 */

import { state, updateState, showNotification } from './store.js';
import { openDB, refreshStore, getConfig, setConfig, hashPIN } from './db.js';
import { initInventory, renderInventoryTable, saveProductFromModal, clearInventoryHandler, exportBackup, changeInvPage } from './inventory.js';
import { initPOS, renderPosProducts, finalizeSale, printTicket, updateChange } from './pos.js';
import { initDashboard, handleRegisterMerma, generateAccountingReport, changeHistPage, openCorteHandler, handleSaveCorte, updateCorteDiffUI } from './dashboard.js';
import { autoBackupToCloud, connectGoogleDrive, initGoogleDrive } from './backup_manager.js';
import { checkLicense } from './license.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await requestPersistentStorage();
        await openDB();
        
        // --- 1. VALIDACIÓN DE LICENCIA (HWID) ---
        const isLicensed = await checkLicense();
        if (!isLicensed) return; // Detener todo si no hay licencia

        await refreshStore();
        await initGoogleDrive();
        
        // Cargar Tema Guardado
        const savedTheme = localStorage.getItem('zeus-theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.checked = savedTheme === 'dark';

        await initInventory();
        await initPOS();
        await initDashboard();
        
        const savedPin = await getConfig("userPin");
        const bizName = await getConfig("businessName") || state.businessType || "Acceso Protegido";
        const welcomeMsg = await getConfig("welcomeMessage") || `Bienvenido a ${bizName}`;
        const titleEl = document.getElementById('loginWelcomeTitle');
        if (titleEl) titleEl.innerText = welcomeMsg;

        const isAuthenticated = sessionStorage.getItem("zeus_auth") === "true";

        if (savedPin && !isAuthenticated) {
            document.getElementById('loginModal').style.display = 'flex';
        } else {
            console.log("Sistema nuevo, sin PIN o sesión activa: Acceso libre.");
            // Cargar datos por defecto para el panel de ajustes
            document.getElementById('cfgBizName').value = state.businessType || "";
        }

        if (state.products.length === 0) {
            startOnboarding();
        }

        bindNavigation();
        bindGlobalEvents();
        initInactivityTimer();
        autoBackupToCloud(); // Intento de respaldo inicial

        // --- OTA Updates UI ---
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            
            const otaStatusText = document.getElementById('otaStatusText');
            const otaStatusSubtext = document.getElementById('otaStatusSubtext');
            const otaActionBtnContainer = document.getElementById('otaActionBtnContainer');
            const otaProgressContainer = document.getElementById('otaProgressContainer');
            const otaProgressBar = document.getElementById('otaProgressBar');
            const otaProgressText = document.getElementById('otaProgressText');

            ipcRenderer.on('update-not-available', () => {
                if(otaStatusText) otaStatusText.innerHTML = '<i class="fas fa-check-circle" style="color: #2a7d2e; margin-right: 8px;"></i> Sistema Actualizado';
                if(otaStatusSubtext) otaStatusSubtext.innerText = 'Cuentas con la última versión de ZEUS POS.';
                if(otaActionBtnContainer) otaActionBtnContainer.innerHTML = '';
            });

            ipcRenderer.on('update-available', (event, info) => {
                if(otaStatusText) otaStatusText.innerHTML = '<i class="fas fa-bell" style="color: #c28a5c; margin-right: 8px;"></i> Se requiere Nueva Actualización';
                if(otaStatusSubtext) otaStatusSubtext.innerText = 'Una nueva versión con mejoras está lista para instalarse.';
                if(otaActionBtnContainer) {
                    otaActionBtnContainer.innerHTML = '<button id="btnOtaDownload" class="btn-primary" style="background: linear-gradient(135deg, #c28a5c, #8c5a35); padding: 10px 20px;"><i class="fas fa-download"></i> Actualizar</button>';
                    document.getElementById('btnOtaDownload').addEventListener('click', () => {
                        ipcRenderer.send('start-download');
                        otaActionBtnContainer.innerHTML = '';
                        otaStatusText.innerHTML = '<i class="fas fa-spinner fa-spin" style="color: #c28a5c; margin-right: 8px;"></i> Descargando...';
                        otaStatusSubtext.innerText = 'Por favor, no cierres el sistema.';
                        otaProgressContainer.style.display = 'block';
                    });
                }
            });

            ipcRenderer.on('download-progress', (event, progressObj) => {
                const percent = Math.round(progressObj.percent);
                if(otaProgressBar) otaProgressBar.style.width = percent + '%';
                if(otaProgressText) otaProgressText.innerText = percent + '%';
            });

            ipcRenderer.on('update-downloaded', (event, info) => {
                if(otaProgressContainer) otaProgressContainer.style.display = 'none';
                if(otaStatusText) otaStatusText.innerHTML = '<i class="fas fa-check-circle" style="color: #2a7d2e; margin-right: 8px;"></i> Sistema Actualizado';
                if(otaStatusSubtext) otaStatusSubtext.innerText = `Versión ${info.version || 'Nueva'} descargada con éxito. Reinicia el sistema para aplicar los cambios.`;
                if(otaActionBtnContainer) {
                    otaActionBtnContainer.innerHTML = '<button id="btnOtaInstall" class="btn-primary" style="background: #2a7d2e;"><i class="fas fa-power-off"></i> Reiniciar Ahora</button>';
                    document.getElementById('btnOtaInstall').addEventListener('click', () => {
                        ipcRenderer.send('install-update');
                    });
                }
            });
        }

    } catch (err) {
        console.error("Falla en inicialización:", err);
    }
});

/**
 * Vincula eventos globales que antes estaban en el HTML.
 */
function bindGlobalEvents() {
    // Inventory
    document.getElementById('importExcelBtn')?.addEventListener('click', () => document.getElementById('excelFileInput').click());
    document.getElementById('exportBackupBtn')?.addEventListener('click', exportBackup);
    document.getElementById('clearInvBtn')?.addEventListener('click', clearInventoryHandler);
    document.getElementById('newProdBtn')?.addEventListener('click', () => import('./inventory.js').then(m => m.openProductModal()));
    document.getElementById('saveProductBtn')?.addEventListener('click', saveProductFromModal);
    document.getElementById('closeProductModalBtn')?.addEventListener('click', () => document.getElementById('productModal').style.display = 'none');
    
    // Pagination Inventory
    document.getElementById('invPrevBtn')?.addEventListener('click', () => changeInvPage(-1));
    document.getElementById('invNextBtn')?.addEventListener('click', () => changeInvPage(1));
    
    // POS
    document.getElementById('finalizeSaleBtn')?.addEventListener('click', finalizeSale);
    document.getElementById('printTicketBtn')?.addEventListener('click', printTicket);
    document.getElementById('closeTicketModalBtn')?.addEventListener('click', () => document.getElementById('ticketModal').style.display = 'none');
    document.getElementById('cashGiven')?.addEventListener('input', updateChange);
    
    // Dashboard
    document.getElementById('registerMermaBtn')?.addEventListener('click', handleRegisterMerma);
    
    document.getElementById('openReportModalBtn')?.addEventListener('click', () => {
        document.getElementById('reportModal').style.display = 'flex';
    });
    document.getElementById('downloadReportBtn')?.addEventListener('click', generateAccountingReport);
    
    document.getElementById('historyPeriodFilter')?.addEventListener('change', initDashboard);
    document.getElementById('histPrevBtn')?.addEventListener('click', () => changeHistPage(-1));
    document.getElementById('histNextBtn')?.addEventListener('click', () => changeHistPage(1));
    document.getElementById('openCorteBtn')?.addEventListener('click', openCorteHandler);
    document.getElementById('closeCorteModalBtn')?.addEventListener('click', () => document.getElementById('corteModal').style.display = 'none');
    document.getElementById('saveCorteBtn')?.addEventListener('click', handleSaveCorte);
    document.getElementById('cortePhysicalCash')?.addEventListener('input', updateCorteDiffUI);
    
    // Cambio de Tema
    document.getElementById('themeToggle')?.addEventListener('change', (e) => {
        const newTheme = e.target.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('zeus-theme', newTheme);
    });

    document.getElementById('configDriveBtn')?.addEventListener('click', () => {
        connectGoogleDrive();
    });

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        lockSystem();
    });

    // Configuración
    document.getElementById('saveBizNameBtn')?.addEventListener('click', handleSaveBizName);
    document.getElementById('saveNewPinBtn')?.addEventListener('click', handleSaveNewPin);
    
    document.getElementById('restoreBackupBtn')?.addEventListener('click', () => {
        document.getElementById('restoreBackupInput').click();
    });
    document.getElementById('restoreBackupInput')?.addEventListener('change', handleRestoreBackup);

    // Login
    document.getElementById('loginSubmitBtn')?.addEventListener('click', handleLogin);
    document.getElementById('loginPassword')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    // Notification
    document.getElementById('closeNotificationBtn')?.addEventListener('click', () => document.getElementById('notificationModal').style.display = 'none');
}

function bindNavigation() {
    document.querySelectorAll('.tab-link').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            document.querySelectorAll('.tab-link').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active-pane'));
            document.getElementById(`${section}Panel`).classList.add('active-pane');
            
            if (section === 'cashier') renderPosProducts();
            if (section === 'inventory') renderInventoryTable();
            if (section === 'dashboard') initDashboard();
            if (section === 'settings') loadSettingsData();
        });
    });
}

async function startOnboarding() {
    const bizOptions = ["Tienda", "Abarrotes", "Venta de Postres", "Venta de Pizza"];
    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal';
    modalDiv.style.zIndex = '3000';
    modalDiv.innerHTML = `
        <div class="modal-card" style="text-align:center;">
            <h2>⚡ Bienvenido a ZEUS</h2>
            <p>Configura tu acceso y negocio:</p>
            <div style="margin: 20px 0; display: flex; flex-direction: column; gap: 10px;">
                <input type="text" id="newUser" placeholder="Usuario administrador" style="text-align:center; font-size:1.2rem;">
                <input type="password" id="newPin" placeholder="Contraseña segura" style="text-align:center; font-size:1.2rem;">
            </div>
            <p style="font-size:0.8rem; color:#888;">Elige tu tipo de negocio:</p>
            <div style="display:flex; flex-wrap:wrap; gap:12px; justify-content:center; margin:15px 0;">
                ${bizOptions.map(b => `<button class="biz-selector btn-soft" data-biz="${b}" style="padding:15px 30px;">${b}</button>`).join('')}
            </div>
        </div>`;
    document.body.appendChild(modalDiv);

    modalDiv.querySelectorAll('.biz-selector').forEach(btn => {
        btn.addEventListener('click', async () => {
            const user = document.getElementById('newUser').value.trim();
            const pin = document.getElementById('newPin').value;
            if (!user || pin.length < 4) {
                alert("Por favor, ingresa un usuario y una contraseña (mínimo 4 caracteres).");
                return;
            }
            const hashedPin = await hashPIN(pin);
            const biz = btn.dataset.biz;
            
            await setConfig("sysUser", user);
            await setConfig("userPin", hashedPin);
            await setConfig("businessType", biz);
            
            try {
                await fetch('api/auth.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'save', pin: hashedPin })
                });
            } catch (e) { console.error("Error guardando PIN en servidor"); }

            const samples = getSamplesByBiz(biz);
            await import('./db.js').then(m => m.putMany("inventario", samples));
            await refreshStore();
            modalDiv.remove();
            
            // Log de Auditoría Inicial
            const { addLog } = await import('./db.js');
            await addLog("SISTEMA", "Sistema Inicializado", { negocio: biz });

            // Re-render UI
            renderInventoryTable();
            renderPosProducts();
            initDashboard();
        });
    });
}

function getSamplesByBiz(biz) {
    const base = { precio: 10, stock: 20, categoria: "Ejemplos" };
    if (biz === "Tienda") return [{ ...base, nombre: "Camisa" }, { ...base, nombre: "Pantalón" }];
    if (biz === "Abarrotes") return [{ ...base, nombre: "Arroz 1kg" }, { ...base, nombre: "Leche" }];
    return [{ ...base, nombre: "Producto A" }, { ...base, nombre: "Producto B" }];
}

export async function handleLogin() {
    const enteredUser = document.getElementById('loginUsername').value.trim();
    const enteredPin = document.getElementById('loginPassword').value;
    if (!enteredUser || !enteredPin) return;
    
    const hashedEntered = await hashPIN(enteredPin);
    
    // Validación Local (Instantánea)
    const savedPin = await getConfig("userPin");
    const savedUser = await getConfig("sysUser") || "admin";
    
    if (hashedEntered === savedPin && enteredUser === savedUser) {
        sessionStorage.setItem("zeus_auth", "true");
        document.getElementById('loginModal').style.display = 'none';
        
        // Forzar vista a Dashboard al hacer login
        const dashBtn = document.querySelector('.tab-link[data-section="dashboard"]');
        if (dashBtn) dashBtn.click();
        
        showNotification("Acceso Concedido", "Sesión iniciada correctamente.");
        autoBackupToCloud();
    } else {
        document.getElementById('loginErrorMessage').style.display = 'block';
        document.getElementById('loginPassword').value = '';
    }
}

async function loadSettingsData() {
    const bizName = await getConfig("businessName") || state.businessType;
    const sysUser = await getConfig("sysUser") || "admin";
    const welcomeMsg = await getConfig("welcomeMessage") || `Bienvenido a ${bizName}`;
    document.getElementById('cfgBizName').value = bizName;
    document.getElementById('cfgWelcomeText').value = welcomeMsg;
    document.getElementById('cfgNewUsername').value = sysUser;
    document.getElementById('cfgNewPassword').value = '';
}

async function handleSaveBizName() {
    const newName = document.getElementById('cfgBizName').value;
    const newWelcome = document.getElementById('cfgWelcomeText').value || `Bienvenido a ${newName}`;
    
    if (!newName) return;
    await setConfig("businessName", newName);
    await setConfig("welcomeMessage", newWelcome);
    updateState({ businessType: newName });
    document.getElementById('businessDisplay').innerText = `⚙️ Negocio: ${newName}`;
    
    const titleEl = document.getElementById('loginWelcomeTitle');
    if (titleEl) titleEl.innerText = newWelcome;
    
    showNotification("Éxito", "Identidad del negocio actualizada.");
}

async function handleSaveNewPin() {
    const newUser = document.getElementById('cfgNewUsername').value.trim();
    const newPin = document.getElementById('cfgNewPassword').value;
    
    if (!newUser) {
        showNotification("Error", "El usuario no puede estar vacío", true);
        return;
    }
    
    if (newPin) {
        if (newPin.length < 4) {
            showNotification("Error", "La contraseña debe tener mínimo 4 caracteres", true);
            return;
        }
        const hashed = await hashPIN(newPin);
        await setConfig("userPin", hashed);
    }
    
    await setConfig("sysUser", newUser);
    showNotification("Seguridad", "Credenciales de acceso actualizadas.");
    document.getElementById('cfgNewPassword').value = '';
}

async function handleRestoreBackup(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm("⚠️ ADVERTENCIA CRÍTICA: Esta acción borrará todo tu sistema actual y lo reemplazará por la información del archivo. ¿Estás completamente seguro de continuar?")) {
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            if (!data.products || !data.sales) throw new Error("El archivo no es un respaldo válido de ZEUS POS.");
            
            const dbModule = await import('./db.js');
            // Limpiar datos actuales
            await dbModule.clearStore("inventario");
            await dbModule.clearStore("ventas");
            await dbModule.clearStore("mermas");
            await dbModule.clearStore("configuracion");
            
            // Inyectar datos del respaldo
            if (data.products && data.products.length) await dbModule.putMany("inventario", data.products);
            if (data.sales && data.sales.length) await dbModule.putMany("ventas", data.sales);
            if (data.mermas && data.mermas.length) await dbModule.putMany("mermas", data.mermas);
            if (data.configuracion && data.configuracion.length) await dbModule.putMany("configuracion", data.configuracion);
            
            alert("✅ ¡Respaldo restaurado con éxito! El sistema se reiniciará automáticamente para aplicar todos los datos.");
            location.reload();
            
        } catch (err) {
            console.error(err);
            alert("❌ Error al restaurar. El archivo podría estar dañado o no ser un respaldo válido de ZEUS.");
        }
        e.target.value = '';
    };
    reader.readAsText(file);
}

/**
 * Pide permiso al sistema para que no borre los datos automáticamente.
 */
async function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persist();
        console.log(`Persistencia de datos concedida: ${isPersisted}`);
    }
}

/**
 * Bloqueo automático por inactividad.
 */
let inactivityTimeout;
const INACTIVITY_TIME = 5 * 60 * 1000; // 5 Minutos

function initInactivityTimer() {
    const resetTimer = () => {
        clearTimeout(inactivityTimeout);
        inactivityTimeout = setTimeout(lockSystem, INACTIVITY_TIME);
    };

    // Escuchar cualquier interacción
    window.onload = resetTimer;
    document.onmousemove = resetTimer;
    document.onkeypress = resetTimer;
    document.ontouchstart = resetTimer;
    document.onclick = resetTimer;
}

function lockSystem() {
    sessionStorage.removeItem("zeus_auth");
    const loginModal = document.getElementById('loginModal');
    if (loginModal && loginModal.style.display !== 'flex') {
        loginModal.style.display = 'flex';
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginErrorMessage').style.display = 'none';
        showNotification("Seguridad", "Sistema bloqueado por inactividad.", true);
    }
}


