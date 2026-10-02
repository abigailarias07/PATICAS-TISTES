export let productosGlobales = [];

// Cargar productos desde la API de Express (Node.js)
export async function cargarProductos() {
  try {
    const respuesta = await fetch('/api/productos');
    productosGlobales = await respuesta.json();
    mostrarProductos('todos');
  } catch (error) {
    console.error('Error al cargar productos desde la API:', error);
  }
}

// Función para mostrar y filtrar productos en la página HTML
export function mostrarProductos(categoria) {
  const contenedor = document.getElementById('listaProductos');
  if (!contenedor) return;

  contenedor.innerHTML = '';

  const productosFiltrados = categoria === 'todos'
    ? productosGlobales
    : productosGlobales.filter(p => p.categoria === categoria);

  if (productosFiltrados.length === 0) {
    contenedor.innerHTML = '<p class="sin-productos">No hay productos disponibles en esta categoría.</p>';
    return;
  }

  productosFiltrados.forEach(producto => {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'tarjeta-producto';
    tarjeta.innerHTML = `
      <img src="${producto.imagen || 'assets/PATITAS.jpg'}" alt="${producto.nombre}">
      <h3>${producto.nombre}</h3>
      <p class="precio">S/ ${Number(producto.precio).toFixed(2)}</p>
      <button onclick="agregarAlCarrito(${producto.id})">Agregar al Carrito</button>
    `;
    contenedor.appendChild(tarjeta);
  });
}

// Función para agregar productos al carrito de compras
export function agregarAlCarrito(idProducto) {
  const producto = productosGlobales.find(p => p.id === idProducto);
  if (!producto) return;

  let carrito = JSON.parse(localStorage.getItem('carrito')) || [];
  const existe = carrito.find(item => item.id === idProducto);

  if (existe) {
    existe.cantidad += 1;
  } else {
    carrito.push({ ...producto, cantidad: 1 });
  }

  localStorage.setItem('carrito', JSON.stringify(carrito));
  
  // Actualizar contador del header si existe la función global
  if (typeof window.actualizarContador === 'function') {
    window.actualizarContador();
  }
  
  alert(`¡${producto.nombre} agregado al carrito!`);
}