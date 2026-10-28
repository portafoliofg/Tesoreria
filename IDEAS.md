# Ideas para Tesorería

Ideas de mejoras conversadas, para retomarlas. Las **elegidas** son las próximas a hacer.

## Elegidas

### 1. FCI contra costo de bolsa (cuándo conviene rescatar)
Cruzar la TNA real del FCI (rendimiento con los saldos de Saldos) con la TNA que se paga al
negociar cheques en bolsa (costo de bolsa). Si la bolsa sale más cara que lo que rinde el fondo,
avisar cuánto se ahorra rescatando en vez de negociar:

> "Te estás financiando en bolsa al 33% y el FCI rinde 27%. Rescatar $ X para no negociar el
> próximo cheque te ahorra $ Y."

- Dónde: tablero de FCI y Bolsa (una tarjeta en cada solapa) y como aviso en Inicio.
- Con qué: `calcularRendimientoFciSaldos` / `tnaVentana` (FCI) y `costoBolsa` / `costoBolsaResumen` (bolsa).
- Detalle: comparar con la tasa de los cheques más recientes (no el promedio histórico) y
  considerar el plazo (un rescate deja de rendir los mismos días que dura el cheque).
- Amaroki: respuesta rápida "¿me conviene rescatar o negociar?".

### 3. Simulador de negociación de cheques
Ingresando importe, días (o fecha de pago) y la tasa que ofrece la ALYC, mostrar:
- Lo que se recibe y el costo en pesos.
- Cómo queda esa tasa contra el promedio propio, contra cada ALYC y contra lo que rinde el FCI (idea 1).
- También al revés: con el importe que hace falta recibir, qué nominal hay que negociar.

- Dónde: botón "Simular" en la solapa Bolsa (modal), con el resultado al lado del promedio de la ALYC.
- Con qué: la misma fórmula de `costoBolsa`: TNA = (nominal ÷ recibido − 1) × 365 ÷ días.

## Más adelante

- Ver si la plata alcanza para los pagos que vienen (cheques emitidos y bolsa contra cuentas + FCI), avisando qué semana falta.
- Tasa de referencia (plazo fijo, caución) cargada a mano para comparar el FCI.
- Amaroki: entender repreguntas ("¿y en noviembre?") sin Gemini; más respuestas rápidas (deuda en bolsa, ALYC más barata, ingresos y egresos del mes).
- Parte diario por WhatsApp a la mañana.
- Salida de cheques desde el archivo del banco (Excel / CSV / PDF) en vez de foto.
- Importar saldos desde el extracto del banco.
- Dividir `src/Index.html` en varios archivos.
