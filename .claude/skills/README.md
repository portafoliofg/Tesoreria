# Skills de finanzas para Claude Code

Conocimiento financiero que Claude Code usa cuando trabaja en este repositorio (al programar,
revisar o analizar datos de Tesorería). **No** cambian la app ni a Amaroki: Amaroki usa Gemini
desde Apps Script y no lee esta carpeta. Apps Script tampoco la publica (solo sube `src/`).

Claude elige la skill solo, según la pregunta. También se puede pedir por nombre, por ejemplo
`/liquidity-management`.

Están en español y adaptadas a Tesorería: pesos y dólares por separado, TNA con interés simple
sobre 365 días, cheques y pagarés negociados en ALYC, FCI, facturas de ARCA, y las mismas hojas,
columnas y funciones que usa la app (`costoBolsa`, `tnaVentana`, `emparejar`, etc.).

## Qué hay y para qué sirve

| Skill | Para qué sirve |
|---|---|
| `time-value-of-money` | TNA, TEA, costo y TNA de un cheque negociado, promedio ponderado por ALYC, "¿Rescatar o negociar?", VAN y TIR de planes de pago. |
| `return-calculations` | Rendimiento y TNA real de los FCI con suscripciones y rescates, períodos dudosos, TWR y TIR. |
| `performance-metrics` | Comparar fondos y ALYC por rendimiento y estabilidad: volatilidad, días negativos, caída máxima, Sharpe. |
| `statistics-fundamentals` | Promedios ponderados, mediana, atípicos, tendencias, pocos datos: ALYC mes a mes, valores de propiedades. |
| `liquidity-management` | Ver si la plata alcanza semana a semana, qué semana falta y cómo cubrirla. |
| `reconciliation` | Conciliación bancaria como la hace la app, por qué no cierra, antigüedad de pendientes, FCI y bolsa. |
| `data-quality` | Validar importaciones y cargas: fechas, importes, duplicados, CUIT, saltos imposibles. |
| `invoice-organizer` | Leer y ordenar facturas argentinas (tipo, punto de venta, número, CUIT, neto, IVA, total, CAE). |
| `data-validation` | Lista de control antes de mostrar un tablero, reporte o respuesta con números. |

Son guías y fórmulas, no asesoramiento financiero. Si la app cambia una fórmula o una columna,
actualizar la skill correspondiente.

## Origen y licencia

Basadas en skills con licencia MIT (ver los archivos `LICENSE-*` de esta carpeta), traducidas y
reescritas para Tesorería:

- [JoelLewis/finance_skills](https://github.com/JoelLewis/finance_skills), commit `5c498ea`:
  `time-value-of-money`, `return-calculations`, `performance-metrics`, `statistics-fundamentals`,
  `liquidity-management`, `reconciliation`, `data-quality`.
- [w95/awesome-claude-corporate-skills](https://github.com/w95/awesome-claude-corporate-skills),
  commit `78dbc7c`: `invoice-organizer`, `data-validation`.
