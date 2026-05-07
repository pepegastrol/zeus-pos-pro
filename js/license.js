import { getConfig, setConfig } from './db.js';

let cryptoModule = null;
let execSync = null;

try {
    if (typeof require !== 'undefined') {
        cryptoModule = require('crypto');
        execSync = require('child_process').execSync;
    }
} catch (e) {
    console.warn("Node.js context not found.");
}

export async function checkLicense() {
    // Si no estamos en Electron o no hay Node, bypass (ideal para pruebas en navegador web)
    if (!cryptoModule || !execSync) {
        console.warn("Entorno sin Node.js, omitiendo chequeo estricto de HWID.");
        return true; 
    }

    const hwid = getMachineId();
    const savedLicense = await getConfig("licenseKey");
    
    // Función interna para mostrar el modal
    const showModal = (isExpired = false, expirationDateStr = "") => {
        const modal = document.getElementById('activationModal');
        if (!modal) return;
        
        modal.style.display = 'flex';
        document.getElementById('hwidDisplay').innerText = hwid;
        
        if (isExpired) {
            document.getElementById('licenseErrorMsg').innerText = `LICENCIA EXPIRADA (Venció el ${expirationDateStr}). Contacte a su proveedor.`;
            document.getElementById('licenseErrorMsg').style.display = 'block';
        }

        document.getElementById('activateLicenseBtn').onclick = async () => {
            const input = document.getElementById('licenseInput').value.trim();
            const { isValid, isExpired: newIsExpired, expDateStr } = validateLicense(hwid, input);
            
            if (isValid && !newIsExpired) {
                await setConfig("licenseKey", input);
                modal.style.display = 'none';
                alert("✅ ¡Licencia Activada con Éxito! ZEUS ha sido registrado.");
            } else {
                const errorMsg = document.getElementById('licenseErrorMsg');
                if (newIsExpired) {
                    errorMsg.innerText = `La licencia que intentas usar está EXPIRADA (Venció el ${expDateStr}).`;
                } else {
                    errorMsg.innerText = "Licencia Inválida. Verifique que el código y el HWID coincidan.";
                }
                errorMsg.style.display = 'block';
            }
        };
    };

    if (!savedLicense) {
        showModal(false);
        return false;
    }
    
    // Validar la licencia existente
    const { isValid, isExpired, expDateStr } = validateLicense(hwid, savedLicense);
    
    if (isValid && !isExpired) {
        return true; // Acceso concedido
    } else {
        showModal(isExpired, expDateStr);
        return false; // Bloqueado
    }
}

export function getMachineId() {
    try {
        let stdout = '';
        if (process.platform === 'win32') {
            stdout = execSync('wmic baseboard get serialnumber').toString();
        } else if (process.platform === 'darwin') {
            stdout = execSync('ioreg -rd1 -c IOPlatformExpertDevice').toString();
        } else {
            stdout = execSync('cat /etc/machine-id').toString();
        }
        
        let serial = stdout.replace(/SerialNumber|IOPlatformSerialNumber/ig, '').replace(/\s+/g, '').trim();
        if (!serial) serial = "GENERIC-PC-ID";
        
        // Hashear el serial físico para estandarizar formato y ocultarlo
        const hash = cryptoModule.createHash('sha256').update(serial + "ZEUS_POS_SYSTEM_2026").digest('hex').toUpperCase();
        
        // Formato HWID: AAAA-BBBB-CCCC-DDDD
        return `${hash.substring(0,4)}-${hash.substring(4,8)}-${hash.substring(8,12)}-${hash.substring(12,16)}`;
    } catch (e) {
        return "ERROR-HWID-0000-0000";
    }
}

export function validateLicense(hwid, licenseInput) {
    if (!licenseInput || !licenseInput.includes('-')) return { isValid: false, isExpired: false, expDateStr: "" };
    
    // Formato esperado: PREFIJO-XXXXX-XXXXX-XXXXX
    const parts = licenseInput.split('-');
    const prefix = parts[0];
    
    // Reconstruir la firma esperada
    const MASTER_SECRET = "PROGRAMADORVELAS_ZEUS_MASTER_KEY_2026";
    const hash = cryptoModule.createHash('sha256').update(hwid + prefix + MASTER_SECRET).digest('hex').toUpperCase();
    const expectedSignature = `${hash.substring(0,5)}-${hash.substring(5,10)}-${hash.substring(10,15)}`;
    
    const actualSignature = `${parts[1]}-${parts[2]}-${parts[3]}`;
    
    if (expectedSignature !== actualSignature) {
        return { isValid: false, isExpired: false, expDateStr: "" };
    }

    // Firma válida, ahora comprobar caducidad
    if (prefix === "PERM") {
        return { isValid: true, isExpired: false, expDateStr: "PERMANENTE" };
    }

    // Prefix es YYMMDD
    if (prefix.length === 6) {
        const yy = parseInt(prefix.substring(0, 2));
        const mm = parseInt(prefix.substring(2, 4)) - 1; // Meses en JS son 0-11
        const dd = parseInt(prefix.substring(4, 6));
        
        const expDate = new Date(2000 + yy, mm, dd, 23, 59, 59);
        const hoy = new Date();
        
        const expDateStr = expDate.toLocaleDateString();
        
        if (hoy > expDate) {
            return { isValid: true, isExpired: true, expDateStr };
        }
        
        return { isValid: true, isExpired: false, expDateStr };
    }
    
    return { isValid: false, isExpired: false, expDateStr: "" };
}
