/**
 * ZEUS DB - Módulo de persistencia y utilidades (ES6 Module)
 */

import { state, updateState } from './store.js';

const DB_NAME = "ZeusDB";
const DB_VERSION = 7;
let db = null;

/**
 * Abre la conexión a la base de datos.
 */
export function openDB() {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (e) => {
            const dbx = e.target.result;
            if (!dbx.objectStoreNames.contains("inventario")) {
                const store = dbx.createObjectStore("inventario", { keyPath: "id", autoIncrement: true });
                store.createIndex("nombre", "nombre", { unique: false });
                store.createIndex("categoria", "categoria", { unique: false });
            }
            if (!dbx.objectStoreNames.contains("ventas")) {
                const store = dbx.createObjectStore("ventas", { keyPath: "id", autoIncrement: true });
                store.createIndex("timestamp", "timestamp", { unique: false });
                store.createIndex("synced", "synced", { unique: false });
            }
            if (!dbx.objectStoreNames.contains("configuracion")) {
                dbx.createObjectStore("configuracion", { keyPath: "key" });
            }
            if (!dbx.objectStoreNames.contains("mermas")) {
                dbx.createObjectStore("mermas", { keyPath: "id", autoIncrement: true });
            }
            if (!dbx.objectStoreNames.contains("logs")) {
                const store = dbx.createObjectStore("logs", { keyPath: "id", autoIncrement: true });
                store.createIndex("timestamp", "timestamp", { unique: false });
                store.createIndex("synced", "synced", { unique: false });
            }
            if (!dbx.objectStoreNames.contains("cortes")) {
                const store = dbx.createObjectStore("cortes", { keyPath: "id", autoIncrement: true });
                store.createIndex("fecha", "fecha", { unique: false });
            }
        };
    });
}

export async function getRecentSales(days = 30) {
    if (!db) await openDB();
    const minTimestamp = Date.now() - (days * 24 * 60 * 60 * 1000);
    return new Promise((res, rej) => {
        const tx = db.transaction("ventas", "readonly");
        const store = tx.objectStore("ventas");
        const index = store.index("timestamp");
        const range = IDBKeyRange.lowerBound(minTimestamp);
        const req = index.getAll(range);
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
    });
}

/**
 * Sincroniza el store local con la base de datos.
 */
export async function refreshStore() {
    const [products, sales, mermas, bizType, categories] = await Promise.all([
        getAll("inventario"),
        getRecentSales(30), // Fase 1: Solo cargamos los últimos 30 días de ventas a RAM
        getAll("mermas"),
        getConfig("businessType"),
        getConfig("categories")
    ]);

    await updateState({
        products,
        sales,
        mermas,
        businessType: bizType || "Zeus POS",
        categories: categories || ["General"]
    });
}

export async function getAll(storeName) {
    if (!db) await openDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
    });
}

export async function putItem(storeName, item) {
    if (!db) await openDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.put(item);
        tx.oncomplete = () => res(req.result);
        tx.onerror = () => rej(tx.error);
    });
}

export async function putMany(storeName, items) {
    if (!db) await openDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        items.forEach(item => store.put(item));
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
    });
}

export async function deleteItem(storeName, id) {
    if (!db) await openDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).delete(id);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
    });
}

export async function clearStore(storeName) {
    if (!db) await openDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
    });
}

export async function getConfig(key) {
    if (!db) await openDB();
    const tx = db.transaction("configuracion", "readonly");
    const req = tx.objectStore("configuracion").get(key);
    return new Promise(res => { 
        req.onsuccess = () => res(req.result?.value);
        req.onerror = () => res(null);
    });
}

export async function setConfig(key, value) {
    await putItem("configuracion", { key, value });
}

/**
 * Registra un evento en la tabla de auditoría.
 */
export async function addLog(tipo, descripcion, detalles = {}) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        tipo, // 'INVENTARIO', 'VENTA', 'SISTEMA', 'MERMA'
        descripcion,
        detalles
    };
    try {
        await putItem("logs", logEntry);
    } catch (e) {
        console.error("Error al registrar log:", e);
    }
}

/**
 * Obtiene los registros de auditoría más recientes.
 */
export async function getRecentLogs(limit = 20) {
    if (!db) await openDB();
    return new Promise((res, rej) => {
        const tx = db.transaction("logs", "readonly");
        const store = tx.objectStore("logs");
        const index = store.index("timestamp");
        const req = index.openCursor(null, "prev"); // Orden descendente
        const results = [];
        
        req.onsuccess = () => {
            const cursor = req.result;
            if (cursor && results.length < limit) {
                results.push(cursor.value);
                cursor.continue();
            } else {
                res(results);
            }
        };
        req.onerror = () => rej(req.error);
    });
}

// Utilidades exportadas
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function escapeHTML(str) {
    if (!str) return "";
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

export async function hashPIN(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function showCustomPrompt(title, message, defaultValue = "") {
    return new Promise((resolve) => {
        const modal = document.getElementById('inputModal');
        const field = document.getElementById('inputModalField');
        const confirmBtn = document.getElementById('inputModalConfirm');
        const cancelBtn = document.getElementById('inputModalCancel');
        
        document.getElementById('inputModalTitle').innerText = title;
        document.getElementById('inputModalMessage').innerText = message;
        field.value = defaultValue;
        
        modal.style.display = 'flex';
        field.focus();
        
        const cleanup = () => {
            modal.style.display = 'none';
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
        };
        
        confirmBtn.onclick = () => {
            const val = field.value;
            cleanup();
            resolve(val);
        };
        
        cancelBtn.onclick = () => {
            cleanup();
            resolve(null);
        };
    });
}

