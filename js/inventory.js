/**
 * ZEUS Inventory - Gestión de Productos e Importación (ES6 Module)
 */

import { state, createElement, showNotification } from './store.js';
import { putItem, putMany, deleteItem, clearStore, refreshStore, debounce, escapeHTML, showCustomPrompt, addLog } from './db.js';

let currentInvPage = 1;
const invItemsPerPage = 10;
let invSearchTerm = '';
let invCategoryFilter = 'Todas';

/**
 * Inicializa el inventario.
 */
export async function initInventory() {
    renderInventoryTable();
    renderCategoriesUI();
}

/**
 * Renderiza la tabla de inventario con paginación y filtros (Optimizado).
 */
export function renderInventoryTable() {
    const tbody = document.getElementById('inventoryTbody');
    if (!tbody) return;
    
    tbody.innerHTML = ''; // Limpiamos una vez al inicio

    // Filtros
    let filtered = state.products.filter(p => {
        const matchesSearch = p.nombre.toLowerCase().includes(invSearchTerm) || p.id.toString() === invSearchTerm;
        const matchesCat = invCategoryFilter === 'Todas' || p.categoria === invCategoryFilter;
        return matchesSearch && matchesCat;
    });

    // Ordenamiento
    filtered.sort((a, b) => {
        const catA = a.categoria || 'General';
        const catB = b.categoria || 'General';
        if (catA < catB) return -1;
        if (catA > catB) return 1;
        return a.nombre.localeCompare(b.nombre);
    });

    // Paginación
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / invItemsPerPage) || 1;
    if (currentInvPage > totalPages) currentInvPage = totalPages;

    const startIdx = (currentInvPage - 1) * invItemsPerPage;
    const paginated = filtered.slice(startIdx, startIdx + invItemsPerPage);

    let currentCat = null;

    paginated.forEach(p => {
        // Separador de categoría
        if (invCategoryFilter === 'Todas') {
            const cat = p.categoria || "General";
            if (cat !== currentCat) {
                const sepRow = createElement('tr', { style: { backgroundColor: '#fffbf7' } }, [
                    createElement('td', { colSpan: 7 }, [
                        createElement('span', { 
                            style: { fontWeight: 'bold', color: '#c28a5c', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' } 
                        }, [
                            createElement('i', { className: 'fas fa-tags', style: { marginRight: '8px' } }),
                            cat
                        ])
                    ])
                ]);
                tbody.appendChild(sepRow);
                currentCat = cat;
            }
        }

        const unitStr = p.tipoVenta === 'granel' ? 'kg/L' : 'pz';
        const isLow = p.stock <= 5;

        let expBadge = null;
        if (p.fechaCaducidad) {
            const hoy = new Date();
            hoy.setHours(0,0,0,0);
            const fechaCad = new Date(p.fechaCaducidad + 'T00:00:00');
            const diffDias = Math.ceil((fechaCad - hoy) / (1000 * 60 * 60 * 24));
            
            if (diffDias < 0) {
                expBadge = createElement('span', { style: { background: '#c2470f', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', marginLeft: '5px', fontWeight: 'bold' } }, ['☠️ Caducado']);
            } else if (diffDias <= 7) {
                expBadge = createElement('span', { style: { background: '#e6a23c', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', marginLeft: '5px', fontWeight: 'bold' } }, [`⚠️ Caduca en ${diffDias}d`]);
            } else {
                expBadge = createElement('span', { style: { background: '#e1f5e3', color: '#2a7d2e', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', marginLeft: '5px', fontWeight: 'bold' } }, ['📅 Válido']);
            }
        }

        const nameCellChildren = [createElement('strong', { style: { color: '#4a3b2c' } }, [escapeHTML(p.nombre)])];
        if (expBadge) nameCellChildren.push(expBadge);

        const row = createElement('tr', {}, [
            createElement('td', {}, [createElement('span', { style: { color: '#a48c76', fontSize: '0.9rem' } }, [`#${p.id}`])]),
            createElement('td', {}, nameCellChildren),
            createElement('td', {}, [
                createElement('span', { className: 'category-badge-small' }, [escapeHTML(p.categoria || "General")])
            ]),
            createElement('td', {}, [createElement('strong', { style: { color: '#2a7d2e' } }, [`$${Number(p.precio).toFixed(2)}`])]),
            createElement('td', {}, [
                createElement('strong', {}, [p.stock]),
                createElement('span', { style: { fontSize: '0.85rem', color: '#8c7a6b', marginLeft: '4px' } }, [unitStr])
            ]),
            createElement('td', {}, [
                isLow 
                    ? createElement('span', { className: 'badge-stock-low' }, ['⚠️ Bajo'])
                    : createElement('span', { style: { color: '#2a7d2e', fontSize: '0.85rem', fontWeight: 'bold' } }, ['✓ Ok'])
            ]),
            createElement('td', {}, [
                createElement('button', { className: 'btn-soft', title: 'Editar', onclick: () => openProductModal(p.id) }, ['✏️']),
                createElement('button', { className: 'btn-soft btn-danger', title: 'Eliminar', style: { marginLeft: '5px' }, onclick: () => deleteProductHandler(p.id) }, ['🗑️'])
            ])
        ]);

        tbody.appendChild(row);
    });

    // Actualizar UI de paginación
    updatePaginationUI('inv', currentInvPage, totalPages, totalItems, startIdx);
}

function updatePaginationUI(prefix, current, total, count, start) {
    const pageInfo = document.getElementById(`${prefix}PageInfo`);
    if (pageInfo) {
        pageInfo.innerText = count === 0 ? "Sin resultados" : `Mostrando ${start + 1}-${Math.min(start + invItemsPerPage, count)} de ${count}`;
    }
    const pageDisplay = document.getElementById(`${prefix}PageDisplay`);
    if (pageDisplay) pageDisplay.innerText = `${current} / ${total}`;
    
    const prevBtn = document.getElementById(`${prefix}PrevBtn`);
    if (prevBtn) prevBtn.disabled = current === 1;
    
    const nextBtn = document.getElementById(`${prefix}NextBtn`);
    if (nextBtn) nextBtn.disabled = current >= total;
}

/**
 * Abre el modal para crear o editar producto.
 */
export function openProductModal(productId = null) {
    const product = productId ? state.products.find(p => p.id === productId) : null;
    
    document.getElementById('modalTitle').innerText = product ? "Editar Producto" : "Nuevo Producto";
    document.getElementById('editId').value = product?.id || '';
    document.getElementById('prodName').value = product?.nombre || '';
    document.getElementById('prodPrice').value = product?.precio || '';
    document.getElementById('prodStock').value = product?.stock || '';
    document.getElementById('prodCaducidad').value = product?.fechaCaducidad || '';
    document.getElementById('prodTypeSelect').value = product?.tipoVenta || 'unidad';
    
    const catSelect = document.getElementById('prodCategorySelect');
    if (catSelect) {
        catSelect.innerHTML = state.categories.map(c => `<option value="${c}" ${product?.categoria === c ? 'selected' : ''}>${c}</option>`).join('');
    }
    
    document.getElementById('productModal').style.display = 'flex';
}

/**
 * Guarda el producto.
 */
export async function saveProductFromModal() {
    const id = document.getElementById('editId').value;
    const nombre = document.getElementById('prodName').value.trim();
    const categoria = document.getElementById('prodCategorySelect').value;
    const tipoVenta = document.getElementById('prodTypeSelect').value;
    const precio = parseFloat(document.getElementById('prodPrice').value) || 0;
    const stock = parseFloat(document.getElementById('prodStock').value) || 0;
    const fechaCaducidad = document.getElementById('prodCaducidad').value;

    if (!nombre) {
        showNotification("Error", "El nombre es obligatorio", true);
        return;
    }

    const product = { nombre, categoria, tipoVenta, precio, stock, fechaCaducidad };
    if (id) product.id = parseInt(id);

    try {
        const oldProduct = id ? state.products.find(p => p.id === parseInt(id)) : null;
        await putItem("inventario", product);
        
        // Registro de Auditoría
        if (oldProduct) {
            let cambios = [];
            if (oldProduct.precio !== product.precio) cambios.push(`Precio: $${oldProduct.precio} -> $${product.precio}`);
            if (oldProduct.stock !== product.stock) cambios.push(`Stock: ${oldProduct.stock} -> ${product.stock}`);
            if (oldProduct.nombre !== product.nombre) cambios.push(`Nombre: ${oldProduct.nombre} -> ${product.nombre}`);
            
            if (cambios.length > 0) {
                await addLog("INVENTARIO", `Edición de producto: ${product.nombre}`, { cambios, id: product.id });
            }
        } else {
            await addLog("INVENTARIO", `Nuevo producto creado: ${product.nombre}`, { product });
        }

        document.getElementById('productModal').style.display = 'none';
        showNotification("Éxito", "Producto guardado correctamente");
        await refreshStore();
        renderInventoryTable();
    } catch (err) {
        showNotification("Error", "No se pudo guardar el producto", true);
    }
}

/**
 * Elimina producto.
 */
export async function deleteProductHandler(id) {
    if (confirm("¿Estás seguro de eliminar este producto?")) {
        const product = state.products.find(p => p.id === id);
        await deleteItem("inventario", id);
        await addLog("INVENTARIO", `Producto eliminado: ${product?.nombre || id}`, { product });
        showNotification("Eliminado", "Producto removido del inventario");
        await refreshStore();
        renderInventoryTable();
    }
}

export function renderCategoriesUI() {
    const container = document.getElementById('categoriesChipList');
    if (container) {
        container.innerHTML = '';
        state.categories.forEach(c => {
            container.appendChild(createElement('span', { className: 'category-chip' }, [c]));
        });
    }
}

// Búsqueda
document.getElementById('invSearch')?.addEventListener('input', debounce((e) => {
    invSearchTerm = e.target.value.toLowerCase().trim();
    currentInvPage = 1;
    renderInventoryTable();
}, 300));

export function changeInvPage(dir) {
    currentInvPage += dir;
    if (currentInvPage < 1) currentInvPage = 1;
    renderInventoryTable();
}

/**
 * Importación Excel.
 */
document.getElementById('excelFileInput')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(evt) {
        try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            if (jsonData.length === 0) {
                showNotification("Error", "El archivo está vacío", true);
                return;
            }

            const productsToSave = jsonData.map(row => {
                const keys = Object.keys(row);
                const findVal = (keywords, exclude = []) => {
                    const key = keys.find(k => {
                        const lowK = k.toLowerCase();
                        const matches = keywords.some(kw => lowK.includes(kw.toLowerCase()));
                        const isExcluded = exclude.some(ex => lowK.includes(ex.toLowerCase()));
                        return matches && !isExcluded;
                    });
                    return key ? row[key] : null;
                };

                const nombre = findVal(['descripción', 'nombre', 'producto'], ['id', 'código']);
                const precio = parseFloat(findVal(['precio unitario', 'precio', 'venta']) || 0);
                const stock = parseFloat(findVal(['cantidad en stock', 'stock', 'existencia', 'cantidad']) || 0);
                const categoria = findVal(['categoría', 'grupo', 'tipo']) || "General";
                const unidad = findVal(['unidad', 'medida']) || 'pz';

                return {
                    nombre: String(nombre || Object.values(row)[0]).trim(),
                    precio: isNaN(precio) ? 0 : precio,
                    stock: isNaN(stock) ? 0 : stock,
                    categoria: String(categoria).trim(),
                    tipoVenta: String(unidad).toLowerCase().includes('kg') ? 'granel' : 'unidad'
                };
            });

            await putMany("inventario", productsToSave);
            await addLog("INVENTARIO", `Importación masiva: ${productsToSave.length} productos`, { count: productsToSave.length });
            showNotification("Éxito", `Se importaron ${productsToSave.length} productos`);
            await refreshStore();
            renderInventoryTable();
            e.target.value = '';

        } catch (err) {
            showNotification("Error", "No se pudo procesar el Excel", true);
        }
    };
    reader.readAsArrayBuffer(file);
});

export async function exportBackup() {
    const backup = {
        inventario: state.products,
        ventas: state.sales,
        mermas: state.mermas,
        configuracion: await getAll("configuracion"),
        version: "2.0",
        date: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ZeusPOS_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification("Respaldo", "Archivo de respaldo generado");
}

export async function clearInventoryHandler() {
    if (confirm("⚠️ ¿ESTÁS SEGURO?")) {
        const pass = await showCustomPrompt("Confirmación Requerida", "Para confirmar, escribe: BORRAR");
        if (pass === "BORRAR") {
            await clearStore("inventario");
            showNotification("Inventario Vaciado", "Se han eliminado todos los productos.");
            await refreshStore();
            renderInventoryTable();
        }
    }
}

