---
name: reconciliation
description: "Conciliación bancaria y de inversiones en Tesorería: cruzar el resumen o extracto del banco con los registros propios (transferencias, comprobantes, cheques), emparejar por importe, fecha y referencia, tolerancia de días, partidas pendientes en banco y en libros, saldo según banco contra saldo según libros, antigüedad de las diferencias, y conciliar FCI y bolsa contra lo que informa el banco o la ALYC. Usar al tocar emparejar, partidasBanco, partidasLibros, guardarConciliacion_, la lectura de extractos, o al preguntar por qué no cierra una conciliación."
---

# Conciliación (Tesorería)

## Cómo funciona en la app

Una conciliación cruza, para **una cuenta y un período**, los movimientos del banco con los
registros propios (`Código.gs`, sección "Conciliación bancaria"; `Index.html`, `emparejar`).

- **Banco:** movimientos del resumen cargado (`Origen = Resumen`) o de un extracto leído desde
  archivo (no se guardan en Movimientos; sus claves quedan en la columna `Extracto`).
- **Libros:** transferencias, comprobantes, cargas manuales y cheques de esa cuenta.
- **Emparejado automático** (`emparejar`):
  - El importe tiene que coincidir (diferencia de hasta $ 0,01).
  - Días entre fechas ≤ tolerancia elegida (0 a 15). Para cheques se permiten hasta 45 días,
    porque el débito llega después de la fecha de pago.
  - Si la referencia propia (4 caracteres o más) aparece en la del banco, gana prioridad
    ("Automático (referencia)").
  - Cada partida se usa una sola vez; primero los pares con mejor puntaje (referencia, después
    menos días).
- Lo que queda sin par son **pendientes en banco** y **pendientes en libros**. El usuario puede
  emparejar a mano o aceptar partidas.
- Al guardar, cada movimiento y cheque conciliado queda marcado con el ID en la columna
  `Conciliación` y no vuelve a aparecer. Anular la conciliación borra las marcas. Un registro
  conciliado no se puede mover de cuenta hasta anular.
- Hoja **Conciliaciones**: `Saldo según Banco`, `Saldo según Libros`, conciliados, pendientes de
  cada lado, estado y detalle.

## Control de saldos

```
saldo según banco
 − pendientes en banco (el banco los tiene, nosotros no)
 + pendientes en libros (nosotros los tenemos, el banco todavía no)
 = saldo según libros
```
Si no cierra, la diferencia sale de una partida mal cargada, duplicada o fuera del período.

## Causas típicas de diferencias

| Diferencia | Causa habitual | Qué hacer |
|---|---|---|
| Pendiente en banco: comisiones, impuestos (débitos y créditos, IVA, percepciones) | No se cargan como movimiento propio | Cargarlos o aceptarlos con concepto |
| Pendiente en libros: cheque emitido | Todavía no lo cobraron | Normal hasta el débito; revisar si pasa de 30 días de la fecha de pago |
| Mismo importe, fecha muy distinta | Fecha de carga en vez de fecha del movimiento | Corregir la fecha |
| Importe casi igual | Retenciones o comisión descontada | No forzar el par: cargar la diferencia |
| Dos del banco contra uno propio (o al revés) | Pago partido o agrupado | Emparejar a mano |
| Duplicado en libros | Mismo comprobante cargado dos veces | Usar el N° de referencia para encontrarlo |

## Antigüedad de pendientes

Clasificar los pendientes por días desde su fecha: 0–7, 8–30, 31–90, más de 90. Los de más de
30 días merecen revisión; los de más de 90 casi siempre son errores de carga o cheques
caducados (un cheque vence 30 días después de su fecha de pago).

## FCI y bolsa

- **FCI:** el saldo propio de cada fondo tiene que coincidir con el que informa el banco en la
  misma fecha. Una diferencia suele ser una suscripción o un rescate sin cargar (se ve como
  período "dudoso", ver **return-calculations**).
- **Bolsa:** cada cheque o pagaré negociado tiene que tener su `Importe recibido` acreditado en
  la cuenta (columna `Origen del recibido`) y, al vencimiento, su débito por el `Monto`.

## Errores comunes

- Emparejar por importe solo, sin mirar la fecha: con importes redondos repetidos se cruzan
  partidas equivocadas.
- Subir la tolerancia de días para que "cierre": aparecen pares falsos.
- Conciliar dos veces el mismo extracto (la app lo evita con las claves del extracto).
- Mezclar cuentas o monedas.

## Relacionadas

- **data-quality**: validar el extracto antes de cruzarlo.
- **liquidity-management**: saldos conciliados como punto de partida.
