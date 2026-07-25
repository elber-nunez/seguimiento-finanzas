# Finanzas de Elber y Mayra — versión 3

Esta versión cambia el funcionamiento para adaptarse al presupuesto mensual real:

- Registro de ingresos del mes.
- Lista de gastos mensuales planificados.
- Cada gasto tiene una palomita para marcarlo como realizado.
- Al marcar un gasto, el disponible actual se reduce.
- Se calcula la expectativa de saldo al finalizar el mes.
- Los gastos particulares se agregan ya marcados como realizados.
- Vistas independientes para Elber y Mayra.
- Vista General que combina ambos perfiles.
- Selector desplegable en la barra superior.

## Archivos

- `index.html`
- `styles.css`
- `app.js`
- `README.md`

## Datos

Todavía se guardan con `localStorage`. La próxima etapa será conectar Firebase para que Elber y Mayra compartan los mismos datos desde diferentes dispositivos.
