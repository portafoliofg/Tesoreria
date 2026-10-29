---
name: return-calculations
description: "Rendimiento de los FCI y de otras inversiones de Tesorería: cuánto rindió en pesos, TNA real entre saldos con suscripciones y rescates en el medio, rendimiento por período, mensual o anual, encadenado de períodos, rendimiento ponderado por tiempo (TWR) y por dinero (TIR), y períodos dudosos. Usar al preguntar 'cuánto rindió el FCI', 'qué tasa real dio cada banco', 'por qué la TNA da distinto', o al tocar calcularRendimientoFci, tnaVentana, rendimientoConjunto o el análisis de la pestaña FCI. Para tasas de cheques, VAN o TIR de un plan de pago usar time-value-of-money."
---

# Cálculo de rendimientos (FCI)

## Cómo lo calcula la app

Datos: hoja **Inversiones FCI** (`Fecha`, `Banco`, `Fondo`, `Movimiento`, `Monto`,
`Solicitud o rendimiento`) y saldos de tipo FCI en **Saldos**. `Movimiento` es SALDO,
suscripción o rescate.

Para cada banco y fondo, entre dos saldos consecutivos (`calcularRendimientoFci`):
```
flujos      = suscripciones − rescates del medio
capital     = saldo anterior + flujos
rendimiento = saldo nuevo − capital
días        = días corridos entre los dos saldos (mínimo 1)
```
- **Período dudoso** si el capital no es positivo o `|rendimiento ÷ capital| ÷ días > 0,003`
  (más de ~0,3 % por día). Casi siempre falta cargar un movimiento. No entra en la tasa.
- **TNA de una ventana** (`tnaVentana`): `Σ rendimiento ÷ Σ (capital × días) × 365`, solo con
  los períodos no dudosos que terminan dentro de la ventana.
- **Varios bancos juntos** (`rendimientoConjunto`): la misma fórmula sumando los de todos.
- Si el banco informa el rendimiento (`Solicitud o rendimiento`), se muestra al lado como control.

Es un rendimiento **ponderado por tiempo y capital** (parecido al método Modified Dietz con
valuación en cada saldo): las suscripciones y los rescates no inflan ni achican la tasa.

## Fórmulas generales

| Qué | Fórmula |
|---|---|
| Rendimiento de un período | `(saldo final − saldo inicial − flujos) ÷ (saldo inicial + flujos)` |
| Encadenar períodos (TWR) | `(1 + R1) × (1 + R2) × … − 1` |
| TNA desde un rendimiento | `R × 365 ÷ días` |
| TEA desde un rendimiento | `(1 + R) ^ (365 ÷ días) − 1` |
| Crecimiento anual compuesto | `(final ÷ inicial) ^ (365 ÷ días) − 1` |
| TIR (ponderado por dinero) | Tasa que deja en cero: −suscripciones + rescates + saldo final, descontados por fecha |

**TWR o TIR:** el TWR mide cómo rindió el fondo sin importar cuándo se puso o sacó plata; sirve
para comparar bancos y fondos. La TIR mide lo que ganó la empresa con sus propios movimientos.
Si se suscribió mucho justo antes de una baja, la TIR sale peor que el TWR.

## Ejemplo

Saldo del 1/10: $ 10.000.000. El 5/10 se suscriben $ 2.000.000 y el 10/10 se rescatan
$ 500.000. Saldo del 16/10: $ 11.620.000.
```
capital     = 10.000.000 + 2.000.000 − 500.000 = 11.500.000
rendimiento = 11.620.000 − 11.500.000         = $ 120.000
días        = 15
TNA         = 120.000 ÷ (11.500.000 × 15) × 365 = 25,4 %
control     = 120.000 ÷ 11.500.000 ÷ 15 = 0,07 % por día → no es dudoso
```
Sin restar la suscripción, el "rendimiento" daría $ 1.620.000, una TNA imposible: por eso
existe la marca de dudoso.

## Errores comunes

- Tomar la diferencia de saldos como rendimiento sin descontar suscripciones y rescates.
- Promediar las TNA de cada período en vez de sumar rendimientos y capital × días.
- Anualizar un período de uno o dos días: amplifica el ruido de redondeo del banco.
- Mezclar fondos en pesos y en dólares (`moneda === "USD"` va aparte).
- Comparar la TNA del FCI (interés que se reinvierte solo) con una TEA sin convertir.
- Contar dos veces un saldo cargado el mismo día: la app se queda con el último de ese día.

## Relacionadas

- **time-value-of-money**: TNA y TEA, cheques en bolsa, "¿Rescatar o negociar?".
- **performance-metrics**: comparar fondos teniendo en cuenta cuánto varían.
- **data-quality**: detectar movimientos que faltan o están duplicados.
