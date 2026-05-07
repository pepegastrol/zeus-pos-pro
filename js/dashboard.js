/**
 * ZEUS Dashboard - Analítica y Finanzas (ES6 Module)
 */

import { state, createElement, showNotification } from './store.js';
import { putItem, refreshStore, escapeHTML, getRecentLogs, addLog } from './db.js';

let charts = {};
let currentHistPage = 1;
const histItemsPerPage = 10;

/**
 * Inicializa el dashboard.
 */
export async function initDashboard() {
    const period = document.getElementById('historyPeriodFilter')?.value || 'all';
    const filteredData = filterDataByPeriod(state.sales, state.mermas, period);

    renderFinancialSummary(filteredData.sales, filteredData.mermas);
    renderCharts(filteredData.sales, state.products);
    renderDashboardHistory(filteredData.sales, filteredData.mermas);
    renderSmartAlerts(state.products);
    updateMermaSelect(state.products);
    renderAuditLogs();
}

/**
 * Filtra ventas y mermas.
 */
function filterDataByPeriod(sales, mermas, period) {
    if (period === 'all') return { sales, mermas };

    const now = new Date();
    let minTs = 0;

    if (period === 'today') {
        minTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else if (period === 'week') {
        minTs = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
        minTs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    }

    return {
        sales: sales.filter(s => (s.timestamp || 0) >= minTs),
        mermas: mermas.filter(m => new Date(m.fecha).getTime() >= minTs)
    };
}

export function changeHistPage(dir) {
    currentHistPage += dir;
    if (currentHistPage < 1) currentHistPage = 1;
    initDashboard();
}

/**
 * Muestra los KPIs principales.
 */
function renderFinancialSummary(sales, mermas) {
    const totalSales = sales.reduce((acc, s) => acc + s.total, 0);
    const totalMermas = mermas.reduce((acc, m) => acc + (m.valor || 0), 0);
    const netEarnings = totalSales - totalMermas;

    const now = new Date();
    const todayTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayTs = todayTs - (24 * 60 * 60 * 1000);

    const salesToday = sales.filter(s => (s.timestamp || 0) >= todayTs).reduce((acc, s) => acc + s.total, 0);
    const salesYesterday = sales.filter(s => (s.timestamp || 0) >= yesterdayTs && (s.timestamp || 0) < todayTs).reduce((acc, s) => acc + s.total, 0);

    let trendHtml = "";
    if (salesYesterday > 0) {
        const diff = ((salesToday - salesYesterday) / salesYesterday) * 100;
        const color = diff >= 0 ? "#a8e6cf" : "#ffcccc"; // Colores pastel para fondo oscuro
        const icon = diff >= 0 ? "fa-arrow-up" : "fa-arrow-down";
        trendHtml = `<span style="color:${color}; font-size:0.8rem; margin-left:10px; font-weight: normal;"><i class="fas ${icon}"></i> ${Math.abs(diff).toFixed(1)}% vs ayer</span>`;
    }

    document.getElementById('totalSalesValue').innerHTML = `$${totalSales.toFixed(2)} ${trendHtml}`;
    document.getElementById('totalMermasValue').innerText = `$${totalMermas.toFixed(2)}`;
    document.getElementById('netEarningsValue').innerText = `$${netEarnings.toFixed(2)}`;
}

/**
 * Renderiza las gráficas.
 */
function renderCharts(sales, products) {
    const trendCtx = document.getElementById('salesTrendChart')?.getContext('2d');
    if (trendCtx) {
        const last7Days = Array.from({length: 7}, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        });

        const dailyData = Array(7).fill(0);
        const today = new Date();
        today.setHours(0,0,0,0);

        sales.forEach(s => {
            const sDate = s.timestamp ? new Date(s.timestamp) : new Date();
            sDate.setHours(0,0,0,0);
            const diff = Math.floor((today - sDate) / (1000 * 60 * 60 * 24));
            if (diff >= 0 && diff < 7) dailyData[6 - diff] += s.total;
        });

        if (charts.trend) charts.trend.destroy();
        charts.trend = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: last7Days,
                datasets: [{
                    label: 'Ventas ($)',
                    data: dailyData,
                    borderColor: '#c28a5c',
                    backgroundColor: 'rgba(194, 138, 92, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    const paretoCtx = document.getElementById('paretoProductsChart')?.getContext('2d');
    if (paretoCtx) {
        const productRank = {};
        sales.forEach(s => {
            s.items.forEach(item => {
                productRank[item.nombre] = (productRank[item.nombre] || 0) + (item.precio * item.cantidad);
            });
        });

        // Convertir a array, ordenar y tomar top 10
        const sortedProducts = Object.entries(productRank)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        if (charts.pareto) charts.pareto.destroy();
        charts.pareto = new Chart(paretoCtx, {
            type: 'bar',
            data: {
                labels: sortedProducts.map(p => p[0]),
                datasets: [{
                    label: 'Ingresos Totales ($)',
                    data: sortedProducts.map(p => p[1]),
                    backgroundColor: '#c28a5c',
                    borderRadius: 8
                }]
            },
            options: {
                indexAxis: 'y', // Barra horizontal
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { beginAtZero: true }
                }
            }
        });
    }

    const pieCtx = document.getElementById('categoryPieChart')?.getContext('2d');
    if (pieCtx) {
        const catSales = {};
        sales.forEach(s => {
            s.items.forEach(item => {
                const p = products.find(prod => prod.nombre === item.nombre);
                const cat = p ? p.categoria : 'Otros';
                catSales[cat] = (catSales[cat] || 0) + (item.precio * item.cantidad);
            });
        });

        if (charts.pie) charts.pie.destroy();
        charts.pie = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(catSales),
                datasets: [{
                    data: Object.values(catSales),
                    backgroundColor: ['#e2b48c', '#c28a5c', '#8c7a6b', '#f2cfc0', '#a48c76']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

/**
 * Renderiza el historial (Optimizado).
 */
function renderDashboardHistory(sales, mermas) {
    const history = [];
    sales.forEach(s => history.push({ 
        fecha: s.fecha, 
        tipo: 'Venta', 
        monto: s.total, 
        ts: s.timestamp || 0,
        color: '#6c9a63'
    }));
    mermas.forEach(m => history.push({ 
        fecha: new Date(m.fecha).toLocaleString(), 
        tipo: 'Merma', 
        monto: -m.valor, 
        ts: new Date(m.fecha).getTime(),
        color: '#c2470f'
    }));

    history.sort((a, b) => b.ts - a.ts);

    const totalPages = Math.ceil(history.length / histItemsPerPage) || 1;
    if (currentHistPage > totalPages) currentHistPage = totalPages;
    
    const start = (currentHistPage - 1) * histItemsPerPage;
    const paginatedHistory = history.slice(start, start + histItemsPerPage);

    const pageDisplay = document.getElementById('histPageDisplay');
    if (pageDisplay) pageDisplay.innerText = `${currentHistPage} / ${totalPages}`;
    
    const prevBtn = document.getElementById('histPrevBtn');
    if (prevBtn) prevBtn.disabled = currentHistPage === 1;
    
    const nextBtn = document.getElementById('histNextBtn');
    if (nextBtn) nextBtn.disabled = currentHistPage >= totalPages;

    const tbody = document.getElementById('dashboardHistoryList');
    if (tbody) {
        tbody.innerHTML = '';
        paginatedHistory.forEach(h => {
            const row = createElement('tr', {}, [
                createElement('td', {}, [h.fecha.split(',')[0]]),
                createElement('td', { style: { color: h.color, fontWeight: 'bold' } }, [escapeHTML(h.tipo)]),
                createElement('td', { style: { fontWeight: 'bold' } }, [`$${Math.abs(h.monto).toFixed(2)}`])
            ]);
            tbody.appendChild(row);
        });
    }
}

/**
 * Alertas Inteligentes (Stock Crítico y Caducidad).
 */
function renderSmartAlerts(products) {
    const container = document.getElementById('stockAlertContainer');
    const list = document.getElementById('lowStockList');
    if (!container || !list) return;

    list.innerHTML = '';
    let alertCount = 0;
    
    const hoy = new Date();
    hoy.setHours(0,0,0,0);

    products.forEach(p => {
        // Alerta de Stock
        if (p.stock <= 5) {
            alertCount++;
            const alert = createElement('div', { className: 'stock-alert-chip' }, [
                createElement('strong', { style: { color: '#2d2b26' } }, [escapeHTML(p.nombre)]),
                createElement('span', { style: { color: '#aa4e2c', fontWeight: 'bold', marginLeft: '10px' } }, [`Stock Bajo: ${p.stock}`])
            ]);
            list.appendChild(alert);
        }

        // Alerta de Caducidad
        if (p.fechaCaducidad) {
            const fechaCad = new Date(p.fechaCaducidad + 'T00:00:00');
            const diffDias = Math.ceil((fechaCad - hoy) / (1000 * 60 * 60 * 24));
            
            if (diffDias < 0) {
                alertCount++;
                const alert = createElement('div', { className: 'stock-alert-chip', style: { background: '#f8d7da', border: '1px solid #f5c6cb' } }, [
                    createElement('strong', { style: { color: '#721c24' } }, [escapeHTML(p.nombre)]),
                    createElement('span', { style: { color: '#721c24', fontWeight: 'bold', marginLeft: '10px' } }, [`¡CADUCADO!`])
                ]);
                list.appendChild(alert);
            } else if (diffDias <= 7) {
                alertCount++;
                const alert = createElement('div', { className: 'stock-alert-chip', style: { background: '#fff3cd', border: '1px solid #ffeeba' } }, [
                    createElement('strong', { style: { color: '#856404' } }, [escapeHTML(p.nombre)]),
                    createElement('span', { style: { color: '#856404', fontWeight: 'bold', marginLeft: '10px' } }, [`Caduca en ${diffDias}d`])
                ]);
                list.appendChild(alert);
            }
        }
    });

    if (alertCount === 0) {
        container.style.display = 'none';
    } else {
        container.style.display = 'block';
        // Cambiar título dinámicamente si hay alertas
        container.querySelector('h3').innerHTML = '<i class="fas fa-exclamation-triangle"></i> ¡Atención! Alertas Críticas (' + alertCount + ')';
    }
}

function updateMermaSelect(products) {
    const select = document.getElementById('mermaProductSelect');
    if (select) {
        select.innerHTML = products.map(p => `<option value="${p.id}" data-tipo="${p.tipoVenta || 'unidad'}">${escapeHTML(p.nombre)} (Stock: ${p.stock})</option>`).join('');
        
        // Update placeholder dynamically based on product type
        select.addEventListener('change', () => {
            const qtyInput = document.getElementById('mermaQty');
            const selectedOption = select.options[select.selectedIndex];
            if (!qtyInput || !selectedOption) return;
            
            const tipo = selectedOption.getAttribute('data-tipo');
            if (tipo === 'granel') {
                qtyInput.placeholder = "Ej. 1.500 (kg/L)";
            } else {
                qtyInput.placeholder = "Ej. 1 (pieza)";
            }
        });
        
        // Trigger initial change
        setTimeout(() => select.dispatchEvent(new Event('change')), 100);
    }
}

/**
 * Registra merma.
 */
export async function handleRegisterMerma() {
    const prodId = parseInt(document.getElementById('mermaProductSelect').value);
    const qty = parseFloat(document.getElementById('mermaQty').value);

    if (!prodId || isNaN(qty) || qty <= 0) {
        showNotification("Error", "Ingresa una cantidad válida", true);
        return;
    }

    try {
        const product = state.products.find(p => p.id === prodId);

        if (!product || product.stock < qty) {
            showNotification("Error", "No hay suficiente stock", true);
            return;
        }

        product.stock -= qty;
        await putItem("inventario", product);

        const mermaRecord = {
            productId: prodId,
            quantity: qty,
            valor: product.precio * qty,
            fecha: new Date().toISOString()
        };
        await putItem("mermas", mermaRecord);

        document.getElementById('mermaQty').value = '';
        showNotification("Merma Registrada", `Se descontaron ${qty} unidades de ${product.nombre}`);
        
        await refreshStore();
        initDashboard();

    } catch (err) {
        showNotification("Error", "No se pudo registrar la merma", true);
    }
}

export async function generateAccountingReport() {
    const period = document.getElementById('reportPeriodSelect')?.value || 'all';
    
    const { getAll, getConfig } = await import('./db.js');
    const allDeepSales = await getAll("ventas");
    const allDeepMermas = await getAll("mermas");
    const allProducts = await getAll("inventario");
    const bizName = await getConfig("businessName") || "ZEUS POS";
    
    const filtered = filterDataByPeriod(allDeepSales, allDeepMermas, period);
    
    let totalIncome = 0;
    let totalCash = 0;
    let totalChange = 0;
    let totalMermaCost = 0;
    
    filtered.sales.forEach(s => {
        totalIncome += s.total;
        totalCash += s.efectivo;
        totalChange += s.cambio;
    });
    
    filtered.mermas.forEach(m => {
        totalMermaCost += (m.valor || 0);
    });

    const netProfit = totalIncome - totalMermaCost;
    const currentInventoryValue = allProducts.reduce((acc, p) => acc + (p.precio * p.stock), 0);

    const periodLabel = {
        'today': 'DEL DÍA DE HOY',
        'week': 'DE ESTA SEMANA',
        'month': 'DE ESTE MES',
        'year': 'DEL AÑO EN CURSO',
        'all': 'HISTÓRICO COMPLETO'
    }[period];

    const todayDate = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

    const html = `
        <html>
        <head>
            <title>Reporte Contable - ${bizName}</title>
            <style>
                body { font-family: 'Times New Roman', Times, serif; padding: 40px; color: #000; }
                h1, h2, h3 { text-align: center; margin: 5px 0; font-weight: bold; }
                h1 { font-size: 24px; text-transform: uppercase; }
                h2 { font-size: 16px; text-transform: uppercase; letter-spacing: 1px; color: #333; }
                p.subtitle { text-align: center; font-style: italic; font-size: 13px; margin-bottom: 30px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
                th, td { padding: 8px 12px; border-bottom: 1px solid #ccc; }
                th { background-color: #1b5b40; color: white; text-align: right; font-weight: bold; }
                th.left { text-align: left; }
                .section-header { background-color: #d1dfd8; font-weight: bold; text-transform: uppercase; color: #1b5b40; }
                .total-row { font-weight: bold; border-top: 2px solid #000; border-bottom: 4px double #000; background-color: #f4f4f4; }
                .indent { padding-left: 30px; }
                .money { text-align: right; }
                @media print {
                    body { padding: 0; }
                }
            </style>
        </head>
        <body>
            <h1>${bizName}</h1>
            <h2>ESTADO DE RESULTADOS CONSOLIDADO</h2>
            <p class="subtitle">(Expresado en moneda local. Reporte generado el ${todayDate} - Período: ${periodLabel})</p>
            
            <table>
                <thead>
                    <tr>
                        <th class="left">CONCEPTO CONTABLE</th>
                        <th>MONTO</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="section-header"><td colspan="2">INGRESOS Y FLUJO DE EFECTIVO</td></tr>
                    <tr>
                        <td class="indent">Ventas Brutas Totales</td>
                        <td class="money">$ ${totalIncome.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td class="indent">Efectivo Físico Recibido en Caja</td>
                        <td class="money">$ ${totalCash.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td class="indent">Cambio Entregado a Clientes</td>
                        <td class="money">$ ${totalChange.toFixed(2)}</td>
                    </tr>
                    
                    <tr class="section-header"><td colspan="2">COSTOS Y PÉRDIDAS</td></tr>
                    <tr>
                        <td class="indent">Pérdida Asumida por Mermas (Stock Dañado)</td>
                        <td class="money">$ ${totalMermaCost.toFixed(2)}</td>
                    </tr>
                    
                    <tr class="total-row">
                        <td>UTILIDAD NETA OPERATIVA</td>
                        <td class="money">$ ${netProfit.toFixed(2)}</td>
                    </tr>

                    <tr><td colspan="2" style="border:none;">&nbsp;</td></tr>

                    <tr class="section-header"><td colspan="2">ACTIVOS (BALANCE)</td></tr>
                    <tr>
                        <td class="indent">Inventario Total Valorizado (A Precio de Venta)</td>
                        <td class="money">$ ${currentInventoryValue.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
            
            <div style="margin-top: 70px; text-align: center;">
                <p>___________________________________________________</p>
                <p style="font-size:12px; font-weight:bold;">Firma de Auditoría / Gerencia</p>
            </div>
        </body>
        </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showNotification("Error", "Tu navegador bloqueó la ventana emergente. Por favor permite los pop-ups.", true);
        return;
    }
    
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
        printWindow.print();
    }, 500);

    const modal = document.getElementById('reportModal');
    if (modal) modal.style.display = 'none';
}

/**
 * Renderiza la bitácora de auditoría.
 */
async function renderAuditLogs() {
    const logs = await getRecentLogs(15);
    const tbody = document.getElementById('auditLogsList');
    if (!tbody) return;

    tbody.innerHTML = '';
    
    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#a48c76; padding: 20px;">Sin actividad reciente. Las acciones críticas aparecerán aquí.</td></tr>';
        return;
    }

    logs.forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        // Formatear detalles
        let detallesStr = "";
        if (log.detalles?.cambios) {
            detallesStr = log.detalles.cambios.join(', ');
        } else if (log.tipo === 'VENTA') {
            detallesStr = `Venta #${log.detalles?.id || ''} de ${log.detalles?.items || 0} items`;
        } else if (log.tipo === 'SISTEMA') {
            detallesStr = `Motivo: ${log.detalles?.disponible === 0 ? 'Sin stock' : 'Stock insuficiente'}`;
        }

        const row = createElement('tr', {}, [
            createElement('td', { style: { color: '#a48c76' } }, [time]),
            createElement('td', {}, [
                createElement('span', { 
                    className: 'badge-stock-low', 
                    style: { 
                        backgroundColor: log.tipo === 'VENTA' ? '#eef6ee' : (log.tipo === 'SISTEMA' ? '#fff5f2' : '#f9f5f0'),
                        color: log.tipo === 'VENTA' ? '#2a7d2e' : (log.tipo === 'SISTEMA' ? '#c2470f' : '#a48c76'),
                        border: 'none',
                        fontSize: '0.7rem'
                    } 
                }, [log.tipo])
            ]),
            createElement('td', { style: { fontWeight: '500' } }, [log.descripcion]),
            createElement('td', { style: { fontSize: '0.75rem', color: '#8c7a6b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [detallesStr])
        ]);
        tbody.appendChild(row);
    });
}

/**
 * LÓGICA DE CORTE DE CAJA
 */
let expectedCashToday = 0;

export async function openCorteHandler() {
    const now = new Date();
    const todayTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    // Solo ventas de hoy
    const todaySales = state.sales.filter(s => (s.timestamp || 0) >= todayTs);
    expectedCashToday = todaySales.reduce((acc, s) => acc + s.total, 0);
    
    document.getElementById('corteExpectedCash').innerText = `$${expectedCashToday.toFixed(2)}`;
    document.getElementById('corteTransCount').innerText = todaySales.length;
    document.getElementById('cortePhysicalCash').value = '';
    document.getElementById('corteResultArea').style.display = 'none';
    
    document.getElementById('corteModal').style.display = 'flex';
}

export function updateCorteDiffUI() {
    const physical = parseFloat(document.getElementById('cortePhysicalCash').value) || 0;
    const diff = physical - expectedCashToday;
    const resultArea = document.getElementById('corteResultArea');
    const diffValue = document.getElementById('corteDiffValue');
    
    resultArea.style.display = 'block';
    diffValue.innerText = `$${Math.abs(diff).toFixed(2)}`;
    
    if (diff === 0) {
        resultArea.style.background = '#eef6ee';
        diffValue.style.color = '#2a7d2e';
        document.getElementById('corteDiffLabel').innerText = "Balance Perfecto:";
    } else if (diff > 0) {
        resultArea.style.background = '#eef3f9';
        diffValue.style.color = '#2a5d9a';
        document.getElementById('corteDiffLabel').innerText = "Sobrante:";
    } else {
        resultArea.style.background = '#fff5f2';
        diffValue.style.color = '#c2470f';
        document.getElementById('corteDiffLabel').innerText = "Faltante:";
    }
}

export async function handleSaveCorte() {
    const physical = parseFloat(document.getElementById('cortePhysicalCash').value);
    if (isNaN(physical)) {
        showNotification("Error", "Ingresa el efectivo físico contado", true);
        return;
    }

    const diff = physical - expectedCashToday;
    const corteRecord = {
        fecha: new Date().toISOString(),
        esperado: expectedCashToday,
        real: physical,
        diferencia: diff,
        transacciones: parseInt(document.getElementById('corteTransCount').innerText)
    };

    try {
        await putItem("cortes", corteRecord);
        await addLog("SISTEMA", `Corte de Caja realizado: ${diff === 0 ? 'Balanceado' : (diff > 0 ? 'Sobrante' : 'Faltante')}`, { 
            diferencia: diff, 
            esperado: expectedCashToday, 
            real: physical 
        });

        showNotification("Corte Guardado", "El cierre de caja se registró con éxito.");
        document.getElementById('corteModal').style.display = 'none';
        initDashboard(); // Refrescar logs
    } catch (err) {
        showNotification("Error", "No se pudo guardar el corte", true);
    }
}

