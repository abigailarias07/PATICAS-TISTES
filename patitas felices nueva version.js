/* =========================================
   PEDIDOS (Firestore + Integración PayPal)
========================================= */

import { auth, db } from "./firebase-config.js";
import { carrito, calcularTotales, vaciarCarrito } from "./carrito.js";
import { mostrarNotificacion } from "./notificaciones.js";

import {
    collection,
    doc,
    addDoc,
    getDoc,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";


/* =========================================
   VALIDAR ANTES DE IR A "DATOS DE ENTREGA"
========================================= */

const linkRealizarPedido = document.querySelector(".boton-comprar");

if (linkRealizarPedido) {

    linkRealizarPedido.addEventListener("click", function (event) {

        if (carrito.length === 0) {
            event.preventDefault();
            mostrarNotificacion("Tu carrito está vacío.", "error");
            return;
        }

        if (!auth.currentUser) {
            event.preventDefault();
            mostrarNotificacion("Debes iniciar sesión para realizar un pedido.", "error");

            setTimeout(() => {
                window.location.href = "login.html";
            }, 1400);
        }

    });

}


/* =========================================
   FORMULARIO DE DATOS DE ENTREGA Y PAYPAL
========================================= */

const entregaForm = document.getElementById("entregaForm");

if (entregaForm) {

    const radiosPago = document.querySelectorAll('input[name="metodoPago"]');
    const contenedorPaypal = document.getElementById('paypal-button-container');
    const btnConfirmar = document.getElementById('btnConfirmarPedido');

    // Alternar entre el botón estándar y el botón de PayPal
    radiosPago.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'PayPal') {
                if (contenedorPaypal) contenedorPaypal.style.display = 'block';
                if (btnConfirmar) btnConfirmar.style.display = 'none';
                renderizarBotonPaypal();
            } else {
                if (contenedorPaypal) contenedorPaypal.style.display = 'none';
                if (btnConfirmar) btnConfirmar.style.display = 'inline-block';
            }
        });
    });

    // Envío del formulario tradicional (Yape, Contra Entrega, etc.)
    entregaForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        if (!validarFormularioYUsuario()) return;

        const datosEntrega = obtenerDatosFormulario();
        const botonSubmit = entregaForm.querySelector('button[type="submit"]');
        
        if (botonSubmit) {
            botonSubmit.disabled = true;
            botonSubmit.textContent = "Procesando...";
        }

        try {

            const pedidoId = await confirmarPedido(datosEntrega);
            vaciarCarrito();
            window.location.href = "pedido.html?id=" + pedidoId;

        } catch (error) {

            console.error(error);
            mostrarNotificacion(error.message || "No se pudo procesar el pedido. Intenta nuevamente.", "error");

            if (botonSubmit) {
                botonSubmit.disabled = false;
                botonSubmit.textContent = "Confirmar pedido";
            }

        }

    });

}


/* =========================================
   INTEGRACIÓN DEL BOTÓN DE PAYPAL
========================================= */

function renderizarBotonPaypal() {

    const contenedor = document.getElementById('paypal-button-container');
    if (!contenedor || typeof paypal === 'undefined') return;

    contenedor.innerHTML = ''; // Evitar duplicados

    paypal.Buttons({

        createOrder: function(data, actions) {

            if (!validarFormularioYUsuario()) {
                throw new Error("Validación fallida");
            }

            const totales = calcularTotales();

            return actions.order.create({
                purchase_units: [{
                    amount: {
                        value: totales.total.toFixed(2)
                    }
                }]
            });

        },

        onApprove: async function(data, actions) {

            try {

                const detallesPago = await actions.order.capture();
                const datosEntrega = obtenerDatosFormulario();

                // Adjuntamos la confirmación del pago en el objeto de entrega
                datosEntrega.detallesPayPal = {
                    idTransaccion: detallesPago.id,
                    estado: detallesPago.status,
                    pagador: detallesPago.payer.name.given_name
                };

                const pedidoId = await confirmarPedido(datosEntrega);
                vaciarCarrito();

                mostrarNotificacion(`¡Pago exitoso, ${detallesPago.payer.name.given_name}!`, "exito");
                window.location.href = "pedido.html?id=" + pedidoId;

            } catch (error) {

                console.error("Error al registrar el pedido pagado:", error);
                mostrarNotificacion("El pago se realizó en PayPal, pero hubo un error al guardar tu pedido.", "error");

            }

        },

        onError: function(err) {
            console.error('Error en el proceso de PayPal:', err);
            mostrarNotificacion('Ocurrió un error al procesar el pago con PayPal.', 'error');
        }

    }).render('#paypal-button-container');

}


/* =========================================
   FUNCIONES AUXILIARES
========================================= */

function validarFormularioYUsuario() {

    if (!auth.currentUser) {
        mostrarNotificacion("Debes iniciar sesión para realizar un pedido.", "error");
        setTimeout(() => { window.location.href = "login.html"; }, 1400);
        return false;
    }

    if (carrito.length === 0) {
        mostrarNotificacion("Tu carrito está vacío.", "error");
        return false;
    }

    const form = document.getElementById("entregaForm");
    if (form && !form.checkValidity()) {
        form.reportValidity();
        return false;
    }

    return true;

}

function obtenerDatosFormulario() {

    return {
        nombre: document.getElementById("nombreEntrega").value.trim(),
        telefono: document.getElementById("telefonoEntrega").value.trim(),
        direccion: document.getElementById("direccionEntrega").value.trim(),
        distrito: document.getElementById("distritoEntrega").value,
        referencia: document.getElementById("referenciaEntrega").value.trim(),
        metodoEntrega: document.querySelector('input[name="metodoEntrega"]:checked').value,
        metodoPago: document.querySelector('input[name="metodoPago"]:checked').value
    };

}


/* =========================================
   TRANSACCIÓN: descuenta stock y crea el pedido
========================================= */

async function confirmarPedido(datosEntrega) {

    const totales = calcularTotales();
    const usuario = auth.currentUser;

    await runTransaction(db, async (transaccion) => {

        const lecturas = [];

        for (const item of carrito) {
            const productoRef = doc(db, "productos", String(item.id));
            const productoSnap = await transaccion.get(productoRef);
            lecturas.push({ item, productoRef, productoSnap });
        }

        for (const { item, productoSnap } of lecturas) {
            if (!productoSnap.exists()) {
                throw new Error("El producto '" + item.nombre + "' ya no existe.");
            }

            const stockActual = productoSnap.data().stock || 0;

            if (stockActual < item.cantidad) {
                throw new Error(
                    "Ya no hay suficiente stock de '" + item.nombre + "' " +
                    "(disponible: " + stockActual + ")."
                );
            }
        }

        for (const { item, productoRef, productoSnap } of lecturas) {
            const stockActual = productoSnap.data().stock || 0;
            transaccion.update(productoRef, { stock: stockActual - item.cantidad });
        }

    });

    const pedidoRef = await addDoc(collection(db, "pedidos"), {
        uid: usuario.uid,
        clienteNombre: usuario.displayName || datosEntrega.nombre,
        clienteCorreo: usuario.email,

        items: carrito.map(item => ({
            id: item.id,
            nombre: item.nombre,
            precio: item.precio,
            cantidad: item.cantidad
        })),

        entrega: datosEntrega,

        subtotal: totales.subtotal,
        envio: totales.envio,
        total: totales.total,

        estado: datosEntrega.metodoPago === 'PayPal' ? "pagado" : "pendiente",
        fecha: serverTimestamp()
    });

    return pedidoRef.id;

}


/* =========================================
   MOSTRAR DATOS DEL PEDIDO (pedido.html)
========================================= */

export async function mostrarPedido() {

    const contenedor = document.getElementById("datosPedido");

    if (!contenedor) return;

    const parametros = new URLSearchParams(window.location.search);
    const pedidoId = parametros.get("id");

    if (!pedidoId) {
        contenedor.innerHTML = "<p>No se encontró información del pedido.</p>";
        return;
    }

    try {

        const pedidoSnap = await getDoc(doc(db, "pedidos", pedidoId));

        if (!pedidoSnap.exists()) {
            contenedor.innerHTML = "<p>No se encontró este pedido.</p>";
            return;
        }

        const pedido = pedidoSnap.data();

        const fecha = pedido.fecha
            ? pedido.fecha.toDate().toLocaleString()
            : "—";

        const itemsHtml = pedido.items.map(item =>
            `<p>${item.cantidad} × ${item.nombre} — S/ ${(item.precio * item.cantidad).toFixed(2)}</p>`
        ).join("");

        contenedor.innerHTML = `
            <p><strong>N° de pedido:</strong> ${pedidoId}</p>
            <p><strong>Cliente:</strong> ${pedido.clienteNombre}</p>
            <p><strong>Correo:</strong> ${pedido.clienteCorreo}</p>
            <p><strong>Fecha:</strong> ${fecha}</p>

            <hr style="margin: 12px 0;">

            ${itemsHtml}

            <hr style="margin: 12px 0;">

            <p><strong>Entrega:</strong> ${pedido.entrega.metodoEntrega} — ${pedido.entrega.distrito}</p>
            <p><strong>Pago:</strong> ${pedido.entrega.metodoPago}</p>
            <p><strong>Estado:</strong> ${pedido.estado}</p>
            <p><strong>Total:</strong> S/ ${pedido.total.toFixed(2)}</p>
        `;

    } catch (error) {

        console.error(error);
        contenedor.innerHTML = "<p>No se pudo cargar el pedido.</p>";

    }

}