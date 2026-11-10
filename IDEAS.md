# Ideas para Tesorería

Ideas de mejoras conversadas, para retomarlas. Las **elegidas** son las próximas a hacer.

**Alcance:** todo es para Tesorería (la app de este repositorio, con sus pestañas, incluida FCI y Bolsa).
No se toca la plataforma de **Inversiones** (el cartel de bgpsammar.com que abre `azevo.onrender.com`)
ni su enlace en `docs/index.html`.

## Hechas

- **Análisis** (menú Análisis, donde estaba Calendario): tres grupos de pestañas. Gastos: rubros y
  subrubros, centros de costo, fijo y variable, reglas de clasificación y sin clasificar. Estadísticas:
  mes contra mes, gasto en dólares, proveedores, estacionalidad y costo financiero. Mediciones:
  presupuesto, días de caja, plazos de pago y cobro, acierto del flujo, cheques rechazados y plata ociosa.
  No cambia los movimientos; la configuración (reglas, presupuesto…) es compartida (`Analisis.gs`).
- **Suscripción a Google Calendar** (botón Google Calendar en Saldos y flujo): enlace secreto iCal
  (`Calendario.gs`) con lo que vence cada día; no le pide permisos nuevos al script y se puede regenerar.
  La vista Calendario (mes a mes) se quitó al sumar Análisis.
- **¿Rescatar o negociar?** (tablero de Bolsa; el de FCI se quitó): TNA real del FCI contra la TNA reciente de
  bolsa, cuánto se ahorra por cada $ 1 M a 30 días, lo que pasó en 90 días y si el FCI cubre lo que
  vence en 30 días.
- **Simulador de negociación** (botón "Simular un cheque" en Bolsa): recibido o nominal, costo, TNA y
  TEA, comparado con el promedio propio, cada ALYC y el FCI.
- **ALYC mes a mes** (tablero de Bolsa): TNA de cada ALYC por mes y lo negociado, diferencia entre la
  más cara y la más barata, y mapa de tasas de los últimos 6 meses.

- **Inicio para la carga**: planilla de saldos tipo Excel (coma decimal, punto del teclado numérico,
  Tab, formato número) y "Rendimiento del día" de los FCI con saldo, en vivo; métricas plegadas.
- **FCI**: TNA por días de devengamiento hábiles (o corridos), cierres y rendimientos calculados en el
  listado, saldo desde la entrada manual y fondos sugeridos en la carga masiva.
- **Cheques**: filtros rápidos por solapa, concepto en pagados, conceptos históricos, imagen al
  portapapeles; el listado de e-cheqs actualiza los ya cargados.
- **Mercados** (solo para el dueño, `src/Mercados.gs`): pronóstico de si una acción le gana o pierde contra su
  índice (Merval para las .BA, S&P 500 para el resto), con los motivos de cada lado. Suma indicadores calculados con
  datos (tendencia 12-1, máximo de 52 semanas, rebote, medias, RSI, volumen, balance, analistas, riesgo país, brecha
  con el ADR) en un puntaje propio, la tasa base y el rango normal de movimiento, el historial propio, tres respuestas
  de Gemini (mayoría) y una probabilidad para medir la calibración. Se verifica solo al vencer el plazo contra el
  índice, y se compara con "siempre mejor", una regla de tendencia y el puntaje propio (con margen de error).
- **Filtros por columna** como Excel en todas las tablas, **Posición al** (31/12) y **Parte del día**
  para WhatsApp (4 imágenes).

Pendiente de estas: respuesta rápida de Amaroki "¿me conviene rescatar o negociar?".

## Más adelante

- Ver si la plata alcanza para los pagos que vienen (cheques emitidos y bolsa contra cuentas + FCI), avisando qué semana falta.
- Tasa de referencia (plazo fijo, caución) cargada a mano para comparar el FCI.
- Amaroki: entender repreguntas ("¿y en noviembre?") sin Gemini; más respuestas rápidas (deuda en bolsa, ALYC más barata, ingresos y egresos del mes).
- Salida de cheques desde el archivo del banco (Excel / CSV / PDF) en vez de foto.
- Importar saldos desde el extracto del banco.
- Dividir `src/Index.html` en varios archivos.
