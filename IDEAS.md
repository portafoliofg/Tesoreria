# Ideas para Tesorería

Ideas de mejoras conversadas, para retomarlas. Las **elegidas** son las próximas a hacer.

**Alcance:** todo es para Tesorería (la app de este repositorio, con sus pestañas, incluida FCI y Bolsa).
No se toca la plataforma de **Inversiones** (el cartel de bgpsammar.com que abre `azevo.onrender.com`)
ni su enlace en `docs/index.html`.

## Hechas

- **Calendario de vencimientos** (menú Calendario): mes a mes, lo que vence cada día (cheques emitidos y
  de terceros, bolsa, compromisos y recordatorios con importe), con el detalle del día y un enlace por
  vencimiento para agregarlo a Google Calendar. Suscripción a Google Calendar con un enlace secreto
  (iCal, `Calendario.gs`): no le pide permisos nuevos al script; se puede regenerar.
- **¿Rescatar o negociar?** (tableros de FCI y de Bolsa): TNA real del FCI contra la TNA reciente de
  bolsa, cuánto se ahorra por cada $ 1 M a 30 días, lo que pasó en 90 días y si el FCI cubre lo que
  vence en 30 días.
- **Simulador de negociación** (botón "Simular un cheque" en Bolsa): recibido o nominal, costo, TNA y
  TEA, comparado con el promedio propio, cada ALYC y el FCI.
- **ALYC mes a mes** (tablero de Bolsa): TNA de cada ALYC por mes y lo negociado, diferencia entre la
  más cara y la más barata, y mapa de tasas de los últimos 6 meses.

Pendiente de estas: respuesta rápida de Amaroki "¿me conviene rescatar o negociar?".

## Más adelante

- Ver si la plata alcanza para los pagos que vienen (cheques emitidos y bolsa contra cuentas + FCI), avisando qué semana falta.
- Tasa de referencia (plazo fijo, caución) cargada a mano para comparar el FCI.
- Amaroki: entender repreguntas ("¿y en noviembre?") sin Gemini; más respuestas rápidas (deuda en bolsa, ALYC más barata, ingresos y egresos del mes).
- Parte diario por WhatsApp a la mañana.
- Salida de cheques desde el archivo del banco (Excel / CSV / PDF) en vez de foto.
- Importar saldos desde el extracto del banco.
- Dividir `src/Index.html` en varios archivos.
