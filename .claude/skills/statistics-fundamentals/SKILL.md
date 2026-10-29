---
name: statistics-fundamentals
description: "Estadística aplicada a los datos de Tesorería: promedios ponderados y simples, mediana, desvío, valores atípicos, tendencias y regresiones simples, correlación, comparaciones mes a mes y por ALYC o banco, intervalos de confianza y cuándo hay pocos datos para concluir. Usar al analizar tasas de cada ALYC por mes, rendimientos de FCI, montos de cheques, valores promedio de propiedades por tipo de unidad, o al programar promedios, mapas de tasas o detección de datos raros."
---

# Estadística para Tesorería

## Reglas de decisión

- **Promedio de tasas: siempre ponderado** por lo que pesa cada operación
  (`Σ costo ÷ Σ (recibido × días) × 365` para cheques; `Σ rendimiento ÷ Σ (capital × días) × 365`
  para FCI). El promedio simple solo sirve para contar "cómo fue una operación típica".
- **Promedio de valores (propiedades, importes): mirar también la mediana.** Si difieren mucho,
  hay valores extremos y conviene mostrar la mediana o sacar los atípicos.
- **Desvío estándar con n − 1** (muestra).
- **Pocos datos:** con menos de 5 operaciones en un grupo (una ALYC en un mes, un tipo de
  unidad) mostrar el número de casos al lado y no sacar conclusiones fuertes.
- **Pesos y dólares por separado.** Para comparar meses con inflación, comparar tasas o
  porcentajes, no importes nominales.

## Herramientas

| Qué | Cómo |
|---|---|
| Valores atípicos | Fuera de `[Q1 − 1,5 × RIC, Q3 + 1,5 × RIC]` (RIC = Q3 − Q1) o a más de 3 desvíos de la mediana |
| Tendencia | Regresión lineal simple de la tasa contra el tiempo; pendiente en puntos por mes |
| Comparar dos grupos | Diferencia de promedios ponderados + cantidad de casos de cada uno; si hay muchos datos, intervalo de confianza o bootstrap |
| Correlación | Pearson para relación lineal (por ejemplo TNA de bolsa contra plazo); revisar el gráfico antes de creer el número |
| Bootstrap | Remuestrear con reposición 1.000 veces y tomar los percentiles 2,5 y 97,5 |

## Flujo de análisis

1. Limpiar: sacar inválidos (sin recibido, días ≤ 0, dudosos) y separar monedas.
2. Describir: cantidad, mínimo, máximo, mediana, promedio ponderado, desvío.
3. Buscar atípicos y revisar a mano los más grandes antes de descartarlos: muchas veces son un
   error de carga (ver **data-quality**).
4. Agrupar (por mes, ALYC, banco, tipo de unidad) y mostrar el número de casos de cada grupo.
5. Recién ahí comparar o buscar tendencias.

## Ejemplo: ALYC mes a mes

Para el mapa de tasas de los últimos 6 meses: por cada ALYC y mes, TNA ponderada y cantidad de
cheques. La "diferencia entre la más cara y la más barata" de un mes solo tiene sentido si las
dos tienen al menos 2 o 3 cheques ese mes; si no, marcar la celda como poco representativa.
Un cheque a muy pocos días con costo fijo puede dar una TNA altísima: es un atípico típico.

## Errores comunes

- Promedio de promedios: el promedio de las TNA mensuales no es la TNA del semestre.
- Comparar meses incompletos (el mes en curso) con meses cerrados sin aclararlo.
- Concluir con 1 o 2 casos.
- Tomar correlación como causa.

## Relacionadas

- **performance-metrics**: volatilidad y comparación de fondos.
- **data-validation**: revisar el análisis antes de mostrarlo.
