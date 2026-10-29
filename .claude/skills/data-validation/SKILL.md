---
name: data-validation
description: "Revisar un análisis, tablero, reporte o respuesta con números de Tesorería antes de mostrarlo o publicarlo: que los totales cierren, que no haya duplicados por cruces de hojas, que los promedios estén bien ponderados, que los períodos sean comparables, que no se mezclen monedas y que los números sean razonables. Usar al terminar un tablero nuevo, un reporte PDF o Excel, una respuesta rápida de Amaroki, o cuando alguien dice 'este número no me cierra'."
---

# Revisar un análisis antes de mostrarlo

## Lista de control

**Datos**
- [ ] Se usaron las hojas correctas y el período pedido.
- [ ] Cantidad de registros usados y descartados (inválidos, dudosos, anulados).
- [ ] Fecha del dato más reciente (saldo, FCI, cotización).
- [ ] Pesos y dólares por separado.
- [ ] Sin duplicados (ver **data-quality**).

**Cálculos**
- [ ] Los totales parciales suman el total.
- [ ] Promedios de tasas **ponderados** (`Σ costo ÷ Σ (recibido × días) × 365`), no promedio de
      promedios.
- [ ] Convenciones de la app: TNA sobre 365, días corridos (ver **time-value-of-money**).
- [ ] Signos: egresos negativos, notas de crédito negativas.
- [ ] Redondeo solo al mostrar, no en los pasos intermedios.

**Razonabilidad**
- [ ] El orden de magnitud tiene sentido (una TNA de 400 % o un saldo de miles de millones
      merece una segunda mirada).
- [ ] Comparar contra otro número conocido: el saldo total contra el tablero de Inicio, el
      total de cheques contra la pestaña Cheques.
- [ ] Ver uno o dos casos a mano de punta a punta.

**Presentación**
- [ ] Formato argentino: `$ 1.234.567,89`, `35,4 %`, fechas `dd/mm/aaaa`.
- [ ] Título y aclaración dicen qué período y qué se incluye ("sin cheques rechazados", "últimos
      90 días").
- [ ] Si hay pocos datos, decirlo.

## Trampas típicas

| Trampa | Ejemplo en Tesorería | Cómo evitarla |
|---|---|---|
| Cruce que multiplica filas | Unir cheques con bolsa por número y que un número se repita entre bancos | Cruzar por banco + número + importe, y contar filas antes y después |
| Período incompleto | Comparar el mes en curso con meses cerrados | Marcarlo como "en curso" o comparar a igual cantidad de días |
| Denominador que cambia | "% de cheques rechazados" con distintos totales según el filtro | Dejar fijo qué cuenta como total |
| Promedio de promedios | TNA del semestre como promedio de TNA mensuales | Sumar costos y bases |
| Zona horaria | Fechas de Apps Script en UTC que pasan al día anterior | Usar fechas sin hora o la zona `America/Argentina/Buenos_Aires` |
| Sesgo de supervivencia | Calcular la TNA solo con cheques que tienen recibido cargado | Informar cuántos quedaron afuera |

## Señales de alarma

- Un resultado que cambia mucho al mover un día el período.
- Totales exactamente redondos donde no deberían serlo.
- Un banco o ALYC que concentra casi todo de golpe.
- Números negativos donde solo puede haber positivos.

## Al entregar

Decir en una o dos líneas qué datos se usaron, de qué fecha, qué se dejó afuera y por qué.

## Relacionadas

- **data-quality**: reglas sobre los datos de origen.
- **statistics-fundamentals**: promedios, atípicos y pocos datos.
