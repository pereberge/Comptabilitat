-- Ejecutar con un usuario autorizado para crear bases de datos.
CREATE DATABASE IF NOT EXISTS contabilidad CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
-- Crear un usuario local propio y conceder permisos únicamente sobre contabilidad.
-- Las credenciales se configuran en backend/.env. No usar root en la aplicación.
