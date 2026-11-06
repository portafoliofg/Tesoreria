/**
 * Mercados — análisis cargados a mano (escritos por Claude, sin Gemini) el 06/11/2026.
 *
 * Son pronósticos a UN MES contra el índice (Merval para las .BA, S&P 500 para el resto), igual que los de
 * Gemini. El texto (inclinación, probabilidad, motivos) se escribió con búsquedas web de ese día y sin acceso a
 * precios en vivo; por eso la confianza es baja en todos. Los números (precio, índice, indicadores, tasa base,
 * banda) NO están acá: los calcula el servidor con Yahoo en el momento de cargarlos, así la verificación es real.
 *
 * Se cargan solos al abrir Mercados (de a tandas, para no pasar el tiempo de Apps Script). Cada uno tiene un ID
 * fijo ("cl-…"): si ya está en la hoja no se vuelve a cargar. En la estadística aparecen con su propio modelo
 * ("Claude (manual)") para poder compararlos con los de Gemini.
 * Para quitar la carga: borrar este archivo (Mercados.gs lo llama solo si existe).
 */

const MERC_CARGA_MODELO = 'Claude (manual)';
const MERC_CARGA_HORIZONTE = 'mes';

const MERC_FUENTES_ = {
  tech: { titulo: 'Finviz: la caída de las grandes tecnológicas lleva al Nasdaq a una fuerte baja semanal (oct. 2026)', url: 'https://finviz.com/news/412758/big-tech-turmoil-sends-nasdaq-to-a-steep-weekly-drop' },
  recap: { titulo: 'Resumen del mercado, 30/10/2026', url: 'https://www.alainguillot.com/stock-market-recap-october-30-2026/' },
  meta: { titulo: 'Reacciones a balances, 22/10/2026', url: 'https://earnings-watcher.com/wiki/earnings-reactions-2026-10-22' },
  reacc29: { titulo: 'Reacciones a balances, 29/10/2026', url: 'https://earnings-watcher.com/wiki/earnings-reactions-2026-10-29' },
  nvda: { titulo: 'Earnings Whispers: fecha del balance de Nvidia', url: 'https://www.earningswhispers.com/stocks/Nvda' },
  meli: { titulo: 'MercadoLibre: resultados del 3T 2026 (8-K, SEC)', url: 'https://www.sec.gov/Archives/edgar/data/0001099590/000109959026000027/meli-20260930xex991.htm' },
  vaca: { titulo: 'Mercado: YPF y Vista aceleran en Vaca Muerta y recortan deuda en 3T26', url: 'https://mercado.com.ar/finanzas/ypf-y-vista-aceleran-en-vaca-muerta-y-recortan-deuda-en-3t26' },
  petroleras: { titulo: 'Forbes Argentina: YPF, Vista o Pampa, cuál fue el mejor balance', url: 'https://www.forbesargentina.com/negocios/ypf-vista-o-pampa-fue-mejor-balance-petroleras-argentinas-n101623' },
  merval: { titulo: 'El Cronista: Merval rezagado, cuánto más pueden subir las acciones argentinas', url: 'https://www.cronista.com/finanzas-mercados/merval-rezagado-cuanto-mas-pueden-subir-las-acciones-argentinas-segun-esta-reconocida-consultora/' }
};

function mercM_(titulo, detalle, peso, descontado, porque) {
  return { titulo: titulo, detalle: detalle, peso: peso || 'medio', descontado: descontado || '', descontadoPorque: porque || '' };
}

// Motivos que se repiten.
const MERC_ARG_RIESGO = mercM_('Riesgo país y año preelectoral', 'Las acciones argentinas vienen castigadas por momentos con subas del riesgo país y el ruido de las elecciones de 2027; un rebrote golpea más a las de mayor beta.', 'medio', 'parcial', 'Parte de ese castigo ya se vio en las semanas previas a los balances.');
const MERC_ARG_REZAGO = mercM_('Merval rezagado contra los bonos', 'Según Delphos, la baja del riesgo país todavía no se trasladó al Merval: si se acomoda, las de mayor peso suelen liderar.', 'medio', 'no', 'Es una tesis de consultora, no algo que el precio ya refleje.');
const MERC_TECH_CAPEX = mercM_('Dudas por el gasto en inteligencia artificial', 'En octubre de 2026 el Nasdaq tuvo su peor mes desde marzo de 2025 por dudas sobre el retorno del gasto en IA de las grandes tecnológicas.', 'medio', 'parcial', 'La caída de octubre ya refleja buena parte de esa duda.');
const MERC_DEFENSIVA = mercM_('Rotación hacia defensivas', 'Si sigue la desconfianza con las tecnológicas, las de consumo masivo y baja volatilidad suelen comportarse mejor que el índice.', 'medio', 'parcial', 'Depende de que la rotación continúe; no es seguro.');
const MERC_REBOTE_TECH = mercM_('Rebote de las tecnológicas', 'Si noviembre trae alivio (por ejemplo, un buen balance de Nvidia), el índice sube liderado por tecnología y las defensivas quedan atrás.', 'medio', 'no', 'Todavía no pasó.');

/** Análisis: [símbolo de Yahoo, nombre, inclinación, probabilidad, resumen, motivos a favor, en contra, qué lo cambiaría, eventos, fuentes]. */
const MERC_CARGA = [
  ['AAPL', 'Apple', 'neutral', 50, 'Sin un motivo propio fuerte para separarse del S&P 500 en un mes: pesa casi como el índice y se mueve parecido. No pude confirmar el detalle de su último balance.',
    [mercM_('Perfil más defensivo dentro de tecnología', 'Servicios y recompras le dan estabilidad cuando el mercado castiga el gasto en IA de otras grandes.', 'medio', 'parcial', 'Es conocido.')],
    [mercM_('Poco crecimiento propio', 'Sin un catalizador claro de producto, le cuesta ganarle al índice si el mercado premia el crecimiento.', 'medio', 'si', 'El mercado lo sabe hace tiempo.')],
    ['Un rebote fuerte del Nasdaq (le iría parecido) o noticias sobre su estrategia de IA.'], [], ['tech']],
  ['AI', 'C3.ai', 'bajista', 42, 'Empresa chica de software de IA, con pérdidas y mucha volatilidad. En un clima de dudas con el software (ServiceNow decepcionó en octubre) es más probable que le vaya peor que al índice, aunque puede rebotar fuerte.',
    [mercM_('Rebotes violentos', 'Con mucha posición vendida y volatilidad, cualquier contrato grande o buena noticia la puede disparar.', 'medio', 'no', '')],
    [mercM_('Software de IA castigado', 'El mercado duda de que el software empresarial capture valor de la IA; las chicas y sin ganancias sufren más.', 'alto', 'parcial', 'Ya cayó, pero el clima sigue.'), mercM_('Pérdidas y dependencia de pocos clientes', 'Sigue sin ganancias, lo que pesa cuando suben las dudas.', 'medio', 'si', 'Conocido.')],
    ['Un balance con crecimiento acelerado o un contrato grande.'], [], ['tech', 'reacc29']],
  ['AMZN', 'Amazon', 'neutral', 48, 'Una fuente habla de un balance flojo (con ingresos +12 %) y de dudas por la inversión en IA. Buena parte ya se vio en la caída de fines de octubre: inclinación levemente negativa, sin convicción.',
    [mercM_('Ventas navideñas y AWS', 'La temporada de fin de año y la demanda de la nube pueden cambiar el ánimo.', 'medio', 'no', '')],
    [MERC_TECH_CAPEX, mercM_('Balance por debajo de lo esperado', 'Según una fuente, fue una rara decepción; después de un balance malo la acción suele seguir floja unas semanas.', 'medio', 'parcial', 'La primera reacción ya pasó.')],
    ['Datos fuertes de ventas de fin de año o de AWS.'], [], ['tech', 'recap']],
  ['BBD', 'Bradesco (ADR)', 'neutral', 50, 'Banco brasileño: lo mueven la tasa Selic (en baja) y el ánimo con Brasil después de las elecciones de octubre. Sin información firme de su último balance, no veo ventaja clara.',
    [mercM_('Baja de tasas en Brasil', 'Con la Selic bajando (13,75 % en septiembre), mejora el costo de fondeo y la morosidad.', 'medio', 'parcial', 'El mercado ya espera más bajas.')],
    [mercM_('Riesgo político y fiscal', 'El rumbo fiscal después de las elecciones puede mover fuerte a los bancos brasileños.', 'medio', 'no', '')],
    ['Una sorpresa fiscal en Brasil o un cambio en el ritmo de la Selic.'], [], []],
  ['COPX', 'Global X Copper Miners (ETF)', 'neutral', 50, 'Mineras de cobre: dependen del precio del cobre, que tiene oferta ajustada pero depende de China. Sin datos firmes del momento, lo dejo parecido al índice.',
    [mercM_('Oferta de cobre ajustada', 'Pocas minas nuevas y demanda por electrificación y centros de datos sostienen el precio.', 'medio', 'parcial', 'Tesis conocida.')],
    [mercM_('China y el ciclo global', 'Datos flojos de China o un dólar fuerte bajan el cobre y las mineras se mueven el doble.', 'medio', 'no', '')],
    ['Estímulos fuertes en China o una caída del dólar.'], [], []],
  ['EWZ', 'iShares MSCI Brazil (ETF)', 'neutral', 50, 'Brasil cerró octubre cerca de 175.700 puntos con el real alrededor de 5,34. La baja de la Selic ayuda, pero el frente fiscal y político después de las elecciones pesa. Sin ventaja clara contra el S&P 500.',
    [mercM_('Bajas de tasa y valuación barata', 'Brasil cotiza barato y la Selic tiene margen para bajar.', 'medio', 'parcial', 'Conocido.')],
    [mercM_('Riesgo fiscal y del real', 'Una suba del dólar contra el real le pega directo en dólares.', 'medio', 'no', '')],
    ['El anuncio del programa fiscal del nuevo gobierno.'], [], []],
  ['GOOGL', 'Alphabet', 'neutral', 47, 'Según una fuente, su balance desató parte de la venta de tecnológicas de fines de octubre (otra lo contradice). Inclinación apenas negativa por la duda con el gasto en IA, con baja convicción.',
    [mercM_('Valuación más baja que sus pares', 'Después de la caída cotiza a un múltiplo menor que otras grandes; puede atraer compradores.', 'medio', 'parcial', '')],
    [MERC_TECH_CAPEX, mercM_('Búsqueda frente a la IA', 'La duda sobre el negocio de búsqueda frente a los asistentes de IA reaparece con cada balance.', 'medio', 'si', 'Es un debate viejo.')],
    ['Señales de que la inversión en IA se convierte en ingresos.'], [], ['tech', 'recap']],
  ['KO', 'Coca-Cola', 'alcista', 54, 'Defensiva de baja volatilidad. Si la desconfianza con las tecnológicas sigue en noviembre, este tipo de acción suele ganarle al índice; si las tecnológicas rebotan, queda atrás.',
    [MERC_DEFENSIVA, mercM_('Negocio estable y dividendos', 'Precios que aguantan la inflación y dividendo creciente.', 'bajo', 'si', 'Conocido.')],
    [MERC_REBOTE_TECH],
    ['Un rebote fuerte de las tecnológicas.'], [], ['tech']],
  ['META', 'Meta Platforms', 'neutral', 48, 'Cayó alrededor de 7 % después del balance (22/10, según una fuente) por más gasto previsto. Parte del castigo ya pasó; sin un catalizador nuevo, lo veo parecido al índice con sesgo levemente negativo.',
    [mercM_('Castigo ya hecho', 'Después de una caída fuerte por gastos, si la publicidad sigue firme suele recuperar algo.', 'medio', 'parcial', '')],
    [mercM_('Más gasto en IA y centros de datos', 'El mercado castiga la suba de gastos sin ingresos inmediatos.', 'medio', 'parcial', 'La primera reacción ya pasó.')],
    ['Datos de publicidad de fin de año.'], [], ['meta', 'tech']],
  ['MSFT', 'Microsoft', 'neutral', 50, 'Pesa mucho en el S&P 500. Comparte la duda del gasto en IA pero tiene la nube como respaldo. No pude confirmar su último balance; sin ventaja clara.',
    [mercM_('Azure y clientes empresariales', 'La nube y el software empresarial le dan ingresos visibles por la IA.', 'medio', 'parcial', '')],
    [MERC_TECH_CAPEX],
    ['Noticias sobre la rentabilidad de la IA en Azure.'], [], ['tech']],
  ['NKE', 'Nike', 'neutral', 48, 'Sigue en un plan de recuperación con márgenes presionados por aranceles e inventarios. Sin un balance dentro del mes (el próximo suele ser a fines de diciembre), no espero que se despegue del índice; leve sesgo negativo.',
    [mercM_('Recuperación de marca', 'Si las ventas de fin de año muestran mejora, puede sorprender.', 'medio', 'no', '')],
    [mercM_('Márgenes y aranceles', 'Los aranceles y descuentos siguen presionando las ganancias.', 'medio', 'si', 'Conocido.')],
    ['Datos de ventas navideñas o un cambio en aranceles.'], [], []],
  ['NOW', 'ServiceNow', 'bajista', 45, 'Su balance de fines de octubre figura entre los que decepcionaron. Después de un balance malo la acción suele seguir floja unas semanas, y el software empresarial está bajo sospecha por la IA.',
    [mercM_('Calidad del negocio', 'Clientes grandes y contratos largos: si la caída fue exagerada, puede rebotar.', 'medio', 'no', '')],
    [mercM_('Balance flojo', 'Figuró entre los balances que reavivaron las dudas a fines de octubre.', 'alto', 'parcial', 'La primera caída ya pasó; el efecto suele durar semanas.'), MERC_TECH_CAPEX],
    ['Contratos grandes de IA anunciados o mejora de previsiones.'], [], ['recap', 'reacc29']],
  ['NU', 'Nu Holdings', 'neutral', 52, 'Banco digital de Brasil, México y Colombia: crece rápido y se beneficia de la baja de la Selic, pero depende del ánimo con Brasil. Cotizaba cerca de US$ 12,40 a fines de octubre. Leve sesgo positivo, sin convicción.',
    [mercM_('Crecimiento de clientes y baja de tasas', 'La baja de la Selic mejora su fondeo y la morosidad.', 'medio', 'parcial', '')],
    [mercM_('Riesgo Brasil', 'Un rebrote fiscal o político en Brasil le pega fuerte.', 'medio', 'no', '')],
    ['Su balance del 3T (suele ser a mediados de noviembre).'], [{ fecha: 'mediados de noviembre (aprox.)', evento: 'Balance del tercer trimestre', porQueImporta: 'Muestra morosidad y crecimiento en México.' }], []],
  ['NVDA', 'Nvidia', 'neutral', 50, 'Presenta balance alrededor del 17-18 de noviembre, dentro del plazo: el resultado define el mes. Viene superando lo esperado casi siempre, pero el listón es alto y octubre mostró dudas con el gasto en IA. Sin ventaja clara.',
    [mercM_('Historial de superar lo esperado', 'Superó el consenso en 7 de los últimos 8 trimestres.', 'medio', 'parcial', 'El mercado lo espera.')],
    [MERC_TECH_CAPEX],
    ['El balance y sus previsiones de ventas para centros de datos.'], [{ fecha: '17 o 18/11/2026', evento: 'Balance del trimestre a octubre', porQueImporta: 'Suele mover la acción más de 5 % y arrastrar a todo el sector.' }], ['nvda', 'tech']],
  ['PAGS', 'PagSeguro', 'neutral', 49, 'Medios de pago en Brasil: competencia fuerte y dependencia de las tasas. La baja de la Selic ayuda, pero no tengo información de su último balance. Parecido al índice.',
    [mercM_('Baja de tasas', 'Le baja el costo de fondeo de los adelantos a comercios.', 'medio', 'parcial', '')],
    [mercM_('Competencia y Brasil', 'Pierde terreno frente a bancos digitales y depende del ánimo con Brasil.', 'medio', 'si', 'Conocido.')],
    ['Su balance del 3T (mediados de noviembre).'], [], []],
  ['PEP', 'PepsiCo', 'alcista', 53, 'Igual que Coca-Cola: defensiva que suele ganarle al índice si sigue la desconfianza con las tecnológicas. Tiene además presión por bajas de volumen en snacks.',
    [MERC_DEFENSIVA],
    [MERC_REBOTE_TECH, mercM_('Volúmenes flojos en snacks', 'El consumo de snacks viene débil en EE.UU.', 'medio', 'si', 'Conocido.')],
    ['Un rebote fuerte de las tecnológicas.'], [], ['tech']],
  ['V', 'Visa', 'alcista', 53, 'Negocio muy estable que crece con el consumo y menos sensible a la discusión de la IA. En un mercado nervioso con las tecnológicas, suele comportarse algo mejor que el índice.',
    [mercM_('Crecimiento estable', 'Comisiones que crecen con el gasto con tarjeta y los viajes.', 'medio', 'si', 'Conocido.'), MERC_DEFENSIVA],
    [mercM_('Riesgo regulatorio', 'Juicios o leyes sobre comisiones de tarjetas en EE.UU.', 'bajo', 'no', '')],
    ['Una ley sobre comisiones de tarjetas o un rebote fuerte de las tecnológicas.'], [], []],
  ['VALE', 'Vale (ADR)', 'neutral', 49, 'Depende del mineral de hierro y de China. Cayó 1,3 % el 27/10. Sin datos firmes del momento del mineral, la dejo parecida al índice.',
    [mercM_('Dividendos altos y valuación baja', 'Cotiza barata y paga buenos dividendos.', 'medio', 'si', 'Conocido.')],
    [mercM_('China y el acero', 'La construcción en China sigue floja; eso baja el mineral de hierro.', 'medio', 'parcial', '')],
    ['Estímulos en China.'], [], []],
  ['MELI', 'MercadoLibre', 'alcista', 56, 'Presentó el 04/11 un 3T fuerte en ventas (ingresos +45 %, volumen de pagos +53 %) pero con margen operativo bajo (6,3 %) por la inversión en crédito y logística. Venía cayendo en el año, así que hay margen si el mercado se enfoca en el crecimiento.',
    [mercM_('Crecimiento muy alto', 'Ingresos +45 % y volumen de pagos +53 % interanual en el 3T 2026.', 'alto', 'parcial', 'Recién se conoció el 04/11.'), mercM_('Venía rezagada', 'Antes del balance acumulaba caída en el año: menos expectativa incorporada.', 'medio', 'parcial', '')],
    [mercM_('Márgenes bajos', 'Margen operativo de 6,3 %: si el mercado se fija en la rentabilidad, castiga.', 'medio', 'parcial', 'Se conoció junto con el balance.'), mercM_('Riesgo de crédito', 'La cartera de préstamos crece rápido en México, Brasil y Argentina.', 'medio', 'no', '')],
    ['Una reacción negativa sostenida al margen o problemas de morosidad.'], [], ['meli']],
  ['YPFD.BA', 'YPF', 'alcista', 56, 'Buen 3T 2026: ganancia de US$ 1.196 millones, EBITDA ajustado +84 % y deuda neta bajando a 0,8 veces el EBITDA. Antes del balance cayó por el castigo general a lo argentino. Le veo más chances de ganarle al Merval, con el petróleo como riesgo.',
    [mercM_('Balance fuerte y menos deuda', 'Ganancia de US$ 1.196 millones y apalancamiento de 0,8 veces, desde 1,1 en el 2T.', 'alto', 'parcial', 'Recién publicado.'), MERC_ARG_REZAGO],
    [mercM_('Precio del petróleo', 'Una baja del crudo pega en sus ingresos y en el ánimo.', 'medio', 'no', ''), MERC_ARG_RIESGO],
    ['Una caída fuerte del petróleo o un salto del riesgo país.'], [], ['vaca', 'petroleras', 'merval']],
  ['VIST.BA', 'Vista Energy', 'alcista', 56, 'Récord trimestral de producción, ingresos (+75 %) y EBITDA en el 3T 2026, con recompra de acciones por US$ 55 millones. Es de lo más sólido del panel, con el petróleo como riesgo principal.',
    [mercM_('Récord de producción y recompras', 'Ingresos de US$ 1.234 millones (+75 %) y US$ 55 millones en recompras.', 'alto', 'parcial', 'Recién publicado.')],
    [mercM_('Precio del petróleo', 'Es de las más sensibles al crudo.', 'medio', 'no', ''), MERC_ARG_RIESGO],
    ['Una caída fuerte del petróleo.'], [], ['vaca', 'petroleras']],
  ['PAMP.BA', 'Pampa Energía', 'neutral', 52, 'Buen 3T (ventas en dólares +33 %, EBITDA +23 %), pero menos explosivo que YPF y Vista. Leve sesgo positivo contra el Merval, sin convicción.',
    [mercM_('Balance sólido', 'Ventas +33 % y EBITDA +23 % en dólares.', 'medio', 'parcial', 'Recién publicado.')],
    [MERC_ARG_RIESGO],
    ['Cambios en tarifas eléctricas o de gas.'], [], ['petroleras']],
  ['TGSU2.BA', 'Transportadora de Gas del Sur', 'neutral', 51, 'Se beneficia del crecimiento de Vaca Muerta (transporte y procesamiento de gas), pero parte del negocio es regulado. Sin información de su último balance; parecido al Merval.',
    [mercM_('Crecimiento de Vaca Muerta', 'Más gas para transportar y procesar.', 'medio', 'si', 'Conocido.')],
    [mercM_('Tarifas reguladas', 'Depende de las decisiones del gobierno sobre tarifas.', 'medio', 'no', '')],
    ['Una decisión sobre tarifas de transporte de gas.'], [], []],
  ['TGNO4.BA', 'Transportadora de Gas del Norte', 'neutral', 50, 'Transporte de gas con tarifa regulada y poca liquidez: se mueve por las decisiones de tarifas más que por el mercado. Sin ventaja clara.',
    [mercM_('Actualización de tarifas', 'Las subas de tarifas mejoran sus resultados.', 'medio', 'parcial', '')],
    [mercM_('Poca liquidez', 'Con poco volumen, movimientos grandes sin noticias.', 'bajo', 'si', '')],
    ['Una resolución de tarifas del ENARGAS.'], [], []],
  ['CEPU.BA', 'Central Puerto', 'neutral', 49, 'Generadora eléctrica: depende de la normalización del mercado eléctrico y de las tarifas. Sin información de su último balance; parecido al Merval.',
    [mercM_('Normalización del sector eléctrico', 'Contratos libres y menos intervención mejoran sus ingresos.', 'medio', 'parcial', '')],
    [MERC_ARG_RIESGO],
    ['Cambios en la regulación eléctrica.'], [], []],
  ['GGAL.BA', 'Grupo Financiero Galicia', 'neutral', 48, 'Los bancos son los más sensibles al riesgo país y a la morosidad del crédito. Su balance del 3T suele salir a fines de noviembre, dentro del plazo. Leve sesgo negativo, sin convicción.',
    [MERC_ARG_REZAGO],
    [mercM_('Morosidad del crédito', 'Después de la fuerte suba de préstamos, la mora es el punto a mirar en los balances de bancos.', 'medio', 'parcial', ''), MERC_ARG_RIESGO],
    ['Un balance con mora controlada o una baja fuerte del riesgo país.'], [{ fecha: 'fines de noviembre (aprox.)', evento: 'Balance del tercer trimestre', porQueImporta: 'La mora y la rentabilidad definen el ánimo con los bancos.' }], ['merval']],
  ['SUPV.BA', 'Grupo Supervielle', 'bajista', 46, 'Banco más chico y de mayor volatilidad que Galicia: cuando el riesgo país sube o la mora preocupa, suele perder más que el Merval. Balance esperado a fines de noviembre.',
    [mercM_('Rebote de alto beta', 'Si baja el riesgo país, es de las que más sube.', 'medio', 'no', '')],
    [mercM_('Más sensible a la mora y al riesgo', 'Su cartera es más riesgosa y su rentabilidad más frágil.', 'medio', 'parcial', ''), MERC_ARG_RIESGO],
    ['Una baja fuerte del riesgo país.'], [{ fecha: 'fines de noviembre (aprox.)', evento: 'Balance del tercer trimestre', porQueImporta: 'Muestra la mora y la rentabilidad.' }], []],
  ['CRES.BA', 'Cresud', 'neutral', 50, 'Agro e inmobiliario (controla IRSA): depende de los precios agrícolas, las retenciones y el negocio inmobiliario. Sin ventaja clara.',
    [mercM_('Baja de retenciones', 'Cualquier baja de retenciones mejora sus ingresos agrícolas.', 'medio', 'no', '')],
    [mercM_('Precios agrícolas', 'Granos flojos en el mundo.', 'medio', 'parcial', '')],
    ['Un anuncio sobre retenciones.'], [], []],
  ['IRSA.BA', 'IRSA', 'neutral', 50, 'Centros comerciales y oficinas: se beneficia de la recuperación del consumo y del crédito hipotecario, pero depende del consumo. Parecido al Merval.',
    [mercM_('Recuperación del consumo y del crédito', 'Más ventas en shoppings y más demanda de inmuebles.', 'medio', 'parcial', '')],
    [MERC_ARG_RIESGO],
    ['Datos de consumo.'], [], []],
  ['COME.BA', 'Sociedad Comercial del Plata', 'neutral', 48, 'Holding diversificado y muy líquido entre los minoristas, con resultados irregulares. Se mueve mucho por flujo de pequeños inversores; leve sesgo negativo, sin convicción.',
    [mercM_('Activos subvaluados', 'Su valor de libros y sus participaciones pueden atraer compradores.', 'bajo', 'si', '')],
    [mercM_('Resultados irregulares', 'Ganancias poco previsibles de sus negocios.', 'medio', 'si', '')],
    ['Venta de algún activo o un balance sorpresivo.'], [], []],
  ['ECOG.BA', 'Ecogas', 'neutral', 50, 'Distribución de gas (Centro y Cuyo) con tarifa regulada: depende de las actualizaciones de tarifas. Sin ventaja clara.',
    [mercM_('Actualización de tarifas', 'Las subas mensuales de tarifas mejoran su rentabilidad.', 'medio', 'parcial', '')],
    [mercM_('Riesgo regulatorio', 'Un congelamiento de tarifas en un año preelectoral le pegaría.', 'medio', 'no', '')],
    ['Una decisión sobre tarifas.'], [], []],
  ['HARG.BA', 'Holcim Argentina', 'neutral', 49, 'Cemento: sigue la obra pública (recortada) y la construcción privada. Sin datos firmes del despacho de cemento reciente; parecido al Merval.',
    [mercM_('Recuperación de la construcción privada', 'El crédito hipotecario impulsa la construcción privada.', 'medio', 'parcial', '')],
    [mercM_('Menos obra pública', 'El recorte de obra pública limita el volumen.', 'medio', 'si', 'Conocido.')],
    ['Datos de despacho de cemento.'], [], []],
  ['METR.BA', 'Metrogas', 'neutral', 50, 'Distribuidora de gas del AMBA controlada por YPF: tarifas reguladas y posibles cambios de dueño. Sin ventaja clara.',
    [mercM_('Tarifas y posible venta', 'Las subas de tarifas y la venta de la participación de YPF pueden darle impulso.', 'medio', 'no', '')],
    [mercM_('Riesgo regulatorio', 'Un congelamiento de tarifas le pegaría.', 'medio', 'no', '')],
    ['Noticias sobre la venta de Metrogas o sobre tarifas.'], [], []],
  ['TRAN.BA', 'Transener', 'neutral', 50, 'Transporte eléctrico regulado, con planes de obras de transmisión. Depende de las tarifas y de las licitaciones. Sin ventaja clara.',
    [mercM_('Obras de transmisión', 'Las nuevas obras pueden sumar ingresos.', 'medio', 'no', '')],
    [mercM_('Tarifas reguladas', 'Depende de las revisiones tarifarias.', 'medio', 'parcial', '')],
    ['Resultados de licitaciones de transmisión.'], [], []],
  ['TXAR.BA', 'Ternium Argentina', 'bajista', 46, 'Acero: el precio internacional está flojo por la sobreoferta de China y la apertura de importaciones presiona a la industria local. Le veo más chances de quedar atrás del Merval.',
    [mercM_('Recuperación de la construcción y la industria', 'Más demanda local si la actividad repunta.', 'medio', 'no', '')],
    [mercM_('Acero chino y apertura de importaciones', 'La sobreoferta global y la competencia importada bajan precios y márgenes.', 'alto', 'parcial', 'Es un problema conocido pero sigue.')],
    ['Medidas antidumping o una suba del acero.'], [], []]
];

/** Carga los análisis que todavía no están en la hoja (de a tandas). Devuelve cuántos faltan todavía. */
function mercCargarManuales_() {
  if (!MERC_CARGA.length) return 0;
  const hoja = obtenerHoja_(MERC_HOJA, MERC_HEADERS);
  const ultima = hoja.getLastRow();
  const ids = {};
  if (ultima >= 2) hoja.getRange(2, 1, ultima - 1, 1).getValues().forEach(f => { ids[String(f[0])] = 1; });
  const faltan = MERC_CARGA.filter(x => !ids[mercIdManual_(x[0])]);
  if (!faltan.length) return 0;
  const inicio = Date.now();
  let cargados = 0;
  for (let i = 0; i < faltan.length; i++) {
    if (Date.now() - inicio > 45000 || cargados >= 12) break;
    try {
      const res = mercArmarManual_(faltan[i]);
      mercGuardar_(res, { 'Usuario': 'Claude' });
      cargados++;
    } catch (e) {
      console.log('Mercados · carga manual ' + faltan[i][0] + ': ' + e.message);
    }
  }
  // Si en esta tanda no se pudo cargar ninguno, no se insiste (la pantalla dejaría de esperar en vano).
  return cargados ? faltan.length - cargados : 0;
}

function mercIdManual_(simbolo) {
  return 'cl-' + String(simbolo).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Arma el análisis como lo haría mercAnalizar_, pero con el texto escrito acá en lugar de Gemini. */
function mercArmarManual_(x) {
  const simbolo = x[0], hId = MERC_CARGA_HORIZONTE, h = MERC_HORIZONTES[hId];
  const hoy = ahoraLocal().hoy;
  const grafico = mercGrafico_(simbolo);
  const ref = mercReferencia_(simbolo);
  const gRef = mercGrafico_(ref.simbolo);
  const resumenYahoo = mercYahooResumen_(simbolo);
  const busqueda = { sector: (resumenYahoo && resumenYahoo.sector) || '', industria: (resumenYahoo && resumenYahoo.industria) || '', bolsa: mercEsLocal_(simbolo) ? 'BUE' : '', noticias: [] };
  const tecnico = grafico.ok ? mercTecnico_(grafico) : null;
  const contexto = mercContexto_(simbolo, busqueda, grafico);
  const al = grafico.ok && gRef.ok ? mercAlinear_(grafico, gRef) : null;
  const extra = { yahoo: resumenYahoo, argentina: contexto.argentina, local: mercEsLocal_(simbolo), simbolo: simbolo, hoy: hoy };
  if (contexto.argentina) extra.riesgo = mercRiesgoPais_();
  if (MERC_PAR_ADR[simbolo.toUpperCase()]) extra.brecha = mercBrechaAdr_(simbolo.toUpperCase(), grafico);
  const cuant = al ? mercSenales_(al, al.fechas.length - 1, hId, extra) : null;
  const base = al ? mercTasaBase_(al, al.fechas.length - 1, h.ruedas) : null;
  const incl = x[2], prob = x[3];
  let sobre = 'Escrito sin ver estos indicadores (se calcularon al cargarlo).';
  if (cuant) sobre += cuant.direccion === incl ? ' Coinciden con el pronóstico.' : cuant.direccion === 'neutral' || incl === 'neutral' ? ' Los indicadores no contradicen de lleno el pronóstico.' : ' Los indicadores apuntan para el otro lado: tomalo con más cuidado.';
  return {
    id: mercIdManual_(simbolo),
    fecha: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
    simbolo: simbolo, nombre: x[1], horizonte: hId, horizonteNombre: h.nombre,
    inclinacion: incl, confianza: 'baja', probabilidad: prob,
    coincidencia: { votos: 1, total: 1, respuestas: [incl], probabilidades: [prob] },
    referencia: { simbolo: ref.simbolo, nombre: ref.nombre, precio: gRef.ok ? gRef.precio : null },
    resumen: x[4], motivosSuba: mercMotivos_(x[5]), motivosBaja: mercMotivos_(x[6]),
    queCambiaria: mercTextos_(x[7]), aMirar: [], escenarios: [], masProbable: '', eventos: mercEventos_(x[8]),
    contexto: contexto.lineas, argentina: contexto.argentina, sobreIndicadores: sobre,
    cuant: cuant, tasaBase: base, reglaTendencia: al ? mercReglaTendencia_(al, al.fechas.length - 1) : '',
    sector: busqueda.sector, mercado: mercMercado_(simbolo, busqueda.bolsa),
    precio: tecnico ? tecnico.precio : null, moneda: grafico.ok ? grafico.moneda : '',
    tecnico: tecnico ? tecnico.lineas : [], conNoticiasEnVivo: false,
    fuentes: (x[9] || []).map(k => MERC_FUENTES_[k]).filter(Boolean), modelo: MERC_CARGA_MODELO,
    verificarEl: sumarDias(hoy, h.dias)
  };
}
