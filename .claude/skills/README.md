# Skills de finanzas para Claude Code

Conocimiento financiero que Claude Code usa cuando trabaja en este repositorio (al programar,
revisar o analizar datos de Tesorería). **No** cambian la app ni a Amaroki: Amaroki usa Gemini
desde Apps Script y no lee esta carpeta. Apps Script tampoco la publica (solo sube `src/`).

Claude elige la skill solo, según la pregunta. También se puede pedir por nombre, por ejemplo
`/liquidity-management`.

## Qué hay y para qué sirve en Tesorería

| Skill | Origen | Para qué sirve acá |
|---|---|---|
| `time-value-of-money` | finance_skills | TNA, TEA, tasa efectiva por período, valor actual de un cheque, descuento y costo de negociar en bolsa, VAN y TIR. Base del simulador de negociación y de "¿Rescatar o negociar?". |
| `return-calculations` | finance_skills | Rendimiento de los FCI: por período, anualizado, ponderado por tiempo (TWR) y por dinero (TIR con suscripciones y rescates). |
| `performance-metrics` | finance_skills | Medir y comparar rendimientos con su riesgo (volatilidad, caída máxima, Sharpe) para los tableros de FCI y Bolsa. |
| `statistics-fundamentals` | finance_skills | Promedios, dispersión, correlación y regresiones: tasas de cada ALYC mes a mes, valores promedio de propiedades. |
| `liquidity-management` | finance_skills | Proyección de flujo de caja, colchón de liquidez y escalonado de vencimientos: la idea pendiente "ver si la plata alcanza" semana a semana. |
| `reconciliation` | finance_skills | Conciliar registros propios contra el banco o la ALYC: tolerancias, diferencias por fechas, antigüedad de las partidas abiertas. Sirve para importar extractos. |
| `data-quality` | finance_skills | Reglas de validación de datos importados (fechas, importes, duplicados, datos viejos) y manejo de excepciones. |
| `invoice-organizer` | awesome-claude-corporate-skills | Ordenar facturas y comprobantes (PDF o fotos): extraer proveedor, número, fecha e importe y renombrarlos de forma pareja. |
| `data-validation` | awesome-claude-corporate-skills | Revisar un análisis antes de compartirlo: si la lógica de agregación está bien, si los números cierran y si hay sesgos. |

## Tener en cuenta

- Están escritas para Estados Unidos (SEC, FINRA, dólares, ETF). Las fórmulas sirven igual, pero
  en Tesorería se usan las convenciones locales: pesos, TNA sobre 365 días, cheques y pagarés
  negociados en ALYC, FCI argentinos.
- Son guías y fórmulas, no asesoramiento financiero.
- Los scripts de Python (`scripts/`) son de referencia; necesitan `numpy` y algunos `scipy`.

## Origen y licencia

Copiadas sin cambios, ambas con licencia MIT (ver los archivos `LICENSE-*` de esta carpeta):

- [JoelLewis/finance_skills](https://github.com/JoelLewis/finance_skills), commit `5c498ea`.
- [w95/awesome-claude-corporate-skills](https://github.com/w95/awesome-claude-corporate-skills), commit `78dbc7c`.

Para actualizarlas, volver a copiar la carpeta de la skill desde el repositorio de origen.
