---
name: time-value-of-money
description: "Tasas y valor del dinero en el tiempo con las convenciones de Tesorería: TNA, TEA, tasa por período, valor actual y descuento de cheques y pagarés negociados en una ALYC, costo de negociar, intereses de un plazo fijo o una caución, VAN, TIR y cuotas de un plan de pago. Usar cuando se pregunte o se programe algo sobre 'a qué tasa salió', 'cuánto recibo si negocio este cheque', 'qué nominal necesito', 'TNA vs TEA', 'tasa efectiva', 'conviene pagar contado o en cuotas', 'cuánto vale hoy', o al tocar el simulador de negociación, costoBolsa o '¿Rescatar o negociar?'. Para el rendimiento de los FCI usar return-calculations."
---

# Valor del dinero en el tiempo (Tesorería)

## Convenciones de la app (respetarlas siempre)

- **TNA con interés simple sobre 365 días.** Es como se informa en Argentina y como calcula toda
  la app (`src/Index.html`): `interés = capital × TNA × días ÷ 365`. Nunca 360 días.
- **Días corridos** entre dos fechas (`diasEntre`), no hábiles.
- **Porcentajes guardados como fracción** (0,35 = 35 %) y mostrados con `pctTexto`.
- **Pesos y dólares no se mezclan.** Los cheques en dólares (Moneda empieza con "US") quedan
  fuera de los promedios de tasa.
- Importes con `parseImporte` (acepta "1.234.567,89").

## Fórmulas

| Qué | Fórmula |
|---|---|
| Factor de un plazo | `factor = 1 + TNA × días ÷ 365` |
| Interés de un plazo | `capital × TNA × días ÷ 365` |
| Tasa del período | `TNA × días ÷ 365` |
| TEA (si se renueva a la misma tasa) | `factor ^ (365 ÷ días) − 1` |
| TNA desde una TEA | `((1 + TEA) ^ (días ÷ 365) − 1) × 365 ÷ días` |
| Tasa mensual equivalente desde TEA | `(1 + TEA) ^ (1 ÷ 12) − 1` |

### Cheques y pagarés negociados en bolsa (hoja Inversiones Bolsa)

La ALYC entrega hoy menos que el valor nominal y cobra el nominal al vencimiento.

- `días = Fecha de pago − Fecha de carga`
- `costo = nominal − recibido`
- `TNA = (nominal ÷ recibido − 1) × 365 ÷ días` (función `costoBolsa`)
- Recibido a partir de la TNA ofrecida: `recibido = nominal ÷ factor`
- Nominal que hace falta para recibir un importe: `nominal = recibido × factor`
- Un registro es inválido si `recibido > nominal`, si los días no son positivos o si falta el recibido.

**Promedio de varios cheques: ponderar por importe recibido × días**, no promediar las TNA:

`TNA promedio = Σ costo ÷ Σ (recibido × días) × 365` (funciones `tasaBolsaDesde` y `tasasPorAlyc`)

### Rescatar del FCI o negociar un cheque

Para un monto `M` durante `d` días:
- Negociar cuesta `M × TNA_bolsa × d ÷ 365`.
- Rescatar deja de ganar `M × TNA_FCI × d ÷ 365`.
- Conviene rescatar si `TNA_FCI < TNA_bolsa`. La diferencia por cada $ 1.000.000 a 30 días es
  `1.000.000 × (TNA_bolsa − TNA_FCI) × 30 ÷ 365`.

### VAN y TIR (planes de pago, contado contra cuotas)

- `VAN = Σ flujo_t ÷ (1 + r) ^ (días_t ÷ 365)`, con `r` como TEA y los días contados desde hoy.
- TIR: la tasa que deja el VAN en cero. Se busca por bisección o Newton-Raphson. Informarla como
  TEA y, si hace falta comparar con tasas de la app, convertirla a TNA para el plazo en cuestión.
- Contado contra cuotas: traer las cuotas a hoy con la tasa que rinde la plata (por ejemplo la
  TNA del FCI pasada a TEA). Si el valor actual de las cuotas es menor que el contado, conviene
  financiarse.

## Ejemplos

**1. Cheque de $ 1.000.000 a 60 días, la ALYC ofrece TNA 35 %**
```
factor   = 1 + 0,35 × 60 ÷ 365      = 1,057534
recibido = 1.000.000 ÷ 1,057534     = $ 945.595,85
costo    = 1.000.000 − 945.595,85   = $ 54.404,15  ($ 906,74 por día)
TEA      = 1,057534 ^ (365 ÷ 60) − 1 = 40,5 %
```

**2. Promedio ponderado de dos cheques**
```
A: nominal 1.000.000, recibido 945.000, 60 días → TNA 35,4 %
B: nominal   500.000, recibido 480.000, 30 días → TNA 50,7 %
Σ costo = 55.000 + 20.000 = 75.000
Σ recibido × días = 945.000 × 60 + 480.000 × 30 = 71.100.000
TNA promedio = 75.000 ÷ 71.100.000 × 365 = 38,5 %
```
El promedio simple de las TNA (43,0 %) exagera porque le da el mismo peso al cheque chico y corto.

**3. ¿Rescatar o negociar $ 5.000.000 por 30 días?** Bolsa al 38 %, FCI al 30 %:
```
negociar cuesta   5.000.000 × 0,38 × 30 ÷ 365 = $ 156.164
rescatar deja de ganar 5.000.000 × 0,30 × 30 ÷ 365 = $ 123.288
→ conviene rescatar: se ahorran $ 32.876
```

## Errores comunes

- Comparar una TNA con una TEA. Una TNA del 35 % a 60 días equivale a una TEA del 40,5 %.
- Usar 360 días o capitalizar diario: la app usa interés simple sobre 365.
- Promediar TNA sin ponderar (ver el ejemplo 2).
- Contar los días desde la fecha de emisión del cheque: en bolsa se cuentan desde la
  **Fecha de carga** (cuando se negoció) hasta la **Fecha de pago**.
- Anualizar plazos muy cortos sin avisar: un cheque a 3 días con un costo fijo da una TNA enorme.
- Mezclar cheques en pesos y en dólares en el mismo promedio.

## Relacionadas

- **return-calculations**: rendimiento y TNA real de los FCI con suscripciones y rescates.
- **liquidity-management**: si la plata alcanza para lo que vence.
