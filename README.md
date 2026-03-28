# Misas Backend - Node.js (Express + PostgreSQL)

Este backend está diseñado para servir información sobre parroquias y servicios de misa, utilizando un sistema de cacheo en PostgreSQL para optimizar las llamadas a APIs externas (Scraping y Google Places).

## 🚀 Instalación y Uso

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar base de datos:**
   Crea una base de datos PostgreSQL y utiliza el archivo `db/schema.sql` para crear la tabla requerida.

3. **Variables de entorno (.env):**
   Asegúrate de llenar los campos en tu archivo `.env`:
   ```env
   PLACES_API_KEY=tu_api_key_de_google
   DATABASE_URL=postgresql://usuario:password@localhost:5432/nombre_db
   PORT=8080
   NODE_ENV=development
   ```

4. **Correr el proyecto:**
   ```bash
   npm start
   ```

## 🛠 Estructura del Proyecto

- `controllers/`: Maneja la lógica de las peticiones HTTP.
- `services/`: Lógica de negocio (Scraping, Google Places, Cache logic).
- `db/`: Conexión a PostgreSQL y esquemas SQL.
- `routes/`: Definición de los endpoints.

## 📌 Endpoints Principales

- `GET /misas?estado=1&municipio_id=1&page=1`: Obtiene parroquias. Primero busca en Postgres, si no hay registros realiza scraping y enriquece con Google Places API.
- `GET /municipios?estado=1`: Obtiene la lista de municipios de un estado.
- `GET /santos`: Obtiene los santos del día.

## 💾 Optimización de Cache
- El sistema utiliza `ON CONFLICT (nombre, direccion)` para evitar duplicados en la base de datos.
- Las coordenadas y ratings de Google solo se consultan cuando se agrega un nuevo registro a la caché.
