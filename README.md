# Finanzas Elber y Mayra — V26

Aplicación web familiar para registrar, planificar y analizar ingresos, gastos, préstamos, pensiones escolares y saldos mensuales.

La aplicación está desarrollada con HTML, CSS y JavaScript, se publica mediante GitHub Pages y utiliza Firebase Authentication y Cloud Firestore para sincronizar la información entre Elber y Mayra.

## Acceso

Usuarios autorizados:

- Elber: `elbernunez97@gmail.com`
- Mayra: `mayra.barrera.g01@gmail.com`

La autenticación se realiza con Google.

## Estructura principal

La aplicación incluye las siguientes secciones:

- Inicio
- Presupuesto mensual
  - Ingresos
  - Gastos fijos
  - Gastos variables
  - Resumen
- Préstamos
- Pensiones escolares
- Dashboard
- Analítica
- Historial
- Configuración

## Selección de vista

La información puede consultarse en tres vistas:

- General
- Elber
- Mayra

La vista General consolida la información de ambos usuarios.

## Filtro de meses

El selector superior permite marcar uno o varios meses mediante casillas.

Comportamiento:

- Un mes marcado: muestra únicamente ese mes.
- Varios meses marcados: consolida los meses seleccionados.
- Todos: marca todos los meses habilitados.

Regla especial para 2026:

- La analítica, los dashboards y los resúmenes consideran agosto a diciembre.
- Enero a julio quedan fuera de los cálculos generales.
- Las pensiones escolares históricas pueden mantenerse registradas sin alterar la analítica financiera del periodo activo.

Desde 2027:

- Todos considera enero a diciembre.

## Ingresos

Cada ingreso permite registrar:

- Concepto
- Categoría
- Responsable
- Monto previsto
- Monto real
- Fecha
- Estado recibido o pendiente

En ingresos, el monto previsto es opcional.

Si el monto real queda vacío, se guarda como cero.

## Gastos fijos

Cada gasto fijo permite registrar:

- Concepto
- Categoría
- Responsable
- Monto previsto
- Monto real
- Fecha
- Estado pagado o pendiente

En gastos, el monto previsto es obligatorio.

El filtro por categoría recalcula automáticamente:

- Previsto
- Real
- Pendiente previsto

Por ejemplo, al seleccionar Streaming, los indicadores muestran únicamente los gastos de esa categoría.

## Gastos variables

Permite registrar gastos no contemplados inicialmente.

Cada registro incluye:

- Concepto
- Categoría
- Responsable
- Monto previsto
- Monto real
- Fecha
- Estado pagado o pendiente

## Saldo restante del mes anterior

Cuando un mes termina con saldo real positivo, el siguiente mes recibe automáticamente un ingreso virtual.

Ejemplo:

- Ingresos reales de agosto: S/ 5.000
- Gastos reales de agosto: S/ 3.500
- Saldo final: S/ 1.500

En septiembre aparecerá:

- Concepto: `Saldo restante de agosto`
- Categoría: `Saldo anterior`
- Monto previsto: S/ 1.500
- Monto real: S/ 1.500

Reglas:

- Solo se arrastran saldos positivos.
- Los saldos negativos no se trasladan.
- El saldo se recalcula automáticamente mientras el mes permanezca abierto.
- En la vista anual se incorpora una sola vez para evitar duplicar ingresos.

## Cierre mensual

La V18 incorpora cierre y reapertura de meses.

### Cerrar mes

Al cerrar un mes:

- Se bloquean nuevos registros.
- Se bloquean ediciones.
- Se bloquean eliminaciones.
- No se pueden marcar ni desmarcar pagos.
- Se guarda una fotografía de los totales de Elber, Mayra y General.
- El saldo final cerrado se utiliza para el mes siguiente.

### Reabrir mes

Permite volver a modificar un mes cerrado.

Para cerrar o reabrir debe seleccionarse un solo mes.

## Préstamos

La aplicación admite dos tipos de préstamo.

### Cuotas fijas

Campos principales:

- Monto recibido
- Total original a devolver
- Número de cuotas
- Primera cuota
- Responsable

Permite cancelar anticipadamente y registrar un nuevo total final.

El sistema:

- Descuenta pagos anteriores.
- Ajusta la cuota final.
- Elimina cuotas posteriores.

### Interés mensual y abono flexible

Campos principales:

- Capital recibido
- Interés mensual
- Plazo referencial
- Capital que se planea pagar por mes

El capital previsto se calcula automáticamente según el monto y el plazo, pero sigue siendo editable.

Reglas de pago:

- Primero se cubre el interés.
- El excedente reduce capital.
- Si solo se paga el interés, el capital permanece.
- Si se paga más de lo previsto, se recalculan los meses restantes.
- Si queda capital al terminar el plazo previsto, el cronograma se amplía automáticamente.

## Pensiones escolares

La sección especial de pensiones permite registrar:

- Nombre del alumno
- Periodo escolar
- Matrícula
- Pensión mensual
- Responsable inicial

El responsable predeterminado es Mayra.

La aplicación genera automáticamente:

- Matrícula en marzo
- Pensiones de marzo a diciembre
- Pago de julio programado a quincena
- Pago de diciembre programado a quincena

La matriz muestra por alumno:

- Monto previsto
- Check de pago
- Total anual
- Cantidad de pagos realizados

Cada cuota también aparece como gasto fijo y puede editarse individualmente.

Las pensiones escolares no se copian mediante la función de copiar gastos fijos del mes anterior.

## Dashboard

El Dashboard utiliza los meses seleccionados en el filtro superior.

Incluye:

- Ingresos previstos y reales
- Gastos previstos y reales
- Avance de pagos
- Saldo disponible
- Comparación entre Elber y Mayra
- Indicadores de préstamos

## Analítica financiera

La sección Analítica presenta indicadores estándar de salud financiera.

Incluye:

- Puntaje de salud financiera sobre 100
- Tasa de ahorro real
- Relación gastos / ingresos
- Cumplimiento de ingresos
- Desviación presupuestaria
- Carga de gastos fijos
- Carga de deuda
- Evolución mensual
- Diagnóstico automático
- Comparación entre Elber, Mayra y General

La V18 también incorpora:

- Ingreso real promedio
- Gasto real promedio
- Ahorro real promedio
- Proyección simple del gasto
- Cinco categorías con mayor gasto
- Variación frente al mes anterior

La proyección es referencial y no representa una predicción bancaria ni contable.

## Indicador de sincronización

El estado de Firestore se muestra en la parte superior.

Estados:

- Verde: Sincronizado
- Amarillo: Guardando
- Amarillo: Cambios pendientes
- Rojo: Error al guardar

## Deshacer

Después de las principales modificaciones aparece temporalmente el botón:

`Deshacer`

Se utiliza para revertir:

- Creación de registros
- Ediciones
- Eliminaciones
- Pagos marcados
- Copias del mes anterior
- Cierre o reapertura de meses
- Cambios en préstamos
- Cambios en pensiones escolares

## Copiar información del mes anterior

La aplicación permite copiar por separado:

- Ingresos
- Gastos fijos

No se copian automáticamente:

- Ingresos provenientes de préstamos
- Cuotas de préstamos
- Pensiones escolares
- Saldo restante del mes anterior

## Firebase

Proyecto Firebase:

- Project ID: `seguimiento-finanzas-f0db8`
- Auth Domain: `seguimiento-finanzas-f0db8.firebaseapp.com`
- Documento compartido: `families/elber-mayra`

El dominio de GitHub Pages debe permanecer autorizado en Firebase Authentication:

`elber-nunez.github.io`

## Publicación en GitHub Pages

Repositorio:

`elber-nunez/seguimiento-finanzas`

URL:

`https://elber-nunez.github.io/seguimiento-finanzas/`

Para actualizar la aplicación:

1. Descomprimir el ZIP.
2. Reemplazar los archivos existentes del repositorio.
3. Mantener las carpetas `css` y `js`.
4. Confirmar los cambios en GitHub.
5. Esperar la actualización de GitHub Pages.

## Archivos principales

- `index.html`: estructura principal
- `css/`: estilos visuales
- `js/app.js`: lógica general
- `js/budget.js`: cálculos financieros y saldo arrastrado
- `js/loans.js`: lógica de préstamos
- `js/school-pensions.js`: lógica de pensiones escolares
- `js/dashboard.js`: dashboard
- `js/analytics.js`: analítica financiera
- `js/firestore.js`: sincronización
- `js/auth.js`: autenticación
- `FIRESTORE_RULES.txt`: reglas de seguridad

## Recomendaciones de prueba

Antes de usar la V18 como versión definitiva, conviene validar:

- Sincronización simultánea entre ambos usuarios
- Cierre y reapertura de meses
- Arrastre de saldo después de cerrar un mes
- Registro y deshacer de movimientos
- Préstamos con pagos superiores o inferiores
- Pensiones escolares al cambiar de año
- Filtros de uno, varios y todos los meses
- Indicadores por categoría
- Analítica para Elber, Mayra y General

## Versión

Versión actual: **V26**

Nombre sugerido de commit:

`Actualizar V18 con cierre mensual, deshacer y analítica ampliada`


## Versión 19 — registro de préstamos ya activos

La sección Préstamos incorpora el botón:

`Registrar préstamo ya activo`

Esta modalidad sirve para préstamos recibidos antes de comenzar a usar la aplicación.

### Diferencias frente a un préstamo nuevo

Un préstamo ya activo:

- No se registra como ingreso del mes actual.
- No genera cuotas históricas.
- Solo genera las cuotas pendientes desde la próxima fecha de pago.
- Conserva el monto original como información.
- Incluye lo pagado anteriormente en los indicadores informativos.
- Solo los pagos realizados desde la aplicación afectan los dashboards actuales.

### Préstamo activo de cuotas fijas

Solicita:

- Responsable.
- Concepto.
- Monto recibido originalmente.
- Total original a devolver.
- Número total de cuotas.
- Cuotas ya pagadas.
- Saldo pendiente actual.
- Mes de la próxima cuota.

Ejemplo:

- Total de cuotas: 12.
- Cuotas ya pagadas: 8.
- Próxima cuota generada: 9 de 12.
- Saldo pendiente: S/ 4.400.

### Préstamo personal activo

Solicita:

- Capital original.
- Capital pendiente actual.
- Interés mensual.
- Capital previsto por mes.
- Pagos realizados anteriormente.
- Próximo mes de pago.

El cronograma comienza usando el capital pendiente actual y no el capital original.


## Versión 20 — resumen financiero simplificado

La sección Resumen se reorganizó en tres bloques fáciles de interpretar:

1. **Dinero que ingresa**
   - Esperabas recibir.
   - Ya recibiste.
   - Porcentaje de avance de ingresos.

2. **Dinero que sale**
   - Planeas gastar.
   - Ya pagaste.
   - Falta pagar.
   - Porcentaje de avance de pagos.

3. **Tu situación actual**
   - Disponible hoy.
   - Saldo después de pagar todo lo pendiente.
   - Saldo según la planificación.
   - Mensaje automático que explica si el saldo es suficiente.

La vista funciona igual para General, Elber y Mayra.


## Versión 21 — mejoras para celular

- Se agregó un botón `×` en la cabecera del menú lateral para cerrarlo manualmente.
- El menú también puede cerrarse:
  - tocando fuera del panel;
  - presionando nuevamente el botón de menú;
  - seleccionando una opción;
  - presionando Escape.
- Mientras el menú está abierto, se bloquea el desplazamiento de la página de fondo.
- Los controles superiores en celular se reorganizaron:
  - Usuario, mes y año ocupan columnas proporcionadas.
  - Ningún selector queda cortado.
  - El botón Cerrar mes ocupa una fila completa.
  - La foto de usuario permanece alineada a la derecha.
- Los cambios no alteran el diseño de computadora.


## Versión 22 — corrección de copia de gastos fijos

Se reforzó la función **Copiar gastos fijos del mes anterior**.

Ahora se excluyen todos los registros generados automáticamente cuando cumplen cualquiera de estas condiciones:

- Tienen `loanId`.
- Tienen `schoolPensionId`.
- Fueron creados como cuota de préstamo.
- Fueron creados como pensión escolar.
- Pertenecen a la categoría `Préstamo`.
- Pertenecen a la categoría `Pensión escolar`.
- El concepto tiene un formato como `Cuota 9 de 48`.

También se corrigió la edición de registros automáticos. Al editar una cuota desde Gastos fijos ya no se eliminan los campos internos que identifican su origen.

La copia mensual queda limitada a gastos manuales como servicios, alimentación, transporte, streaming y otros gastos fijos normales.

Los registros incorrectos que ya fueron copiados en versiones anteriores deben eliminarse una sola vez manualmente.


## Versión 23 — acciones de configuración por usuario

Las acciones de Configuración ahora dependen del usuario seleccionado en la barra superior.

### Vista General

Cuando la vista está en `General`, estas acciones no se ejecutan:

- Copiar ingresos del mes anterior.
- Copiar gastos fijos del mes anterior.
- Restablecer el mes.

La aplicación muestra una alerta solicitando seleccionar `Elber` o `Mayra`.

### Vista Elber o Mayra

Las acciones afectan únicamente al usuario seleccionado.

Ejemplo:

- Si la vista está en Elber, solo se copian o eliminan registros de Elber.
- Los registros de Mayra no se modifican.
- Si la vista está en Mayra, solo se trabaja con Mayra.

### Restablecer mes

El restablecimiento elimina para el usuario seleccionado:

- Ingresos manuales.
- Gastos fijos manuales.
- Gastos variables.

Se conservan:

- Ingresos asociados a préstamos.
- Cuotas de préstamos.
- Préstamos nuevos.
- Préstamos ya activos.

Esto evita romper el cronograma y la continuidad de los préstamos.

Las categorías de ingresos y gastos continúan siendo generales para toda la aplicación.


## Versión 24 — corrección del saldo restante mensual

Se corrigió el comportamiento del saldo restante del mes anterior.

### Nueva lógica

- El saldo restante ya no se muestra automáticamente en meses futuros.
- Solo se genera cuando el mes ya comenzó según la fecha del dispositivo.
- Ejemplo:
  - El saldo de agosto se genera en septiembre cuando septiembre ya inició.
  - No se generan anticipadamente saldos en octubre, noviembre o diciembre.
- Cada mes recibe como máximo un solo registro de saldo anterior por usuario.
- En vistas de varios meses, el saldo anterior se suma únicamente en el primer mes seleccionado para evitar duplicaciones analíticas.

### Eliminación y edición manual

El registro `Saldo restante de <mes anterior>` ahora puede abrirse desde Ingresos.

- Si se elimina manualmente, no vuelve a generarse automáticamente para ese mes y usuario.
- Si se edita manualmente, la aplicación respeta el valor ingresado y deja de recalcularlo automáticamente.
- El saldo anterior tampoco se copia con la función de copiar ingresos del mes anterior.

### Ejemplo

Si agosto termina con S/ 1.500 positivos:

- Septiembre recibe `Saldo restante de agosto: S/ 1.500`.
- Octubre no recibe nada anticipadamente.
- Cuando octubre comience, se calcula el saldo real con el que terminó septiembre.


## Versión 25 — dashboard por periodo y eliminación de pensiones

### Préstamos en el Dashboard

Los indicadores de préstamos ahora usan únicamente los meses seleccionados:

- Préstamos con cuotas en el periodo.
- Pendiente del periodo.
- Cuotas previstas del periodo.
- Cuotas pagadas del periodo.

Al seleccionar un solo mes, muestran exclusivamente ese mes. Al seleccionar varios meses o Todos, consolidan únicamente esos meses.

### Gastos por categoría

El gráfico cambió de barras horizontales a barras verticales.

Cada categoría muestra dos columnas:

- Previsto.
- Real.

### Eliminación de pensiones escolares

Cada alumno tiene ahora un botón visible de eliminación:

- En el encabezado de la matriz.
- En la tarjeta inferior del alumno.

Al eliminar una pensión se eliminan también sus cuotas relacionadas, previa confirmación. Los meses cerrados continúan protegidos.


## Versión 26 — corrección del Dashboard de préstamos

### Gastos por categoría

El gráfico vuelve a utilizar barras horizontales, con dos líneas por categoría:

- Previsto.
- Real.

### Préstamos por mes o periodo

Se reforzó la identificación de cuotas de préstamos.

El Dashboard reconoce una cuota cuando:

- Tiene `loanId`.
- Tiene origen `loan-installment`.
- Fue creada como préstamo ya activo.
- Pertenece a la categoría `Préstamo`.
- El concepto contiene textos como `Cuota 9 de 48` o `Pago 2`.

Esto corrige registros antiguos que habían perdido sus campos internos antes de la protección incorporada en versiones posteriores.

Los checks no necesitan estar marcados para que una cuota aparezca como prevista:

- Sin check: suma en previsto y pendiente.
- Con check: suma en pagado.
