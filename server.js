const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');

const app = express();
const PORT = process.env.PORT || 3000;

// Servir la carpeta raíz (HTML, JS, CSS, assets, etc.)
app.use(express.static('./'));

// Configuración de Swagger
const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'API - PATITAS FELICES',
      version: '1.0.0',
      description: 'Documentación de la API REST y módulos del sistema web',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Servidor Local de Desarrollo',
      },
    ],
  },
  apis: ['./server.js'],
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

// Ruta para la interfaz visual de Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

/**
 * @swagger
 * /api/productos:
 *   get:
 *     summary: Obtener la lista de productos del emprendimiento
 *     responses:
 *       200:
 *         description: Éxito al obtener la lista de productos
 */
app.get('/api/productos', (req, res) => {
  res.json([
    {
      id: 1,
      nombre: 'Comida Ricocan Perro 2kg',
      precio: 35.00,
      categoria: 'ALIMENTOS',
      imagen: 'assets/alimento.jpg'
    },
    {
      id: 2,
      nombre: 'Polera Abrigo para Mascota',
      precio: 25.00,
      categoria: 'ROPA',
      imagen: 'assets/ropa.jpg'
    },
    {
      id: 3,
      nombre: 'Collar Ajustable Reflectivo',
      precio: 15.00,
      categoria: 'ACCESORIOS',
      imagen: 'assets/collar.jpg'
    },
    {
      id: 4,
      nombre: 'Shampoo Antipulgas 500ml',
      precio: 20.00,
      categoria: 'CUIDADO',
      imagen: 'assets/shampoo.jpg'
    }
  ]);
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor activo en: http://localhost:${PORT}`);
  console.log(`Swagger UI disponible en: http://localhost:${PORT}/api-docs`);
});