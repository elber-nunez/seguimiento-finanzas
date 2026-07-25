# Dashboard de Finanzas Personales

Aplicación web estática para registrar ingresos, gastos y presupuesto mensual desde computadora o celular.

## Publicación

### GitHub Pages
1. Sube los archivos a la rama `main`.
2. Ve a **Settings > Pages**.
3. En **Build and deployment**, selecciona **Deploy from a branch**.
4. Elige `main` y la carpeta `/ (root)`.
5. Guarda los cambios.

### Cloudflare Pages
1. Conecta este repositorio desde Cloudflare Pages.
2. Selecciona la rama `main`.
3. Framework preset: `None`.
4. Build command: dejar vacío.
5. Build output directory: `/`.

## Almacenamiento de datos

Los registros se guardan localmente en el navegador mediante `localStorage`. Los datos no se sincronizan automáticamente entre dispositivos ni navegadores.
