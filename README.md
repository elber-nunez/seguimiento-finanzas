# Seguimiento de finanzas — V6

Aplicación web compartida para Elber y Mayra.

## Cambios principales

- Inicio de sesión con Google mediante Firebase Authentication.
- Datos sincronizados con Cloud Firestore.
- Acceso a vistas General, Elber y Mayra.
- Navegación reformada:
  - Inicio
  - Presupuesto mensual
    - Ingresos
    - Gastos fijos
    - Gastos variables
    - Resumen
  - Dashboard
  - Historial
  - Configuración
- Sin opción de exportación en PDF.
- Código dividido por módulos.

## Antes de publicar

### 1. Agrega el correo de Mayra

Edita:

- `js/config.js`
- `FIRESTORE_RULES.txt`

Reemplaza:

`mayra.barrera.g01@gmail.com`

por el correo real de Google de Mayra, en minúsculas.

### 2. Publica las reglas de Firestore

En Firebase:

`Firestore Database → Reglas`

Copia todo el contenido de `FIRESTORE_RULES.txt` y pulsa **Publicar**.

### 3. Dominio autorizado

En:

`Authentication → Configuración → Dominios autorizados`

debe existir:

`elber-nunez.github.io`

### 4. Sube el proyecto completo a GitHub

Debe mantenerse esta estructura:

```text
index.html
css/
js/
FIRESTORE_RULES.txt
README.md
```

GitHub Pages debe publicar desde la rama `main` y la carpeta raíz.

## Base de datos

Toda la información se guarda en un único documento compartido:

`families/elber-mayra`

Los dos usuarios autorizados pueden visualizar y actualizar los datos.


## Versión 7

- Copia separada de ingresos y gastos fijos desde el mes anterior.
- Solo se agregan registros faltantes; los duplicados se omiten.
- Los gastos fijos copiados comienzan desmarcados.
- Categorías de ingresos y gastos editables desde Configuración.
- Los registros anteriores conservan la categoría aunque se elimine de las opciones nuevas.
