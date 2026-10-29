---
name: liquidity-management
description: "Liquidez y flujo de caja de Tesorería: ver si la plata alcanza para lo que vence (cheques emitidos, bolsa, compromisos, facturas) contra cuentas, FCI y cheques de terceros en cartera, semana a semana o mes a mes; colchón mínimo; qué semana falta; de dónde sacar la plata (rescatar FCI o negociar cheques). Usar al preguntar 'nos alcanza', 'qué semana falta plata', 'cuánta liquidez tenemos', 'proyección de caja', 'flujo de fondos', o al programar ese tablero o una respuesta rápida de Amaroki sobre el tema."
---

# Liquidez y flujo de caja (Tesorería)

## Fuentes de la app

| Qué | Hoja | Cómo se toma |
|---|---|---|
| Plata en cuentas | **Saldos** (Tipo `Cuenta`) | Último saldo de cada `Cuenta ID` |
| FCI | **Saldos** (Tipo `FCI`) e **Inversiones FCI** | Último saldo de cada banco y moneda |
| Cheques a cobrar | **Cheques** con `Tipo` = `De terceros` en estado abierto (vacío, Pendiente, En cartera, Custodia depositante) | Por `Fecha de Pago` |
| Cheques a pagar | **Cheques** con `Tipo` = `Emitido` en estado abierto | Por `Fecha de Pago` |
| Bolsa a pagar | **Inversiones Bolsa** (cheques y pagarés propios negociados) | `Monto` por `Fecha de pago`, pendientes de débito |
| Compromisos | **Compromisos** (planes de pago, pagos mensuales, tarjetas) | `Monto` o `Monto Estimado` por `Fecha de Vencimiento` |
| Facturas | **Facturas** con saldo (`Total − Pagado`) | Por `Vencimiento` |

Pesos y dólares siempre por separado.

## Niveles de liquidez

| Nivel | Disponible | En Tesorería |
|---|---|---|
| 1. Inmediata | En el día | Saldos en cuenta corriente y caja de ahorros |
| 2. Muy corta | 24 a 72 h | FCI de liquidez inmediata o T+1 |
| 3. Corta | Al vencimiento | Cheques de terceros en cartera (o antes, negociándolos con costo) |
| 4. Con costo | Cuando se decide | Negociar cheques o pagarés propios en una ALYC (ver la TNA de bolsa) |

Una línea de crédito o descubierto no es liquidez propia: se puede cortar justo cuando hace falta.

## Proyección semana a semana

1. Punto de partida: nivel 1 + nivel 2 de hoy.
2. Para cada semana (de lunes a domingo, `Semana del …`):
   - Entradas: cheques de terceros que vencen.
   - Salidas: cheques emitidos, bolsa, compromisos y facturas que vencen.
   - `saldo final = saldo inicial + entradas − salidas`.
3. Marcar la **primera semana con saldo final por debajo del colchón** (o negativo): es la que
   "falta". Decir cuánto falta y qué la provoca (los vencimientos más grandes de esa semana).
4. Mostrar también la versión sin contar los cheques de terceros (por si se rechazan o se
   demoran): es la proyección prudente.

**Colchón sugerido:** lo que sale en una semana normal (promedio de salidas de las últimas 8 a
12 semanas), o el que fije la empresa.

## Cómo cubrir un faltante

1. Adelantar el rescate del FCI (la plata deja de rendir solo los días que se adelanta).
2. Negociar cheques de terceros en cartera.
3. Negociar cheques o pagarés propios.

Entre rescatar y negociar, usar la comparación de **time-value-of-money**: conviene rescatar si
la TNA del FCI es menor que la TNA de bolsa.

## Indicadores

| Indicador | Fórmula |
|---|---|
| Cobertura a 30 días | `(cuentas + FCI) ÷ salidas de los próximos 30 días` (≥ 1 alcanza) |
| Días de caja | `(cuentas + FCI) ÷ salida diaria promedio` |
| Concentración | Salidas de la semana más pesada ÷ salidas del mes |

## Errores comunes

- Contar dos veces: un cheque de bolsa también puede figurar como cheque emitido; usar el `ID`
  o el número para no duplicarlo.
- Tomar saldos viejos sin avisar la fecha del último saldo informado.
- Contar cheques de terceros rechazados, anulados o caducados como entradas.
- Usar el `Monto Estimado` de un compromiso como si fuera seguro: avisar que es estimado.
- Sumar dólares a pesos.

## Relacionadas

- **time-value-of-money**: costo de negociar y "¿Rescatar o negociar?".
- **return-calculations**: TNA real del FCI.
- **reconciliation**: confirmar que los saldos de partida coinciden con el banco.
