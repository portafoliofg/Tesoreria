---
name: performance-metrics
description: "Comparar inversiones de Tesorería teniendo en cuenta el riesgo y la estabilidad, no solo la tasa: volatilidad del rendimiento diario de cada FCI, caída máxima, días con rendimiento negativo, rendimiento contra una tasa de referencia (plazo fijo, caución), ratio de Sharpe y Sortino, y estabilidad de la TNA de cada ALYC. Usar al preguntar 'qué fondo es mejor', 'cuál rinde más estable', 'este fondo vale la pena', 'qué banco conviene', 'qué ALYC es más barata y más pareja', o al agregar indicadores a la pestaña FCI y Bolsa."
---

# Indicadores de rendimiento y riesgo

En Tesorería las inversiones son de corto plazo (FCI de liquidez o renta fija corta, cheques en
bolsa). Lo importante es **cuánto rinde, qué tan estable es y si alguna vez pierde**. Los ratios
de carteras de acciones (beta, Treynor, captura alcista y bajista) casi nunca aplican.

## Datos de partida

- **FCI:** los períodos de `calcularRendimientoFci` (rendimiento ÷ capital ÷ días = tasa diaria
  de cada período). Descartar los dudosos. Ver **return-calculations**.
- **Bolsa:** la TNA de cada cheque (`costoBolsa`) con su ALYC y su fecha de carga.
- **Tasa de referencia:** la que se cargue a mano (plazo fijo, caución). Mientras no exista,
  usar la TNA de bolsa como costo alternativo o comparar fondos entre sí.

## Indicadores útiles

| Indicador | Cómo se calcula | Qué dice |
|---|---|---|
| TNA del período | `Σ rendimiento ÷ Σ (capital × días) × 365` | Cuánto rindió |
| Volatilidad anualizada | Desvío estándar de las tasas diarias × √365 | Qué tan parejo rinde |
| Días o períodos negativos | Cantidad y porcentaje con rendimiento < 0 | Si alguna vez pierde |
| Caída máxima | Mayor baja desde un máximo de la serie de valor acumulado | Peor momento |
| Exceso sobre referencia | `TNA fondo − TNA referencia` | Si conviene frente a lo seguro |
| Sharpe | `(TNA fondo − TNA referencia) ÷ volatilidad anualizada` | Rendimiento extra por unidad de variación |
| Sortino | Como Sharpe, pero con el desvío solo de los días bajo la referencia | Castiga solo las bajas |
| Estabilidad de una ALYC | Desvío de la TNA de sus cheques por mes y diferencia contra la más barata | Si es barata siempre o solo a veces |

Para la serie de valor acumulado de un fondo, encadenar: `valor_t = valor_{t−1} × (1 + R_t)`
empezando en 100.

## Cómo comparar dos fondos

1. Misma ventana (por ejemplo 90 días) y misma moneda.
2. Primero la TNA. Si la diferencia es menor a 1 punto, mirar la estabilidad.
3. Volatilidad y días negativos: para la plata que se puede necesitar mañana, mejor el más parejo.
4. Liquidez: un fondo T+1 o T+2 no sirve para un pago de hoy aunque rinda más
   (ver **liquidity-management**).
5. Informar con cuántos períodos se calculó; con menos de 10 el resultado es poco confiable.

## Errores comunes

- Anualizar la volatilidad de períodos de distinto largo sin pasarlos antes a tasa diaria.
- Comparar ventanas distintas (30 días de un fondo contra 90 de otro).
- Calcular Sharpe con muy pocos datos o con períodos dudosos.
- Tomar como "mejor" al de mayor TNA sin mirar si tuvo días negativos.
- Usar el promedio simple de TNA de cheques en vez del ponderado por recibido × días.

## Relacionadas

- **return-calculations**: de dónde salen los rendimientos de cada período.
- **statistics-fundamentals**: desvío, mediana, tendencias.
- **time-value-of-money**: TNA de bolsa y comparación con el FCI.
