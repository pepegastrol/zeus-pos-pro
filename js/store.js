/**
 * ZEUS Store - Centralized State Management (ES6 Module)
 */

export const state = {
    products: [],
    sales: [],
    categories: [],
    mermas: [],
    cart: [],
    businessType: "Zeus POS",
    config: {},
    currentPage: 1
};

// Observers for state changes (simple pub/sub)
export const listeners = [];

export function subscribe(fn) {
    listeners.push(fn);
}

export function notify() {
    listeners.forEach(fn => fn(state));
}

export function updateState(newState) {
    Object.assign(state, newState);
    notify();
}

/**
 * Notificaciones Globales.
 */
export function showNotification(title, message, isError = false) {
    const modal = document.getElementById('notificationModal');
    if (!modal) return;
    document.getElementById('notificationTitle').innerText = title;
    document.getElementById('notificationMessage').innerText = message;
    const icon = document.getElementById('notificationIcon');
    icon.innerHTML = isError 
        ? '<i class="fas fa-times-circle" style="color: #c2470f;"></i>' 
        : '<i class="fas fa-check-circle" style="color: #6c9a63;"></i>';
    modal.style.display = 'flex';
}

/**
 * Global UI Helper: Efficient DOM Creator
 */
export function createElement(tag, props = {}, children = []) {
    const element = document.createElement(tag);
    
    Object.entries(props).forEach(([key, value]) => {
        if (key === 'style' && typeof value === 'object') {
            Object.assign(element.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
            const eventName = key.toLowerCase().substring(2);
            element.addEventListener(eventName, value);
        } else if (key === 'className') {
            element.className = value;
        } else if (key === 'dataset' && typeof value === 'object') {
            Object.assign(element.dataset, value);
        } else {
            element.setAttribute(key, value);
        }
    });

    children.forEach(child => {
        if (typeof child === 'string' || typeof child === 'number') {
            element.appendChild(document.createTextNode(child));
        } else if (child instanceof HTMLElement) {
            element.appendChild(child);
        }
    });

    return element;
}
