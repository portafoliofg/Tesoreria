---
name: invoice-organizer
description: "Ordenar y leer facturas y comprobantes argentinos (PDF de ARCA/AFIP, fotos, notas de crédito y débito, recibos, comprobantes de transferencia): extraer tipo (A, B, C, M, E), punto de venta, número, fecha, proveedor, CUIT, neto, IVA, total, vencimiento y CAE; renombrar los archivos de forma pareja, detectar duplicados y armar la lista para cargar en la hoja Facturas o vincular con pagos. Usar al pedir 'ordená estas facturas', 'renombrá los comprobantes', 'pasame los datos de estos PDF', 'qué facturas faltan pagar', o al programar la lectura de facturas en la app."
---

# Organizador de facturas y comprobantes

## Qué datos sacar de cada factura

Columnas de la hoja **Facturas** (`HEADERS_FACTURAS` en `src/Código.gs`):

| Dato | Dónde aparece | Validación |
|---|---|---|
| `Tipo` | Letra grande arriba al centro (A, B, C, M, E) y código (01 = Factura A, 06 = B, 11 = C, 03/08/13 = notas de crédito) | Nota de crédito → importes en negativo |
| `Punto de Venta` y `Número` | "Punto de Venta: 00003  Comp. Nro: 00001234" | 4 o 5 dígitos y 8 dígitos |
| `Fecha` | Fecha de emisión | No futura |
| `Proveedor` y `CUIT` | Datos del emisor (arriba a la izquierda), **no** los del receptor | CUIT de 11 dígitos con dígito verificador válido |
| `Neto`, `IVA`, `Total` | Pie de la factura | `Neto + IVA + otros tributos ≈ Total` (tolerancia de centavos) |
| `Moneda` | Pesos salvo que diga USD o "Moneda: Dólar" | Si es en dólares, guardar también el tipo de cambio si figura |
| `Vencimiento` | "Fecha de Vto. para el pago" | Si no figura, dejar vacío (no inventar) |
| `Concepto` | Descripción de los ítems, resumida | |

El **CAE** y su vencimiento confirman que la factura es electrónica válida; anotarlo en `Notas`
si se necesita.

Las facturas B y C no discriminan IVA: `Neto = Total` e `IVA = 0` salvo que el comprobante
diga otra cosa.

## Cómo nombrar los archivos

```
AAAA-MM-DD Proveedor FC-A 00003-00001234 $ 1.234.567,89.pdf
```
- Fecha ISO primero, para que se ordenen solos.
- `FC` factura, `NC` nota de crédito, `ND` nota de débito, `REC` recibo, `TRF` transferencia.
- Sin barras ni caracteres raros (la app pasa los nombres por `nombreSeguro_` y, si ya existe,
  agrega " (2)").

## Carpetas

Los comprobantes que se suben desde la app van a la carpeta raíz de Drive, en una subcarpeta
por destino, y los resúmenes bancarios a `Resúmenes de cuenta/<Banco>`. Para ordenar archivos sueltos,
respetar ese criterio: **por proveedor** y, dentro, por año. No mover archivos que la app ya
tiene vinculados (columna `Archivo` o `Comprobante`) sin actualizar el vínculo.

## Flujo de trabajo

1. Listar los archivos y leer cada uno (texto del PDF; si es imagen o escaneo, leerlo como imagen).
2. Armar una tabla con los datos de arriba y una columna "Revisar" con lo que no se pudo leer o
   no valida.
3. **Mostrar la tabla y el plan de renombrado antes de mover o renombrar nada.**
4. Detectar duplicados: mismo CUIT, tipo, punto de venta y número (aunque el archivo se llame
   distinto).
5. Recién con el visto bueno, renombrar y ordenar. Nunca borrar: los duplicados van a una
   carpeta `Duplicados`.
6. Entregar un resumen: cuántas facturas, total por proveedor y por mes, cuáles quedaron para
   revisar.

## Casos especiales

- **Varias facturas en un PDF:** separarlas y listarlas por separado.
- **Foto torcida o borrosa:** leer lo que se pueda y marcar "revisar" lo dudoso; no adivinar
  números.
- **Factura en dólares:** no sumarla a los totales en pesos.
- **Comprobante de pago (transferencia, cheque):** no es una factura; se vincula a la factura
  en la columna `Pagos`.

## Relacionadas

- **data-quality**: validación de CUIT, fechas e importes.
- **reconciliation**: cruzar pagos con el banco.
- Para cargar facturas en Synagro existe la skill `synagro-facturas-compra` de la cuenta.
