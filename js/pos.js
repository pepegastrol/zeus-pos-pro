/**
 * ZEUS POS - Lógica del Punto de Venta (ES6 Module)
 */

import { state, createElement, updateState, showNotification } from './store.js';
import { putItem, putMany, deleteItem, clearStore, refreshStore, debounce, escapeHTML, showCustomPrompt, addLog } from './db.js';

let copilotAccepted = false;
let currentCopilotSuggestion = null;

/**
 * Inicializa el Punto de Venta.
 */
export async function initPOS() {
    console.log("ZEUS POS: Inicializando POS...");
    const bizDisplay = document.getElementById('businessDisplay');
    if (bizDisplay) bizDisplay.innerText = `🏢 Negocio: ${state.businessType}`;
    
    renderPosProducts();
    renderCartUI();
    renderRecentSales();

    const searchInput = document.getElementById('posSearch');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            renderPosProducts();
        }, 300));
    }
}

/**
 * Renderiza los productos en el grid del POS (Optimizado).
 */
export function renderPosProducts() {
    const container = document.getElementById('posProductsList');
    if (!container) return;

    const searchTerm = document.getElementById('posSearch')?.value.toLowerCase() || '';
    
    const filtered = state.products.filter(p => 
        p.nombre.toLowerCase().includes(searchTerm) && p.stock > 0
    );

    container.innerHTML = ''; // Limpieza controlada
    filtered.forEach(p => {
        const item = createElement('div', { 
            className: 'product-grid-item', 
            onclick: () => addToCart(p.id) 
        }, [
            createElement('h4', {}, [escapeHTML(p.nombre)]),
            createElement('div', {}, [
                createElement('div', { className: 'price' }, [`$${p.precio.toFixed(2)}`]),
                createElement('div', { className: 'stock' }, [
                    createElement('i', { className: 'fas fa-cubes', style: { marginRight: '5px' } }),
                    `${p.stock} disp.`
                ])
            ])
        ]);
        container.appendChild(item);
    });
}

/**
 * Agrega un producto al carrito.
 */
export async function addToCart(prodId) {
    const product = state.products.find(p => p.id === prodId);
    if (!product || product.stock <= 0) {
        await addLog("SISTEMA", `Bloqueo de venta: Sin stock para ${product?.nombre || prodId}`);
        showNotification("Sin stock", "No hay unidades disponibles", true);
        return;
    }

    if (product.fechaCaducidad) {
        const hoy = new Date();
        hoy.setHours(0,0,0,0);
        const fechaCad = new Date(product.fechaCaducidad + 'T00:00:00');
        if (fechaCad < hoy) {
            await addLog("SISTEMA", `Bloqueo de venta: Intento de vender producto caducado: ${product.nombre}`);
            showNotification("⚠️ Bloqueo por Caducidad", `El producto ${product.nombre} expiró el ${product.fechaCaducidad} y no puede venderse.`, true);
            return;
        }
    }

    let qtyToAdd = 1;

    if (product.tipoVenta === 'granel') {
        const input = await showCustomPrompt(`Venta a granel: ${product.nombre}`, "Ingrese la cantidad (kg/L):", "0.500");
        if (input === null) return;
        qtyToAdd = parseFloat(input);
        
        if (isNaN(qtyToAdd) || qtyToAdd <= 0) {
            showNotification("Error", "Cantidad no válida", true);
            return;
        }
    }

    const existing = state.cart.find(item => item.productId === prodId);
    if (existing) {
        if (existing.quantity + qtyToAdd > product.stock) {
            showNotification("Límite", "Stock máximo alcanzado", true);
            return;
        }
        existing.quantity += qtyToAdd;
    } else {
        if (qtyToAdd > product.stock) {
            await addLog("SISTEMA", `Bloqueo de venta: Stock insuficiente para ${product.nombre}`, { solicitado: qtyToAdd, disponible: product.stock });
            showNotification("Límite", "No hay suficiente stock", true);
            return;
        }
        state.cart.push({
            productId: prodId,
            name: product.nombre,
            price: product.precio,
            quantity: qtyToAdd,
            isGranel: product.tipoVenta === 'granel'
        });
    }
    renderCartUI();
}

/**
 * Renderiza la interfaz del carrito (Optimizado).
 */
export function renderCartUI() {
    const container = document.getElementById('cartContainer');
    if (!container) return;

    if (state.cart.length === 0) {
        container.innerHTML = '';
        container.appendChild(createElement('p', { 
            style: { textAlign: 'center', color: '#a48c76', padding: '2rem' } 
        }, ['🛒 Carrito vacío']));
        
        const totalDisplay = document.getElementById('cartTotalAmount');
        if (totalDisplay) totalDisplay.innerText = "$0.00";
        
        const copilotBox = document.getElementById('zeusCopilotBox');
        if (copilotBox) copilotBox.style.display = 'none';
        
        // Resetear el estado del copiloto al vaciar carrito
        copilotAccepted = false;
        currentCopilotSuggestion = null;
        return;
    }
    
    // ZEUS Copilot: Motor de Venta Cruzada
    const copilotBox = document.getElementById('zeusCopilotBox');
    const copilotMsg = document.getElementById('zeusCopilotMessage');
    if (copilotBox && copilotMsg) {
        // Si ya aceptó una sugerencia, no hostigar al cajero
        if (copilotAccepted) {
            copilotBox.style.display = 'none';
        } else {
            const availableUpsells = state.products.filter(p => p.stock > 0 && !state.cart.find(c => c.productId === p.id));
            if (availableUpsells.length > 0) {
                // Mantener la sugerencia actual a menos que se agote o elija agregarla, para no parpadear
                if (!currentCopilotSuggestion || !availableUpsells.find(p => p.id === currentCopilotSuggestion.id)) {
                    currentCopilotSuggestion = availableUpsells[Math.floor(Math.random() * availableUpsells.length)];
                }
                
                const suggested = currentCopilotSuggestion;
                copilotMsg.innerHTML = `Ofrécele al cliente: <strong style="color:white;">${escapeHTML(suggested.nombre)}</strong> <span style="color:#8c9a63;">(+$${suggested.precio.toFixed(2)})</span>`;
                copilotBox.style.display = 'block';
                
                // Evento para agregar al carrito
                copilotBox.onclick = () => {
                    copilotAccepted = true;
                    addToCart(suggested.id);
                };
            } else {
                copilotBox.style.display = 'none';
            }
        }
    }

    let total = 0;
    container.innerHTML = '';
    state.cart.forEach((item, idx) => {
        const subtotal = item.price * item.quantity;
        total += subtotal;
        const qtyDisplay = item.isGranel ? item.quantity.toFixed(3) : item.quantity;

        const cartItem = createElement('div', { className: 'cart-item' }, [
            createElement('div', { style: { flex: 1 } }, [
                createElement('strong', {}, [escapeHTML(item.name)]),
                createElement('br'),
                createElement('small', {}, [`$${item.price.toFixed(2)} x ${qtyDisplay}`])
            ]),
            createElement('div', { style: { fontWeight: 'bold', margin: '0 10px' } }, [`$${subtotal.toFixed(2)}`]),
            createElement('button', { 
                className: 'btn-soft btn-danger', 
                style: { padding: '5px 10px' },
                onclick: () => removeFromCart(idx)
            }, ['✕'])
        ]);
        container.appendChild(cartItem);
    });

    const totalDisplay = document.getElementById('cartTotalAmount');
    if (totalDisplay) totalDisplay.innerText = `$${total.toFixed(2)}`;
    updateChange();
}

export function removeFromCart(idx) {
    state.cart.splice(idx, 1);
    renderCartUI();
}

export function updateChange() {
    const totalDisplay = document.getElementById('cartTotalAmount');
    if (!totalDisplay) return;
    const total = parseFloat(totalDisplay.innerText.replace('$', '')) || 0;
    const cash = parseFloat(document.getElementById('cashGiven').value) || 0;
    const change = Math.max(0, cash - total);
    
    const changeDisplay = document.getElementById('changeDue');
    if (changeDisplay) changeDisplay.innerText = `$${change.toFixed(2)}`;
}

/**
 * Finaliza la venta.
 */
export async function finalizeSale() {
    console.log("ZEUS POS: Iniciando proceso de finalización de venta...");
    if (state.cart.length === 0) {
        console.warn("ZEUS POS: Intento de venta con carrito vacío.");
        return;
    }

    const totalDisplay = document.getElementById('cartTotalAmount');
    if (!totalDisplay) {
        console.error("ZEUS POS: No se encontró cartTotalAmount en el DOM.");
        return;
    }

    // Limpiamos el texto para obtener el número puro
    const totalStr = totalDisplay.innerText.replace('$', '').replace(',', '').trim();
    const total = parseFloat(totalStr);
    const cash = parseFloat(document.getElementById('cashGiven').value) || 0;

    console.log(`ZEUS POS: Total detectado = ${total}, Efectivo recibido = ${cash}`);

    if (isNaN(total)) {
        console.error("ZEUS POS: El total no es un número válido:", totalStr);
        showNotification("Error de Cálculo", "El total de la venta no es válido.", true);
        return;
    }

    if (cash < total) {
        console.warn("ZEUS POS: Efectivo insuficiente.");
        showNotification("Efectivo insuficiente", "El monto recibido es menor al total de la venta.", true);
        return;
    }

    try {
        const productsToUpdate = [];
        for (let item of state.cart) {
            const prod = state.products.find(p => p.id === item.productId);
            if (!prod) {
                console.error(`ZEUS POS: Producto con ID ${item.productId} no encontrado en el estado.`);
                throw new Error(`Producto no encontrado: ${item.name}`);
            }
            if (prod.stock < item.quantity) {
                console.warn(`ZEUS POS: Stock insuficiente para ${item.name}. Requerido: ${item.quantity}, Disponible: ${prod.stock}`);
                throw new Error(`Stock insuficiente para ${item.name}`);
            }
            prod.stock -= item.quantity;
            productsToUpdate.push(prod);
        }

        console.log("ZEUS POS: Actualizando inventario...", productsToUpdate);
        await putMany("inventario", productsToUpdate);
        
        const saleRecord = {
            timestamp: Date.now(),
            fecha: new Date().toLocaleString(),
            items: state.cart.map(i => ({ nombre: i.name, cantidad: i.quantity, precio: i.price })),
            total: total,
            efectivo: cash,
            cambio: cash - total
        };
        
        console.log("ZEUS POS: Guardando registro de venta en IndexedDB...", saleRecord);
        await putItem("ventas", saleRecord);
        
        console.log("ZEUS POS: Venta guardada. Generando ticket.");
        showTicket(saleRecord);

        // Reset state
        updateState({ cart: [] });
        const cashInput = document.getElementById('cashGiven');
        if (cashInput) cashInput.value = '';
        
        await refreshStore();
        copilotAccepted = false;
        currentCopilotSuggestion = null;
        renderCartUI();
        renderPosProducts();
        renderRecentSales();
        
    } catch (err) {
        console.error("ZEUS POS: Error al finalizar venta:", err);
        showNotification("Error", "Ocurrió un error al procesar la venta.", true);
    }
}

/**
 * Renderiza el historial de ventas recientes (visualmente atractivo)
 */
export function renderRecentSales() {
    const container = document.getElementById('posRecentSalesContainer');
    if (!container) return;

    const recentSales = [...state.sales].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 10);

    if (recentSales.length === 0) {
        container.innerHTML = '<div style="font-size: 0.85rem; color: #a48c76; padding: 20px;">No hay ventas recientes en esta sesión.</div>';
        return;
    }

    container.innerHTML = '';
    
    recentSales.forEach((sale, index) => {
        const now = Date.now();
        const diffMs = now - (sale.timestamp || now);
        const diffMins = Math.floor(diffMs / 60000);
        let timeStr = 'Hace un momento';
        if (diffMins > 0 && diffMins < 60) timeStr = `Hace ${diffMins} min`;
        else if (diffMins >= 60) timeStr = `Hace ${Math.floor(diffMins/60)} hrs`;

        const totalItems = sale.items.reduce((acc, item) => acc + item.cantidad, 0);
        
        const card = document.createElement('div');
        // El último ticket es verde (éxito), los anteriores son oscuros
        const bg = index === 0 ? 'linear-gradient(135deg, #2a7d2e, #1b5b40)' : 'linear-gradient(135deg, #3d3b36, #2d2b26)';
        
        card.style.cssText = `
            min-width: 220px; 
            background: ${bg}; 
            color: white; 
            border-radius: 16px; 
            padding: 15px; 
            box-shadow: 0 6px 15px rgba(0,0,0,0.15); 
            position: relative; 
            overflow: hidden;
            flex-shrink: 0;
            border-left: 4px solid #c28a5c;
            transition: transform 0.2s;
        `;

        card.innerHTML = `
            <div style="position: absolute; top: -20px; right: -15px; opacity: 0.05; font-size: 7rem;"><i class="fas fa-shopping-bag"></i></div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <span style="font-size: 0.7rem; font-weight: bold; background: rgba(255,255,255,0.2); padding: 3px 8px; border-radius: 20px;">TICKET</span>
                <span style="font-size: 0.75rem; opacity: 0.8;">${timeStr}</span>
            </div>
            <h2 style="margin: 10px 0; font-size: 1.6rem;">$${sale.total.toFixed(2)}</h2>
            <div style="font-size: 0.85rem; opacity: 0.9; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                <i class="fas fa-cubes"></i> ${totalItems} artículos
            </div>
            <div style="font-size: 0.75rem; color: #ebd8c8; border-top: 1px dashed rgba(255,255,255,0.3); padding-top: 8px;">
                Efectivo: $${(sale.efectivo || 0).toFixed(2)} | Cambio: $${(sale.cambio || 0).toFixed(2)}
            </div>
        `;
        container.appendChild(card);
    });
}

export function showTicket(sale) {
    const bizName = document.getElementById('ticketBizName');
    if (bizName) bizName.innerText = state.businessType.toUpperCase();
    
    const date = document.getElementById('ticketDate');
    if (date) date.innerText = sale.fecha;
    
    const total = document.getElementById('ticketTotal');
    if (total) total.innerText = `$${sale.total.toFixed(2)}`;
    
    const cash = document.getElementById('ticketCash');
    if (cash) cash.innerText = `$${(sale.efectivo || 0).toFixed(2)}`;
    
    const change = document.getElementById('ticketChange');
    if (change) change.innerText = `$${(sale.cambio || 0).toFixed(2)}`;
    
    const list = document.getElementById('ticketItemsList');
    if (list) {
        list.innerHTML = '';
        sale.items.forEach(i => {
            const itemRow = createElement('div', { 
                style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } 
            }, [
                createElement('span', { style: { flex: 1 } }, [`${i.cantidad}x ${escapeHTML(i.nombre)}`]),
                createElement('span', {}, [`$${(i.precio * i.cantidad).toFixed(2)}`])
            ]);
            list.appendChild(itemRow);
        });
    }
    
    document.getElementById('ticketModal').style.display = 'flex';
}

export function printTicket() {
    const content = document.getElementById('ticketContent').innerHTML;
    const win = window.open('', '', 'height=600,width=400');
    win.document.write(`<html><head><title>Ticket</title>
        <style>body{font-family:monospace;padding:20px;} @media print{body{padding:0;}}</style>
        </head><body>${content}</body></html>`);
    win.document.close();
    win.print();
    win.close();
}

