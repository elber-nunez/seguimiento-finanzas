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

`REEMPLAZAR_CORREO_DE_MAYRA@gmail.com`

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


## Versión 8 — Previsto y real

- Todo ingreso, gasto fijo o gasto variable nuevo se crea como **previsto**.
- Al marcarlo como recibido o pagado, se solicita el **monto real**.
- El monto real puede ser igual o diferente al previsto.
- Los dashboards comparan ingresos previstos/reales, gastos previstos/reales y saldos previsto/real.
- Los datos anteriores se migran automáticamente sin borrarse.
- Se agregó el correo autorizado de Mayra: `mayra.barrera.g01@gmail.com`.

### Interpretación

- **Saldo previsto:** ingresos previstos menos gastos previstos.
- **Saldo real:** ingresos realmente recibidos menos gastos realmente pagados.
- **Diferencia:** saldo real menos saldo previsto.


## Versión 9 — Préstamos

- Título visible: `Finanzas - V9`.
- Nueva sección de Préstamos.
- Al crear un préstamo:
  - Registra el monto recibido como ingreso real del mes actual.
  - Usa la categoría `Préstamo`.
  - Genera las cuotas como gastos fijos previstos desde el mes elegido.
  - Reparte correctamente los decimales y ajusta la última cuota.
- Los ingresos y cuotas generados por préstamos no se copian al mes siguiente.
- Cancelación anticipada:
  - Se elige el mes de cancelación.
  - La cuota de ese mes se ajusta al saldo restante.
  - Las cuotas posteriores se eliminan.
- Dashboard actualizado con préstamos activos, deuda pendiente y cuotas del mes.


## Versión 10 — Préstamos flexibles y filtros

- Título visible: `Finanzas - V10`.
- Filtro por categoría en Gastos fijos.
- Préstamos de cuotas fijas:
  - Permiten indicar un nuevo total final al cancelar anticipadamente.
  - El sistema descuenta los pagos anteriores y elimina cuotas futuras.
- Préstamos con interés mensual y abono flexible:
  - Interés mensual fijo.
  - Abono previsto al capital.
  - El pago real cubre primero el interés y luego reduce el capital.
  - Si solo se paga el interés, el capital se mantiene.
  - El capital no pagado no se duplica en el mes siguiente.
  - Si al terminar el plazo referencial aún queda capital, se genera el siguiente pago.
- Dashboard de préstamos actualizado.


## Versión 11 — capital automático y filtro corregido

- Título visible: `Finanzas - V11`.
- El filtro por categoría de gastos fijos ahora se alinea a la izquierda.
- En préstamos flexibles:
  - El campo **Capital que planeas pagar por mes** se calcula automáticamente según el capital y el plazo.
  - Sigue siendo editable manualmente.
  - Si pagas más de lo previsto, el sistema recalcula los meses pendientes.
  - Si pagas solo interés, el capital se mantiene.
  - Los indicadores y el detalle del préstamo actualizan meses estimados y meses pendientes.


## Versión 12 — Pensiones escolares

- Título visible: `Finanzas - V12`.
- Nueva sección especial **Pensiones escolares**.
- Permite registrar alumno, periodo, matrícula, mensualidad y responsable inicial.
- Responsable predeterminado: **Mayra**.
- Genera automáticamente gastos fijos con categoría `Pensión escolar`.
- Cronograma:
  - Matrícula en marzo.
  - Pensiones de marzo a diciembre.
  - Julio programado para quincena.
  - Diciembre programado para quincena.
- Matriz anual con montos y checks por alumno.
- Los pagos pueden marcarse desde la matriz.
- Cada gasto generado puede editarse desde Gastos fijos, incluyendo el responsable Elber/Mayra.
- Las pensiones escolares no se copian con la función de copiar gastos fijos del mes anterior.
