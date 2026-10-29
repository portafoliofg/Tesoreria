---
name: data-quality
description: "Calidad de los datos de Tesorería: reglas de validación al importar o cargar (planilla de flujo de fondos, extractos del banco, fotos y PDF de cheques y comprobantes, facturas), fechas imposibles, importes con formato argentino, duplicados, saldos viejos, columnas que faltan, monedas mezcladas, y cómo avisar y manejar las excepciones. Usar al programar importaciones o lectores de archivos, al ver números raros en un tablero, o al preguntar 'por qué este dato da mal', 'hay duplicados', 'falta un movimiento'."
---

# Calidad de datos (Tesorería)

## Seis cosas a revisar

| Dimensión | En Tesorería |
|---|---|
| **Exactitud** | El importe y la fecha coinciden con el comprobante o el banco |
| **Completitud** | Están las columnas obligatorias (fecha, importe, moneda, banco o cuenta) y el `Importe recibido` de cada cheque negociado |
| **Actualidad** | El último saldo de cada cuenta y FCI es reciente; si no, avisar la fecha |
| **Coherencia** | El mismo banco se llama igual en todas las hojas (`nombreBancoCanonico`) y el mismo cheque tiene el mismo número |
| **Validez** | Fechas reales, importes numéricos, CUIT de 11 dígitos con dígito verificador, estados de la lista (`ESTADOS_CHEQUE_EDITABLES`) |
| **Unicidad** | Un comprobante, cheque o factura cargado una sola vez |

## Reglas de validación

**Fechas**
- Formato `dd/mm/aaaa` (o ISO internamente con `fechaAOrden`); cuidado con planillas que
  vienen como `mm/dd`: un 03/04 puede ser 3 de abril o 4 de marzo.
- Fecha de pago ≥ fecha de emisión; fecha de pago de bolsa > fecha de carga.
- Nada muy en el futuro (más de un año) ni muy en el pasado sin motivo.

**Importes**
- Leer con `parseImporte` ("1.234.567,89", "$ 1.234", "-1.234,5"). Ojo: descarta todo lo que no
  sea dígito, punto, coma o guion, así que un negativo entre paréntesis "(1.234)" se lee positivo.
- Recibido ≤ nominal en bolsa; recibido muy por debajo del nominal (TNA absurda) es sospechoso.
- Moneda siempre explícita; los dólares no se suman con pesos.

**Duplicados**
- Transferencias: mismo `N° de Referencia`, banco e importe.
- Cheques: mismo banco, número de cheque e importe.
- Facturas: mismo CUIT, tipo, punto de venta y número.
- Importaciones repetidas: usar `ID Planilla` para no volver a insertar. No pisar las columnas
  protegidas (`CAMPOS_PROTEGIDOS_IMPORTACION`: N° Interno, Conciliación, Comprobante, etc.).

**Saltos imposibles**
- FCI: más de ~0,3 % de rendimiento por día marca el período como dudoso (falta un movimiento).
- Saldo que cambia mucho sin movimientos que lo expliquen.

**CUIT**
- 11 dígitos; dígito verificador con los pesos 5, 4, 3, 2, 7, 6, 5, 4, 3, 2 (módulo 11).

## Manejo de excepciones

1. **No descartar en silencio.** Lo que no pasa una regla se muestra con el motivo
   ("revisar", "dudoso", "falta el importe recibido").
2. Separar lo **bloqueante** (no se puede guardar: sin fecha, sin importe) de lo **sospechoso**
   (se guarda pero se avisa).
3. Mensajes en lenguaje simple, diciendo qué falta y cómo arreglarlo, como el resto de la app.
4. Dejar rastro en **Auditoría** cuando se corrige o se importa.

## Antes de mostrar un número en un tablero

- ¿Cuántos registros se usaron y cuántos se descartaron por inválidos o dudosos?
- ¿De qué fecha es el dato más reciente?
- ¿Está separado por moneda?

## Relacionadas

- **reconciliation**: diferencias entre banco y libros.
- **data-validation**: revisar un análisis antes de compartirlo.
- **invoice-organizer**: datos de facturas y comprobantes.
