/**
 * Mercados — pronóstico justificado de una acción contra su índice (solo para el dueño).
 *
 * Archivo independiente. Para quitarlo: borrar este archivo y las líneas marcadas con
 * "MERCADOS" en Código.gs e Index.html.
 *
 * QUÉ SE PRONOSTICA: si la acción le va a ir MEJOR, PEOR o PARECIDO que a su índice de referencia
 * (Merval para las que cotizan en pesos con .BA; S&P 500 para el resto) en el plazo elegido.
 * Se mide contra el índice porque "subió" no dice nada: en pesos casi todo sube con la inflación,
 * y en EE.UU. el mercado sube más veces de las que baja. Decir siempre "sube" acertaría mucho sin saber nada.
 *
 * Para cada análisis se junta:
 *  - el precio de tres años (Yahoo Finance) de la acción y de su índice;
 *  - indicadores calculados acá, con respaldo en estudios de mercado (tendencia de 12 meses sin el último,
 *    cercanía al máximo de 52 semanas, rebote de corto plazo, medias, RSI, volumen; sorpresa del
 *    último balance y cambios de analistas si Yahoo los da; riesgo país y brecha con el ADR en Argentina).
 *    Con eso se arma un PUNTAJE PROPIO (de −1 a +1) que se guarda aparte del de Gemini;
 *  - la TASA BASE: en los últimos tres años, cuántas veces le ganó al índice en ese plazo y cuánto se
 *    mueve normalmente (el "rango normal": 2 de cada 3 veces quedó entre tal y tal);
 *  - el historial propio: cómo vienen saliendo los pronósticos, en general y con esa acción;
 *  - las noticias recientes (búsqueda de Google desde Gemini y, de respaldo, las de Yahoo).
 * Gemini responde varias veces (MERC_REPETICIONES): se toma lo que dice la mayoría y, si no coinciden,
 * baja la confianza. También da una PROBABILIDAD de ganarle al índice, que sirve para medir si está
 * bien calibrado (si dice 70 %, ¿acierta 7 de cada 10?).
 *
 * VERIFICACIÓN (al vencer el plazo, sola): exceso = rendimiento de la acción contra el del índice.
 *  - "mejor" (alcista) acierta si el exceso es positivo; "peor" (bajista) si es negativo;
 *  - "parecido" (neutral) si el exceso quedó dentro de la banda: medio movimiento normal de esa acción
 *    contra su índice en ese plazo (sale de su volatilidad, no es un porcentaje fijo).
 * Se compara contra lo que habrían sacado "siempre mejor que el índice", una regla de tendencia
 * simple y el puntaje propio; con margen de error (con pocos casos el porcentaje engaña) y sin contar
 * dos veces la misma acción analizada dentro del mismo plazo.
 *
 * La página habla con el servidor por la acción "mercados" de api():
 *   {op: 'estado'}                         → si está activo y la lista de horizontes.
 *   {op: 'analizar', simbolo, horizonte}   → pronóstico nuevo (y lo guarda).
 *   {op: 'historial'}                      → pronósticos guardados, verificando los vencidos, y estadística.
 *   {op: 'grafico', simbolo}               → precio del último año con sus medias (para el gráfico).
 *
 * Propiedades del script:
 *   GEMINI_API_KEY      (obligatoria, la misma del asistente).
 *   MERCADOS_USUARIOS   (opcional) usuarios que entran, separados por coma (el usuario de
 *                       ingreso o su ID). Si no está, entra solo el primer usuario creado.
 */

const MERC_HOJA = 'Mercados · Pronósticos';
// Las columnas nuevas van siempre al final: la hoja ya tiene datos con las primeras.
const MERC_HEADERS = ['ID', 'Fecha', 'Usuario', 'Símbolo', 'Nombre', 'Horizonte', 'Inclinación', 'Confianza',
  'Precio', 'Moneda', 'Resumen', 'Detalle', 'Fuentes', 'Verificar el', 'Precio al verificar', 'Variación', 'Resultado', 'Modelo',
  'Referencia', 'Precio referencia', 'Probabilidad', 'Puntaje', 'Señal cuantitativa', 'Banda', 'Sector', 'Mercado',
  'Coincidencia', 'Variación referencia', 'Exceso', 'Variación USD', 'Regla tendencia', 'Método'];
const MERC_PROP_USUARIOS = 'MERCADOS_USUARIOS';
const MERC_LIMITE_HORA = 15;
const MERC_HORIZONTES = {
  semana: { nombre: 'Una semana', dias: 7, ruedas: 5, umbral: 0.02 },
  mes: { nombre: 'Un mes', dias: 30, ruedas: 21, umbral: 0.04 },
  trimestre: { nombre: 'Tres meses', dias: 91, ruedas: 63, umbral: 0.07 }
};
// Cuántas veces se le pregunta a Gemini por análisis (la primera y las demás en paralelo).
const MERC_REPETICIONES = 3;
// Puntaje propio: desde cuánto (en valor absoluto) se lo toma como "mejor" o "peor" que el índice.
const MERC_UMBRAL_PUNTAJE = 0.15;
const MERC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MERC_METODO = 'v2';

function mercados_(d, u) {
  if (!tieneAccesoMercados_(u)) return { ok: false, error: 'No tenés acceso a Mercados.' };
  const op = String((d && d.op) || 'estado');
  if (op === 'estado') return mercEstado_();
  if (op === 'analizar') return mercAnalizar_(d, u);
  if (op === 'historial') return mercHistorial_();
  if (op === 'grafico') return mercGraficoPagina_(d);
  return { ok: false, error: 'Operación desconocida.' };
}

// ======================= Acceso =======================

function tieneAccesoMercados_(u) {
  if (!u) return false;
  const v = String(propiedades_().getProperty(MERC_PROP_USUARIOS) || '').trim();
  if (v) {
    const lista = v.split(',').map(x => claveTexto(x)).filter(Boolean);
    return lista.indexOf(claveTexto(u['ID'])) >= 0 || lista.indexOf(claveTexto(u['Usuario'])) >= 0;
  }
  const primero = leerUsuarios_()[0];
  return !!primero && primero['ID'] === u['ID'];
}

function mercEstado_() {
  const horizontes = Object.keys(MERC_HORIZONTES).map(k => ({ id: k, nombre: MERC_HORIZONTES[k].nombre }));
  return { ok: true, activo: !!mercClave_(), horizontes: horizontes };
}

function mercClave_() {
  return String(propiedades_().getProperty('GEMINI_API_KEY') || '').trim();
}

function mercControlUso_(u) {
  const cache = CacheService.getScriptCache();
  const k = 'merc_uso_' + u['ID'] + '_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHH');
  const n = parseInt(cache.get(k), 10) || 0;
  if (n >= MERC_LIMITE_HORA) return { ok: false, error: 'Llegaste al máximo de ' + MERC_LIMITE_HORA + ' análisis por hora. Probá en un rato.' };
  return { ok: true };
}

/** Solo cuentan los análisis que salieron bien. */
function mercSumarUso_(u) {
  const cache = CacheService.getScriptCache();
  const k = 'merc_uso_' + u['ID'] + '_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHH');
  cache.put(k, String((parseInt(cache.get(k), 10) || 0) + 1), 3700);
}

// ======================= Qué es cada acción =======================

// ADR de empresas argentinas que cotizan en EE.UU.
const MERC_ADR_ARG = ['YPF', 'GGAL', 'BMA', 'BBAR', 'SUPV', 'PAM', 'TGS', 'CEPU', 'EDN', 'LOMA', 'CRESY', 'IRS', 'TEO', 'CAAP', 'VIST', 'DESP', 'GLOB', 'MELI', 'BIOX', 'TX'];
// Acción local (.BA) → [ADR, acciones locales por cada ADR]. Sirve para la brecha local/ADR; si el
// cociente diera un disparate (por ejemplo porque cambió el ratio), la brecha no se usa.
const MERC_PAR_ADR = {
  'YPFD.BA': ['YPF', 1], 'GGAL.BA': ['GGAL', 10], 'BMA.BA': ['BMA', 10], 'BBAR.BA': ['BBAR', 3], 'SUPV.BA': ['SUPV', 5],
  'PAMP.BA': ['PAM', 25], 'TGSU2.BA': ['TGS', 5], 'CEPU.BA': ['CEPU', 10], 'EDN.BA': ['EDN', 20], 'LOMA.BA': ['LOMA', 5],
  'CRES.BA': ['CRESY', 10], 'IRSA.BA': ['IRS', 10], 'TECO2.BA': ['TEO', 5]
};
// Sector de Yahoo → ETF del sector en EE.UU.
const MERC_SECTOR_ETF = {
  'energy': ['XLE', 'energía'], 'financial services': ['XLF', 'financiero'], 'financial': ['XLF', 'financiero'], 'technology': ['XLK', 'tecnología'],
  'consumer cyclical': ['XLY', 'consumo discrecional'], 'healthcare': ['XLV', 'salud'], 'industrials': ['XLI', 'industria'],
  'communication services': ['XLC', 'comunicaciones'], 'consumer defensive': ['XLP', 'consumo básico'], 'utilities': ['XLU', 'servicios públicos'],
  'real estate': ['XLRE', 'inmobiliario'], 'basic materials': ['XLB', 'materiales']
};

function mercEsLocal_(simbolo) {
  const s = String(simbolo || '').toUpperCase();
  return s.length > 3 && s.substring(s.length - 3) === '.BA';
}

/** Índice contra el que se mide: Merval para las que cotizan en pesos, S&P 500 para el resto. */
function mercReferencia_(simbolo) {
  return mercEsLocal_(simbolo) ? { simbolo: '^MERV', nombre: 'el Merval' } : { simbolo: '^GSPC', nombre: 'el S&P 500' };
}

function mercMercado_(simbolo, bolsa) {
  const s = String(simbolo || '').toUpperCase();
  if (mercEsLocal_(s) || bolsa === 'BUE') return 'Argentina en pesos';
  if (MERC_ADR_ARG.indexOf(s) >= 0) return 'ADR argentino';
  return 'EE.UU. y otros';
}

function mercNombreReferencia_(simbolo) {
  return simbolo === '^MERV' ? 'el Merval' : simbolo === '^GSPC' ? 'el S&P 500' : simbolo;
}

// ======================= Análisis =======================

function mercAnalizar_(d, u) {
  const clave = mercClave_();
  if (!clave) return { ok: false, error: 'Falta cargar la clave de Gemini (GEMINI_API_KEY) en las propiedades del script.' };
  const pedido = String(d.simbolo || '').trim().substring(0, 40);
  if (!pedido) return { ok: false, error: 'Escribí el símbolo o el nombre de la acción.' };
  const hId = MERC_HORIZONTES[d.horizonte] ? d.horizonte : 'mes';
  const h = MERC_HORIZONTES[hId];
  const uso = mercControlUso_(u);
  if (!uso.ok) return uso;

  // 1) Qué acción es, cómo viene el precio y contra qué se mide.
  const busqueda = mercBuscarYahoo_(pedido);
  const simbolo = busqueda.simbolo || pedido.toUpperCase();
  const grafico = mercGrafico_(simbolo);
  const ref = mercReferencia_(simbolo);
  const gRef = mercGrafico_(ref.simbolo);
  const resumenYahoo = mercYahooResumen_(simbolo);
  if (resumenYahoo && resumenYahoo.sector && !busqueda.sector) { busqueda.sector = resumenYahoo.sector; busqueda.industria = resumenYahoo.industria; }
  const tecnico = grafico.ok ? mercTecnico_(grafico) : null;
  const nombre = (grafico.ok && grafico.nombre) || busqueda.nombre || simbolo;
  const contexto = mercContexto_(simbolo, busqueda, grafico);
  const hoy = ahoraLocal().hoy;

  // 2) Lo que se calcula acá: indicadores, puntaje propio, tasa base y rango normal.
  const al = grafico.ok && gRef.ok ? mercAlinear_(grafico, gRef) : null;
  const extra = { yahoo: resumenYahoo, argentina: contexto.argentina, local: mercEsLocal_(simbolo), simbolo: simbolo, hoy: hoy };
  if (contexto.argentina) extra.riesgo = mercRiesgoPais_();
  if (MERC_PAR_ADR[simbolo.toUpperCase()]) extra.brecha = mercBrechaAdr_(simbolo.toUpperCase(), grafico);
  const cuant = al ? mercSenales_(al, al.fechas.length - 1, hId, extra) : null;
  const base = al ? mercTasaBase_(al, al.fechas.length - 1, h.ruedas) : null;
  const regla = al ? mercReglaTendencia_(al, al.fechas.length - 1) : '';
  const historia = mercHistorialParaPrompt_(simbolo);

  // 3) Gemini, varias veces: se toma lo que dice la mayoría.
  const prompt = mercPrompt_(pedido, simbolo, nombre, h, tecnico, contexto, busqueda.noticias, hoy, ref, cuant, base, historia);
  const r = mercPreguntarGemini_(clave, prompt);
  if (!r.ok) return r;
  const respuestas = [r].concat(mercRepetir_(clave, r, MERC_REPETICIONES - 1));
  const parseadas = [];
  respuestas.forEach((x, i) => {
    let p = mercParsear_(x.texto);
    if (!p && i === 0) p = mercReparar_(clave, r.modelo, x.texto);
    if (p) parseadas.push({ p: p, fuentes: x.fuentes || [] });
  });
  if (!parseadas.length) return { ok: false, error: 'Gemini no devolvió el análisis en el formato esperado. Probá de nuevo.' };
  const voto = mercVotar_(parseadas.map(x => x.p));
  const p = voto.elegida;

  const fuentesVistas = {}, fuentes = [];
  parseadas.forEach(x => x.fuentes.forEach(f => { if (!fuentesVistas[f.url]) { fuentesVistas[f.url] = 1; fuentes.push(f); } }));
  if (!fuentes.length) busqueda.noticias.forEach(n => fuentes.push({ titulo: n.titulo, url: n.url }));

  const res = {
    id: Utilities.getUuid().substring(0, 8),
    fecha: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
    simbolo: simbolo, nombre: p.empresa || nombre, horizonte: hId, horizonteNombre: h.nombre,
    inclinacion: voto.inclinacion, confianza: voto.confianza,
    probabilidad: voto.probabilidad, coincidencia: voto.coincidencia,
    referencia: { simbolo: ref.simbolo, nombre: ref.nombre, precio: gRef.ok ? gRef.precio : null },
    resumen: String(p.resumen || ''),
    motivosSuba: mercMotivos_(p.motivosSuba), motivosBaja: mercMotivos_(p.motivosBaja),
    queCambiaria: mercTextos_(p.queCambiaria), aMirar: mercTextos_(p.aMirar),
    escenarios: mercEscenarios_(p.escenarios), masProbable: mercUnoDe_(p.masProbable, ['favorable', 'base', 'desfavorable'], ''),
    eventos: mercEventos_(p.eventos), contexto: contexto.lineas, argentina: contexto.argentina,
    sobreIndicadores: String(p.sobreIndicadores || '').substring(0, 600),
    cuant: cuant, tasaBase: base, reglaTendencia: regla,
    sector: busqueda.sector || '', mercado: mercMercado_(simbolo, busqueda.bolsa),
    precio: tecnico ? tecnico.precio : null, moneda: grafico.ok ? grafico.moneda : '',
    tecnico: tecnico ? tecnico.lineas : [], conNoticiasEnVivo: r.conBusqueda,
    fuentes: fuentes.slice(0, 12), modelo: r.modelo,
    verificarEl: sumarDias(hoy, h.dias),
    grafico: grafico.ok ? mercSerieGrafico_(grafico, resumenYahoo) : null
  };
  res.proyeccion = mercProyeccion_(res.probabilidad, base, cuant);
  mercGuardar_(res, u);
  mercSumarUso_(u);
  return { ok: true, analisis: res };
}

function mercUnoDe_(v, lista, def) {
  const k = claveTexto(v);
  return lista.indexOf(k) >= 0 ? k : def;
}

function mercMotivos_(lista) {
  const orden = { alto: 0, medio: 1, bajo: 2 };
  return (Array.isArray(lista) ? lista : []).slice(0, 6).map(m => ({
    titulo: String((m && m.titulo) || m || '').substring(0, 160),
    detalle: String((m && m.detalle) || '').substring(0, 700),
    peso: mercUnoDe_(m && m.peso, ['alto', 'medio', 'bajo'], 'medio'),
    descontado: mercUnoDe_(m && m.descontado, ['si', 'parcial', 'no'], ''),
    descontadoPorque: String((m && m.descontadoPorque) || '').substring(0, 400)
  })).filter(m => m.titulo).sort((a, b) => orden[a.peso] - orden[b.peso]);
}

function mercEscenarios_(lista) {
  const orden = { favorable: 0, base: 1, desfavorable: 2 };
  return (Array.isArray(lista) ? lista : []).slice(0, 3).map(e => ({
    tipo: mercUnoDe_(e && e.tipo, ['favorable', 'base', 'desfavorable'], 'base'),
    que: String((e && e.que) || '').substring(0, 500),
    efecto: String((e && e.efecto) || '').substring(0, 400),
    probabilidad: mercUnoDe_(e && e.probabilidad, ['alta', 'media', 'baja'], 'media')
  })).filter(e => e.que).sort((a, b) => orden[a.tipo] - orden[b.tipo]);
}

function mercEventos_(lista) {
  return (Array.isArray(lista) ? lista : []).slice(0, 6).map(e => ({
    fecha: String((e && e.fecha) || '').substring(0, 40),
    evento: String((e && e.evento) || e || '').substring(0, 200),
    porQueImporta: String((e && e.porQueImporta) || '').substring(0, 400)
  })).filter(e => e.evento);
}

function mercTextos_(lista) {
  return (Array.isArray(lista) ? lista : []).slice(0, 5).map(x => String(x || '').substring(0, 300)).filter(Boolean);
}

/** Probabilidad (0 a 100) que dio Gemini, o null. Se acota a 5–95: nadie sabe tanto. */
function mercProbabilidad_(v) {
  const n = Number(String(v === undefined || v === null ? '' : v).replace('%', '').replace(',', '.'));
  if (!isFinite(n) || String(v).trim() === '') return null;
  const x = n > 0 && n <= 1 ? n * 100 : n;
  return Math.max(5, Math.min(95, Math.round(x)));
}

/**
 * Junta las respuestas: la inclinación de la mayoría (empate → neutral), la probabilidad promedio y,
 * si no coinciden todas, la confianza baja un escalón.
 */
function mercVotar_(lista) {
  const votos = { alcista: 0, bajista: 0, neutral: 0 };
  const incls = lista.map(p => mercUnoDe_(p.inclinacion, ['alcista', 'bajista', 'neutral'], 'neutral'));
  incls.forEach(i => { votos[i]++; });
  const max = Math.max(votos.alcista, votos.bajista, votos.neutral);
  const ganadoras = Object.keys(votos).filter(k => votos[k] === max);
  const inclinacion = ganadoras.length === 1 ? ganadoras[0] : 'neutral';
  const elegida = lista[Math.max(0, incls.indexOf(inclinacion))];
  const probs = lista.map(p => mercProbabilidad_(p.probabilidad)).filter(x => x !== null);
  const probabilidad = probs.length ? Math.round(probs.reduce((a, x) => a + x, 0) / probs.length) : null;
  const niveles = ['baja', 'media', 'alta'];
  let conf = niveles.indexOf(mercUnoDe_(elegida.confianza, niveles, 'baja'));
  const unanimes = votos[inclinacion] === lista.length;
  if (!unanimes) conf = Math.max(0, conf - 1);
  if (ganadoras.length > 1) conf = 0;
  return {
    inclinacion: inclinacion, confianza: niveles[conf], probabilidad: probabilidad, elegida: elegida,
    coincidencia: { votos: votos[inclinacion], total: lista.length, respuestas: incls, probabilidades: probs }
  };
}

function mercPrompt_(pedido, simbolo, nombre, h, tecnico, contexto, noticias, hoy, ref, cuant, base, historia) {
  const l = [];
  l.push('Hoy es ' + isoAMostrar(hoy) + '. Analizá la acción "' + nombre + '" (símbolo ' + simbolo + '; el usuario escribió "' + pedido + '").');
  l.push('Horizonte del pronóstico: ' + h.nombre.toLowerCase() + '.');
  l.push('');
  l.push('QUÉ TENÉS QUE PRONOSTICAR: si en ese plazo a la acción le va a ir MEJOR, PEOR o PARECIDO que a ' + ref.nombre +
    ' (su índice de referencia). No si sube o baja: si le gana o pierde contra el índice. Una acción que sube 5 % cuando el índice sube 8 % es "peor".');
  l.push('');
  l.push('Buscá en Google las noticias y datos más recientes que puedan mover el precio: resultados y proyecciones de la empresa, ' +
    'noticias propias (contratos, juicios, cambios de gerencia, fusiones), su sector y sus materias primas, el contexto macro ' +
    '(tasas, inflación, dólar; si cotiza en Argentina, riesgo país, regulaciones y política económica) y el ánimo del mercado. ' +
    'Priorizá lo de las últimas semanas y fijate la fecha de cada noticia.');
  if (tecnico) {
    l.push('');
    l.push('Comportamiento del precio (datos reales de Yahoo Finance, usalos tal cual):');
    tecnico.lineas.forEach(x => l.push('- ' + x));
  } else {
    l.push('');
    l.push('No se pudieron traer los precios: no inventes datos del precio, basate en lo que encuentres.');
  }
  if (contexto.lineas.length) {
    l.push('');
    l.push('Contexto de mercado (datos reales, usalos tal cual):');
    contexto.lineas.forEach(x => l.push('- ' + x));
  }
  if (base) {
    l.push('');
    l.push('Tasa base (datos reales de los últimos ' + base.anios + ' años, ARRANCÁ DESDE ACÁ):');
    l.push('- En ventanas de ' + h.nombre.toLowerCase() + ', la acción le ganó a ' + ref.nombre + ' el ' + Math.round(base.tasa * 100) + ' % de las veces (' + base.ventanas + ' ventanas).');
    l.push('- Rango normal de la acción en ese plazo: 2 de cada 3 veces quedó entre ' + mercPctTxt_(base.rango.p16) + ' y ' + mercPctTxt_(base.rango.p84) + '.');
    l.push('- Rango normal contra el índice: entre ' + mercPctTxt_(base.rangoExceso.p16) + ' y ' + mercPctTxt_(base.rangoExceso.p84) + '. Diferencias menores a ' + mercPctTxt_(base.banda).substring(1) + ' cuentan como "parecido".');
  }
  if (cuant && cuant.senales.length) {
    l.push('');
    l.push('Indicadores calculados con datos (estudios de mercado muestran que algunos tienen poder predictivo modesto):');
    cuant.senales.forEach(s => l.push('- ' + s.nombre + ': ' + s.valor + ' → ' + s.lectura + ' (' + s.explicacion + ')'));
    l.push('Puntaje combinado de los indicadores: ' + mercNum2_(cuant.puntaje) + ' (de −1 a +1) → ' + mercDireccionTxt_(cuant.direccion) + '.');
  }
  if (historia.length) {
    l.push('');
    l.push('Cómo te viene yendo con estos pronósticos (datos reales, aprendé de esto):');
    historia.forEach(x => l.push('- ' + x));
  }
  l.push('');
  l.push('Buscá también los próximos eventos con fecha que pueden mover el precio dentro del horizonte o poco después: ' +
    'presentación de balance, pago de dividendos, asambleas, decisiones de tasas de la Reserva Federal' +
    (contexto.argentina ? ', medidas del Banco Central y del gobierno argentino, licitaciones y vencimientos de deuda, datos de inflación del INDEC' : ', datos de inflación y empleo de EE.UU.') + '.');
  if (noticias.length) {
    l.push('');
    l.push('Titulares recientes de Yahoo Finance (pueden servir de punto de partida):');
    noticias.forEach(n => l.push('- ' + n.titulo + (n.fecha ? ' (' + n.fecha + ')' : '') + (n.medio ? ' · ' + n.medio : '')));
  }
  l.push('');
  l.push('Reglas:');
  l.push('- No des precios objetivo. Las únicas cifras que das son la probabilidad y las que vienen en los datos de arriba.');
  l.push('- Cada motivo tiene que ser concreto y explicar por qué empujaría el precio (causa → efecto). Si sale de una noticia, mencioná de cuándo es.');
  l.push('- No inventes noticias. Si no encontrás información reciente, decilo en el resumen y bajá la confianza.');
  l.push('- A cada motivo poné un peso (alto, medio o bajo) según cuánto puede mover el precio en este horizonte.');
  l.push('- Indicá si cada motivo ya está descontado: "si" si es algo que el mercado conoce hace tiempo y el precio ya lo refleja (por ejemplo, la acción ya subió o bajó fuerte con esa noticia), "parcial" o "no" si todavía puede sorprender. Explicá en una oración por qué.');
  l.push('- La inclinación sale de los motivos de peso que NO están descontados. Una buena noticia que ya hizo subir mucho la acción no es motivo para que siga subiendo.');
  l.push('- Lo que afecta a todo el mercado no hace que la acción le gane o pierda al índice: importa lo propio de la empresa y su sector.');
  l.push('- Partí de la tasa base y movete de ahí solo con motivos concretos. Pronosticar el futuro de una acción es difícil: una probabilidad mayor a 70 % o menor a 30 % tiene que estar muy justificada.');
  l.push('- Si vas en contra de los indicadores, explicá por qué en "sobreIndicadores".');
  l.push('- La confianza es "alta" solo si casi todo empuja para el mismo lado; si hay fuerzas parejas, "baja" o "media" e inclinación "neutral".');
  l.push('- "probabilidad": de 0 a 100, qué tan probable es que la acción le GANE al índice en el plazo (50 = no se sabe). Tiene que ser coherente con la inclinación: alcista > 50, bajista < 50, neutral cerca de 50.');
  l.push('- Armá tres escenarios (favorable, base y desfavorable): qué tendría que pasar, cómo reaccionaría el precio (en palabras, sin cifras) y qué tan probable es cada uno. Marcá cuál es el más probable; tiene que ser coherente con la inclinación.');
  l.push('- Escribí en español de Argentina, con voseo, claro y sin jerga innecesaria.');
  l.push('');
  l.push('Respondé SOLO con un objeto JSON válido, sin texto antes ni después, con esta forma:');
  l.push('{"empresa": "nombre de la empresa", "inclinacion": "alcista" (le gana al índice) | "bajista" (pierde contra el índice) | "neutral" (parecido), ' +
    '"probabilidad": número de 0 a 100, "confianza": "baja" | "media" | "alta", ' +
    '"resumen": "2 o 3 oraciones con la conclusión y el motivo principal", ' +
    '"sobreIndicadores": "una o dos oraciones: si coincidís con los indicadores y, si no, por qué", ' +
    '"motivosSuba": [{"titulo": "frase corta", "detalle": "explicación de 1 a 3 oraciones", "peso": "alto" | "medio" | "bajo", "descontado": "si" | "parcial" | "no", "descontadoPorque": "una oración"}], ' +
    '"motivosBaja": [mismo formato que motivosSuba], ' +
    '"escenarios": [{"tipo": "favorable" | "base" | "desfavorable", "que": "qué tendría que pasar", "efecto": "cómo reaccionaría el precio, sin cifras", "probabilidad": "alta" | "media" | "baja"}], ' +
    '"masProbable": "favorable" | "base" | "desfavorable", ' +
    '"eventos": [{"fecha": "dd/mm/aaaa, o aproximada si no se sabe el día", "evento": "qué pasa", "porQueImporta": "una oración"}], ' +
    '"queCambiaria": ["qué hecho daría vuelta el pronóstico"]}');
  l.push('Entre 2 y 5 motivos de cada lado (si de un lado no hay motivos de peso, poné los que haya y decilo). "motivosSuba" son los que la harían ganarle al índice y "motivosBaja" los que la harían perder.');
  return l.join('\n');
}

// ======================= Gemini =======================

// Forma de la respuesta para cuando Gemini puede devolver JSON con esquema (sin búsqueda de Google:
// la búsqueda y el esquema juntos no los acepta).
const MERC_ESQUEMA = (function () {
  const S = { type: 'STRING' };
  const motivo = { type: 'OBJECT', properties: { titulo: S, detalle: S, peso: { type: 'STRING', enum: ['alto', 'medio', 'bajo'] },
    descontado: { type: 'STRING', enum: ['si', 'parcial', 'no'] }, descontadoPorque: S }, required: ['titulo', 'detalle', 'peso'] };
  return {
    type: 'OBJECT',
    properties: {
      empresa: S, inclinacion: { type: 'STRING', enum: ['alcista', 'bajista', 'neutral'] }, probabilidad: { type: 'INTEGER' },
      confianza: { type: 'STRING', enum: ['baja', 'media', 'alta'] }, resumen: S, sobreIndicadores: S,
      motivosSuba: { type: 'ARRAY', items: motivo }, motivosBaja: { type: 'ARRAY', items: motivo },
      escenarios: { type: 'ARRAY', items: { type: 'OBJECT', properties: { tipo: { type: 'STRING', enum: ['favorable', 'base', 'desfavorable'] }, que: S, efecto: S,
        probabilidad: { type: 'STRING', enum: ['alta', 'media', 'baja'] } }, required: ['tipo', 'que'] } },
      masProbable: { type: 'STRING', enum: ['favorable', 'base', 'desfavorable'] },
      eventos: { type: 'ARRAY', items: { type: 'OBJECT', properties: { fecha: S, evento: S, porQueImporta: S }, required: ['evento'] } },
      queCambiaria: { type: 'ARRAY', items: S }
    },
    required: ['inclinacion', 'probabilidad', 'confianza', 'resumen', 'motivosSuba', 'motivosBaja']
  };
})();

function mercCuerpo_(prompt, conBusqueda) {
  const cuerpo = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4 } };
  if (conBusqueda) cuerpo.tools = [{ google_search: {} }];
  else { cuerpo.generationConfig.responseMimeType = 'application/json'; cuerpo.generationConfig.responseSchema = MERC_ESQUEMA; }
  return cuerpo;
}

/**
 * Primero con búsqueda de Google; si el modelo o la cuota no la permiten, sin búsqueda.
 * Un modelo saturado (503) no se vuelve a probar en la misma consulta.
 */
function mercPreguntarGemini_(clave, prompt) {
  const modelos = typeof asisModelos_ === 'function' ? asisModelos_(clave) : [];
  // Respaldo: alias "latest" y modelos anteriores, que suelen estar menos saturados.
  ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']
    .forEach(m => { if (modelos.indexOf(m) < 0) modelos.push(m); });
  let ultimo = 'No se pudo obtener respuesta de Gemini.';
  const inicio = Date.now();
  const descartados = {}, probados = [];
  for (let conBusqueda = 1; conBusqueda >= 0; conBusqueda--) {
    for (let i = 0; i < modelos.length; i++) {
      const modelo = modelos[i];
      if (descartados[modelo]) continue;
      if (Date.now() - inicio > 150000) return { ok: false, error: ultimo + mercProbados_(probados) };
      const cuerpo = mercCuerpo_(prompt, conBusqueda);
      const r = mercLlamar_(clave, modelo, cuerpo);
      console.log('Mercados · ' + modelo + (conBusqueda ? ' con búsqueda' : ' sin búsqueda') + ' · ' + (r.ok ? 'ok' : r.error));
      if (probados.indexOf(modelo) < 0) probados.push(modelo);
      if (r.ok) { r.modelo = modelo; r.conBusqueda = !!conBusqueda; r.cuerpo = cuerpo; r.demora = Date.now() - inicio; return r; }
      ultimo = r.error;
      if (r.fatal) return r;
      // Saturado, inexistente o sin cuota: no se vuelve a probar este modelo.
      if (r.saturado || r.noExiste || r.agotado) descartados[modelo] = 1;
      // Si falla la búsqueda (sin cuota o no soportada), se pasa directo a la vuelta sin búsqueda.
      if (conBusqueda && r.busqueda && !r.saturado) break;
    }
  }
  return { ok: false, error: ultimo + mercProbados_(probados) };
}

/**
 * Las otras respuestas, en paralelo, con el mismo modelo y la misma forma de pregunta que la primera.
 * Si la primera tardó mucho (Gemini lento) no se insiste: alcanza con la que hay.
 */
function mercRepetir_(clave, primera, cuantas) {
  if (cuantas <= 0 || primera.demora > 100000) return [];
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + primera.modelo + ':generateContent';
  const pedidos = [];
  for (let i = 0; i < cuantas; i++) {
    pedidos.push({ url: url, method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': clave },
      payload: JSON.stringify(primera.cuerpo), muteHttpExceptions: true });
  }
  let respuestas = [];
  try { respuestas = UrlFetchApp.fetchAll(pedidos); } catch (e) { console.log('Mercados · repeticiones: ' + e.message); return []; }
  return respuestas.map(res => mercLeerRespuesta_(res, !!primera.cuerpo.tools, primera.modelo)).filter(x => x.ok);
}

/** Si la respuesta no vino en JSON, se le pide a Gemini (sin búsqueda, con esquema) que la pase a JSON. */
function mercReparar_(clave, modelo, texto) {
  if (!texto) return null;
  const cuerpo = {
    contents: [{ role: 'user', parts: [{ text: 'Pasá este análisis al formato JSON pedido, sin cambiar el contenido ni agregar nada:\n\n' + String(texto).substring(0, 30000) }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: MERC_ESQUEMA }
  };
  const r = mercLlamar_(clave, modelo, cuerpo);
  return r.ok ? mercParsear_(r.texto) : null;
}

function mercProbados_(lista) {
  return lista.length ? ' (Probé: ' + lista.join(', ') + '.)' : '';
}

function mercLlamar_(clave, modelo, cuerpo) {
  let res;
  try {
    res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent', {
      method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': clave },
      payload: JSON.stringify(cuerpo), muteHttpExceptions: true
    });
  } catch (e) {
    return { ok: false, error: 'No se pudo conectar con Gemini: ' + e.message };
  }
  return mercLeerRespuesta_(res, !!cuerpo.tools, modelo);
}

function mercLeerRespuesta_(res, conTools, modelo) {
  const codigo = res.getResponseCode();
  let json = {};
  try { json = JSON.parse(res.getContentText() || '{}'); } catch (e) {}
  const mensaje = String((json.error && json.error.message) || '');
  const m = claveTexto(mensaje);
  if (codigo === 200) {
    const cand = (json.candidates || [])[0];
    const partes = (cand && cand.content && cand.content.parts) || [];
    const texto = partes.filter(p => p && p.text && !p.thought).map(p => p.text).join('').trim();
    if (!texto) return { ok: false, busqueda: conTools, error: 'Gemini devolvió una respuesta vacía.' };
    const fuentes = [];
    const vistos = {};
    ((cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || []).forEach(c => {
      const w = c && c.web;
      if (!w || !w.uri || vistos[w.uri]) return;
      vistos[w.uri] = 1;
      fuentes.push({ titulo: String(w.title || w.uri), url: String(w.uri) });
    });
    return { ok: true, texto: texto, fuentes: fuentes };
  }
  if (codigo === 400 && (m.indexOf('api key') >= 0 || m.indexOf('api_key') >= 0)) return { ok: false, fatal: true, error: 'La clave de Gemini (GEMINI_API_KEY) no es válida.' };
  if (codigo === 403 && !conTools) return { ok: false, fatal: true, error: 'Google rechazó la clave de Gemini (sin permiso).' };
  if (codigo === 429) {
    if (!conTools && typeof asisMarcarAgotado_ === 'function') asisMarcarAgotado_(modelo);
    return { ok: false, busqueda: conTools, agotado: !conTools, error: 'Se agotó la cuota gratuita de Gemini por ahora. Probá en unos minutos.' };
  }
  if (codigo >= 500) return { ok: false, saturado: true, error: 'Gemini está saturado en este momento (error ' + codigo + '). Probá de nuevo en unos minutos.' };
  if (codigo === 400 && (m.indexOf('not found') >= 0 || m.indexOf('not supported') >= 0)) return { ok: false, noExiste: true, error: 'El modelo ' + modelo + ' no está disponible.' };
  if (codigo === 404) return { ok: false, noExiste: true, error: 'El modelo ' + modelo + ' no está disponible.' };
  if (conTools && (codigo === 400 || codigo === 403)) return { ok: false, busqueda: true, error: 'La búsqueda de Google no está disponible para este modelo.' };
  return { ok: false, error: 'Gemini respondió con un error (' + codigo + ')' + (mensaje ? ': ' + mensaje.substring(0, 200) : '.') };
}

/** Saca el JSON de la respuesta (puede venir dentro de un bloque de código). */
function mercParsear_(texto) {
  const t = String(texto || '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const o = JSON.parse(t.substring(a, b + 1));
    return o && typeof o === 'object' && o.inclinacion ? o : null;
  } catch (e) { return null; }
}

// ======================= Yahoo Finance =======================

function mercFetchJson_(url, cabeceras) {
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: Object.assign({ 'User-Agent': MERC_UA, 'Accept': 'application/json' }, cabeceras || {}) });
    if (res.getResponseCode() !== 200) return null;
    return JSON.parse(res.getContentText() || 'null');
  } catch (e) {
    console.log('Mercados · ' + url.split('?')[0] + ': ' + e.message);
    return null;
  }
}

/** Símbolo, nombre y titulares a partir de lo que escribió el usuario. */
function mercBuscarYahoo_(texto) {
  const json = mercFetchJson_('https://query2.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(texto) + '&quotesCount=6&newsCount=8&lang=es-AR&region=AR');
  const vacio = { simbolo: '', nombre: '', noticias: [], sector: '', industria: '', bolsa: '' };
  if (!json) return vacio;
  const quotes = (json.quotes || []).filter(q => q && q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'));
  const exacto = quotes.filter(q => String(q.symbol).toUpperCase() === String(texto).toUpperCase())[0];
  const q = exacto || quotes[0];
  const tz = Session.getScriptTimeZone();
  const noticias = (json.news || []).slice(0, 8).map(n => ({
    titulo: String(n.title || ''), medio: String(n.publisher || ''), url: String(n.link || ''),
    fecha: n.providerPublishTime ? Utilities.formatDate(new Date(n.providerPublishTime * 1000), tz, 'dd/MM/yyyy') : ''
  })).filter(n => n.titulo);
  return { simbolo: q ? String(q.symbol) : '', nombre: q ? String(q.longname || q.shortname || '') : '', noticias: noticias,
    sector: q ? String(q.sector || q.sectorDisp || '') : '', industria: q ? String(q.industry || q.industryDisp || '') : '', bolsa: q ? String(q.exchange || '') : '' };
}

/** Cierres diarios de tres años (guardados 30 minutos). filas: [fecha aaaa-mm-dd, cierre, volumen]. */
function mercGrafico_(simbolo) {
  const cache = CacheService.getScriptCache();
  const k = 'merc_graf3_' + simbolo;
  const guardado = cache.get(k);
  if (guardado) { try { return JSON.parse(guardado); } catch (e) {} }
  const json = mercFetchJson_('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(simbolo) + '?range=3y&interval=1d&includePrePost=false');
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r || !r.timestamp) return { ok: false };
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const tz = Session.getScriptTimeZone();
  const filas = [];
  r.timestamp.forEach((ts, i) => {
    const c = (q.close || [])[i];
    if (typeof c !== 'number' || isNaN(c) || c <= 0) return;
    const f = Utilities.formatDate(new Date(ts * 1000), tz, 'yyyy-MM-dd');
    // Yahoo a veces repite el último día (la rueda en curso): se queda el último dato.
    if (filas.length && filas[filas.length - 1][0] === f) filas.pop();
    filas.push([f, Math.round(c * 10000) / 10000, (q.volume || [])[i] || 0]);
  });
  if (filas.length < 5) return { ok: false };
  const meta = r.meta || {};
  const out = { ok: true, simbolo: simbolo, nombre: String(meta.longName || meta.shortName || ''), moneda: String(meta.currency || ''),
    mercado: String(meta.fullExchangeName || meta.exchangeName || ''), precio: typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : filas[filas.length - 1][1], filas: filas };
  try { cache.put(k, JSON.stringify(out), 1800); } catch (e) {}
  return out;
}

/**
 * Datos de la empresa que no están en el gráfico: próximo balance, sorpresa del último, recomendaciones
 * y cambios de analistas, sector. Yahoo pide una "migaja" (crumb) con su cookie: si algo falla, se sigue sin esto.
 */
function mercYahooResumen_(simbolo) {
  if (/^\^/.test(simbolo)) return null;
  const cache = CacheService.getScriptCache();
  const kRes = 'merc_res_' + simbolo;
  const g = cache.get(kRes);
  if (g) { try { return JSON.parse(g); } catch (e) {} }
  const modulos = 'calendarEvents,earningsHistory,recommendationTrend,upgradeDowngradeHistory,assetProfile';
  let json = null;
  for (let intento = 0; intento < 2 && !json; intento++) {
    const migaja = mercMigajaYahoo_(intento > 0);
    if (!migaja) break;
    json = mercFetchJson_('https://query2.finance.yahoo.com/v10/finance/quoteSummary/' + encodeURIComponent(simbolo) + '?modules=' + modulos + '&crumb=' + encodeURIComponent(migaja.crumb),
      { 'Cookie': migaja.cookie });
  }
  const r = json && json.quoteSummary && json.quoteSummary.result && json.quoteSummary.result[0];
  if (!r) return null;
  const tz = Session.getScriptTimeZone();
  const raw = v => v && typeof v === 'object' ? v.raw : v;
  const iso = seg => Utilities.formatDate(new Date(seg * 1000), tz, 'yyyy-MM-dd');
  const out = { sector: '', industria: '', proximoBalance: '', ultimoBalance: null, recomendaciones: [], cambios: [] };
  if (r.assetProfile) { out.sector = String(r.assetProfile.sector || ''); out.industria = String(r.assetProfile.industry || ''); }
  const fechasBal = r.calendarEvents && r.calendarEvents.earnings && r.calendarEvents.earnings.earningsDate;
  if (Array.isArray(fechasBal) && fechasBal.length && raw(fechasBal[0])) out.proximoBalance = iso(raw(fechasBal[0]));
  const hist = r.earningsHistory && r.earningsHistory.history;
  if (Array.isArray(hist) && hist.length) {
    const ult = hist.filter(x => x && raw(x.quarter)).sort((a, b) => raw(a.quarter) - raw(b.quarter)).pop();
    if (ult) {
      const real = Number(raw(ult.epsActual)), est = Number(raw(ult.epsEstimate));
      if (isFinite(real) && isFinite(est) && est !== 0) out.ultimoBalance = { trimestre: iso(raw(ult.quarter)), real: real, estimado: est, sorpresa: (real - est) / Math.abs(est) };
    }
  }
  const trend = r.recommendationTrend && r.recommendationTrend.trend;
  if (Array.isArray(trend)) out.recomendaciones = trend.map(t => ({ periodo: String(t.period || ''), muyCompra: Number(t.strongBuy) || 0, compra: Number(t.buy) || 0,
    mantener: Number(t.hold) || 0, venta: Number(t.sell) || 0, muyVenta: Number(t.strongSell) || 0 }));
  const cambios = r.upgradeDowngradeHistory && r.upgradeDowngradeHistory.history;
  if (Array.isArray(cambios)) out.cambios = cambios.filter(c => c && c.epochGradeDate).slice(0, 40)
    .map(c => ({ fecha: iso(c.epochGradeDate), firma: String(c.firm || ''), accion: String(c.action || ''), de: String(c.fromGrade || ''), a: String(c.toGrade || '') }));
  try { cache.put(kRes, JSON.stringify(out), 6 * 3600); } catch (e) {}
  return out;
}

function mercMigajaYahoo_(renovar) {
  const cache = CacheService.getScriptCache();
  if (!renovar) { const g = cache.get('merc_crumb'); if (g) { try { return JSON.parse(g); } catch (e) {} } }
  try {
    const r1 = UrlFetchApp.fetch('https://fc.yahoo.com', { muteHttpExceptions: true, followRedirects: false, headers: { 'User-Agent': MERC_UA } });
    const h = r1.getAllHeaders();
    let galletas = h['Set-Cookie'] || h['set-cookie'] || [];
    if (!Array.isArray(galletas)) galletas = [galletas];
    const cookie = galletas.map(c => String(c).split(';')[0]).filter(Boolean).join('; ');
    if (!cookie) return null;
    const r2 = UrlFetchApp.fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { muteHttpExceptions: true, headers: { 'User-Agent': MERC_UA, 'Cookie': cookie } });
    const crumb = String(r2.getContentText() || '').trim();
    if (r2.getResponseCode() !== 200 || !crumb || crumb.length > 40 || /[<{\s]/.test(crumb)) return null;
    const m = { cookie: cookie, crumb: crumb };
    cache.put('merc_crumb', JSON.stringify(m), 6 * 3600);
    return m;
  } catch (e) {
    console.log('Mercados · migaja de Yahoo: ' + e.message);
    return null;
  }
}

function mercTecnico_(g) {
  const cierres = g.filas.map(f => f[1]);
  const vols = g.filas.map(f => f[2]);
  const n = cierres.length;
  const precio = g.precio;
  const varDesde = dias => n > dias ? precio / cierres[n - 1 - dias] - 1 : null;
  const media = (lista, k) => lista.length >= k ? lista.slice(-k).reduce((a, x) => a + x, 0) / k : null;
  const pct = mercPctTxt_;
  const lineas = [];
  lineas.push('Mercado: ' + (g.mercado || '—') + ' · moneda ' + (g.moneda || '—') + ' · último precio ' + precio.toFixed(2).split('.').join(','));
  const vars = [['una semana', 5], ['un mes', 21], ['tres meses', 63], ['seis meses', 126], ['un año', 252]]
    .map(x => { const v = varDesde(x[1]); return v === null ? '' : x[0] + ' ' + pct(v); }).filter(Boolean);
  if (vars.length) lineas.push('Variación en ' + vars.join(', '));
  [20, 50, 200].forEach(k => {
    const mm = media(cierres, k);
    if (mm) lineas.push('Media de ' + k + ' ruedas: el precio está ' + (precio >= mm ? 'por encima' : 'por debajo') + ' (' + pct(precio / mm - 1) + ')');
  });
  const anio = cierres.slice(-252);
  const max = Math.max.apply(null, anio), min = Math.min.apply(null, anio);
  lineas.push('Contra el máximo del año: ' + pct(precio / max - 1) + ' · contra el mínimo del año: ' + pct(precio / min - 1));
  if (n > 21) {
    const rets = [];
    for (let i = n - 20; i < n; i++) rets.push(Math.log(cierres[i] / cierres[i - 1]));
    lineas.push('Volatilidad de las últimas 20 ruedas (anualizada): ' + (mercDesvio_(rets) * Math.sqrt(252) * 100).toFixed(0) + ' %');
  }
  const v5 = media(vols, 5), v60 = media(vols, 60);
  if (v5 && v60) lineas.push('Volumen de la última semana contra el promedio de 3 meses: ' + pct(v5 / v60 - 1));
  return { precio: precio, lineas: lineas };
}

/** Precio del último año con las medias de 50 y 200 ruedas, para el gráfico de la página. */
function mercSerieGrafico_(g, resumenYahoo) {
  const cierres = g.filas.map(f => f[1]);
  const n = cierres.length, desde = Math.max(0, n - 260);
  const mm = (k, i) => {
    if (i + 1 < k) return null;
    let s = 0;
    for (let j = i - k + 1; j <= i; j++) s += cierres[j];
    return Math.round(s / k * 10000) / 10000;
  };
  const out = { fechas: [], cierres: [], mm50: [], mm200: [], moneda: g.moneda || '', proximoBalance: (resumenYahoo && resumenYahoo.proximoBalance) || '' };
  for (let i = desde; i < n; i++) { out.fechas.push(g.filas[i][0]); out.cierres.push(cierres[i]); out.mm50.push(mm(50, i)); out.mm200.push(mm(200, i)); }
  return out;
}

function mercGraficoPagina_(d) {
  const simbolo = String((d && d.simbolo) || '').trim().substring(0, 40);
  if (!simbolo) return { ok: false, error: 'Falta el símbolo.' };
  const g = mercGrafico_(simbolo);
  if (!g.ok) return { ok: false, error: 'No se pudo traer el precio de ' + simbolo + '.' };
  return { ok: true, grafico: mercSerieGrafico_(g, mercYahooResumen_(simbolo)) };
}

// ======================= Cálculos =======================

function mercPctTxt_(x) {
  if (x === null || x === undefined || !isFinite(x)) return '—';
  return (x >= 0 ? '+' : '') + (x * 100).toFixed(1).split('.').join(',') + ' %';
}

function mercNum2_(x) {
  return (x >= 0 ? '+' : '') + x.toFixed(2).split('.').join(',');
}

function mercDireccionTxt_(dir) {
  return dir === 'alcista' ? 'mejor que el índice' : dir === 'bajista' ? 'peor que el índice' : 'parecido al índice';
}

function mercDesvio_(lista) {
  if (lista.length < 2) return 0;
  const prom = lista.reduce((a, x) => a + x, 0) / lista.length;
  return Math.sqrt(lista.reduce((a, x) => a + (x - prom) * (x - prom), 0) / (lista.length - 1));
}

function mercPercentil_(ordenada, q) {
  if (!ordenada.length) return null;
  const pos = (ordenada.length - 1) * q, a = Math.floor(pos), b = Math.ceil(pos);
  return ordenada[a] + (ordenada[b] - ordenada[a]) * (pos - a);
}

function mercAcotar_(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

/**
 * Acción e índice en los mismos días (los días que falta el índice se usa su último cierre anterior).
 * {fechas, p: cierres de la acción, r: cierres del índice, v: volúmenes}
 */
function mercAlinear_(g, gRef) {
  const fechas = [], p = [], r = [], v = [];
  let j = 0, ultimoRef = null;
  const ref = gRef.filas;
  g.filas.forEach(f => {
    while (j < ref.length && ref[j][0] <= f[0]) { ultimoRef = ref[j][1]; j++; }
    if (ultimoRef === null) return;
    fechas.push(f[0]); p.push(f[1]); r.push(ultimoRef); v.push(f[2]);
  });
  return { fechas: fechas, p: p, r: r, v: v };
}

/** Índice del último día con fecha <= iso (o -1). */
function mercIndiceHasta_(fechas, iso) {
  let lo = 0, hi = fechas.length - 1, res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fechas[mid] <= iso) { res = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return res;
}

/** Rendimiento de la acción contra el índice entre los días a y b (índices de al). */
function mercRel_(al, a, b) {
  return (al.p[b] / al.p[a]) / (al.r[b] / al.r[a]) - 1;
}

/**
 * Indicadores con datos hasta el día t (índice de al). Cada uno da una lectura de −1 (peor que el índice)
 * a +1 (mejor) y pesa distinto según el plazo. extra (opcional, solo para el análisis de hoy): datos de
 * Yahoo, riesgo país y brecha con el ADR.
 */
const MERC_PESOS = {
  //            tendencia, maximo, rebote, medias, rsi, volumen, balance, analistas, riesgo, brecha
  semana:     { tendencia: 0.5, maximo: 0.5, rebote: 1.5, medias: 0.5, rsi: 0.7, volumen: 0.5, balance: 0.7, analistas: 0.5, riesgo: 0.7, brecha: 0.3 },
  mes:        { tendencia: 1.2, maximo: 1.0, rebote: 0.6, medias: 0.8, rsi: 0.4, volumen: 0.4, balance: 1.0, analistas: 0.8, riesgo: 0.8, brecha: 0.3 },
  trimestre:  { tendencia: 1.5, maximo: 1.2, rebote: 0.2, medias: 1.0, rsi: 0.2, volumen: 0.3, balance: 1.0, analistas: 1.0, riesgo: 0.8, brecha: 0.2 }
};

function mercSenales_(al, t, hId, extra) {
  const pesos = MERC_PESOS[hId] || MERC_PESOS.mes;
  const pct = mercPctTxt_;
  const senales = [];
  const agregar = (id, nombre, valor, s, explicacion) => {
    s = mercAcotar_(s, -1, 1);
    senales.push({ id: id, nombre: nombre, valor: valor, puntaje: Math.round(s * 100) / 100, peso: pesos[id] || 0,
      lectura: s > 0.1 ? 'a favor' : s < -0.1 ? 'en contra' : 'neutral', explicacion: explicacion });
  };
  const p = al.p, n = t + 1;

  // 1) Tendencia de 12 meses sin el último (o de 6 si no hay un año de datos).
  if (n > 147) {
    const largo = n > 273 ? 252 : 126;
    const m = mercRel_(al, t - largo, t - 21);
    agregar('tendencia', 'Tendencia ' + (largo === 252 ? '12' : '6') + ' meses (sin el último) contra el índice', pct(m), m / 0.25,
      'las que vienen ganándole al índice suelen seguir haciéndolo unos meses más');
  }
  // 2) Cercanía al máximo de 52 semanas.
  if (n > 60) {
    const ventana = p.slice(Math.max(0, n - 252), n);
    const d = p[t] / Math.max.apply(null, ventana) - 1;
    const s = d >= -0.05 ? 0.6 : d <= -0.35 ? -0.5 : -0.5 + (d + 0.35) / 0.30 * 1.1;
    agregar('maximo', 'Distancia al máximo de 52 semanas', pct(d), s,
      'cerca del máximo anual suele seguir firme; muy lejos, suele seguir floja');
  }
  // 3) Rebote de corto plazo: la última semana contra el índice.
  if (n > 6) {
    const w = mercRel_(al, t - 5, t);
    agregar('rebote', 'Última semana contra el índice', pct(w), -w / 0.08,
      'una semana muy fuerte o muy floja suele corregirse en parte la siguiente');
  }
  // 4) Medias móviles.
  if (n >= 200) {
    const mm = k => p.slice(n - k, n).reduce((a, x) => a + x, 0) / k;
    const mm50 = mm(50), mm200 = mm(200);
    const s = (p[t] > mm200 ? 0.5 : -0.5) + (mm50 > mm200 ? 0.5 : -0.5);
    agregar('medias', 'Medias de 50 y 200 ruedas', (p[t] > mm200 ? 'precio sobre' : 'precio bajo') + ' la de 200; la de 50 ' + (mm50 > mm200 ? 'sobre' : 'bajo') + ' la de 200', s,
      'tendencia de fondo: con las dos para arriba el viento sopla a favor');
  }
  // 5) RSI de 14 ruedas.
  if (n > 15) {
    let suba = 0, baja = 0;
    for (let i = t - 13; i <= t; i++) { const dlt = p[i] - p[i - 1]; if (dlt > 0) suba += dlt; else baja -= dlt; }
    const rsi = baja === 0 ? 100 : 100 - 100 / (1 + suba / baja);
    const s = rsi >= 75 ? -0.6 : rsi >= 70 ? -0.3 : rsi <= 25 ? 0.6 : rsi <= 30 ? 0.3 : 0;
    agregar('rsi', 'RSI de 14 ruedas', String(Math.round(rsi)), s, 'arriba de 70 está "sobrecomprada" y abajo de 30 "sobrevendida" (señal débil)');
  }
  // 6) Volumen: confirma o no el movimiento de la última semana.
  if (n > 65) {
    const prom = (a, b) => al.v.slice(a, b).reduce((x, y) => x + y, 0) / (b - a);
    const v5 = prom(n - 5, n), v60 = prom(n - 60, n);
    if (v60 > 0) {
      const vv = v5 / v60 - 1, w = mercRel_(al, t - 5, t);
      const s = vv > 0.5 ? (w > 0 ? 0.4 : -0.4) : 0;
      agregar('volumen', 'Volumen de la semana contra el de 3 meses', pct(vv), s, 'mucho volumen confirma la dirección del último movimiento');
    }
  }
  const y = extra && extra.yahoo;
  // 7) Sorpresa del último balance (si fue hace poco).
  if (y && y.ultimoBalance && extra.hoy && y.ultimoBalance.trimestre >= sumarDias(extra.hoy, -135)) {
    const sp = y.ultimoBalance.sorpresa;
    agregar('balance', 'Último balance contra lo esperado', 'ganancia ' + pct(sp) + ' contra el promedio de analistas', sp / 0.10,
      'después de un balance que sorprende, la acción suele seguir en esa dirección varias semanas');
  }
  // 8) Analistas: recomendaciones de hoy contra las de hace 2 o 3 meses, y subas/bajas de calificación del último mes.
  if (y && (y.recomendaciones.length || y.cambios.length)) {
    const cuota = t2 => { const tot = t2.muyCompra + t2.compra + t2.mantener + t2.venta + t2.muyVenta; return tot ? (t2.muyCompra + t2.compra) / tot : null; };
    const ahora = y.recomendaciones.filter(x => x.periodo === '0m')[0];
    const antes = y.recomendaciones.filter(x => x.periodo === '-3m')[0] || y.recomendaciones.filter(x => x.periodo === '-2m')[0];
    let s = 0;
    const partes = [];
    if (ahora && antes && cuota(ahora) !== null && cuota(antes) !== null) {
      const dif = cuota(ahora) - cuota(antes);
      s += dif / 0.15;
      partes.push('compra ' + Math.round(cuota(ahora) * 100) + ' % (antes ' + Math.round(cuota(antes) * 100) + ' %)');
    }
    if (extra.hoy) {
      const recientes = y.cambios.filter(c => c.fecha >= sumarDias(extra.hoy, -30));
      const up = recientes.filter(c => c.accion === 'up').length, down = recientes.filter(c => c.accion === 'down').length;
      if (up || down) { s += (up - down) * 0.3; partes.push(up + ' suba(s) y ' + down + ' baja(s) de calificación en 30 días'); }
    }
    if (partes.length) agregar('analistas', 'Analistas', partes.join(' · '), s, 'cuando los analistas mejoran su opinión, la acción suele acompañar');
  }
  // 9) Riesgo país (solo Argentina): cuánto cambió en un mes.
  if (extra && extra.argentina && extra.riesgo && extra.riesgo.hace30) {
    const c = extra.riesgo.valor / extra.riesgo.hace30 - 1;
    agregar('riesgo', 'Riesgo país en un mes', extra.riesgo.valor + ' puntos (' + pct(c) + ')', -c / 0.15,
      'si baja el riesgo país, a las argentinas les suele ir mejor que al resto');
  }
  // 10) Brecha entre la acción local y su ADR (solo .BA).
  if (extra && extra.brecha) {
    const b = extra.brecha.brecha;
    agregar('brecha', 'Dólar implícito de la acción contra el contado con liqui', pct(b), -b / 0.05,
      'si la acción local está cara contra su ADR, la diferencia tiende a cerrarse');
  }

  let suma = 0, pesoTotal = 0;
  senales.forEach(s => { if (s.peso > 0) { suma += s.puntaje * s.peso; pesoTotal += s.peso; } });
  const puntaje = pesoTotal ? Math.round(suma / pesoTotal * 100) / 100 : 0;
  const direccion = puntaje > MERC_UMBRAL_PUNTAJE ? 'alcista' : puntaje < -MERC_UMBRAL_PUNTAJE ? 'bajista' : 'neutral';
  // Ventaja modesta, como la que muestran los estudios: nunca más de 62 % ni menos de 38 %.
  const prob = Math.round(50 + 12 * puntaje);
  return { puntaje: puntaje, direccion: direccion, probabilidad: prob, senales: senales };
}

/** Regla de comparación simple: la acción que le ganó al índice en 6 meses sigue ganando ("alcista"). */
function mercReglaTendencia_(al, t) {
  if (t < 127) return '';
  return mercRel_(al, t - 126, t) > 0 ? 'alcista' : 'bajista';
}

/**
 * Tasa base hasta el día t: en ventanas de "ruedas" de los últimos tres años, cuántas veces le ganó al
 * índice, el rango normal (percentiles 16 y 84: 2 de cada 3 veces) y la banda de "parecido".
 */
function mercTasaBase_(al, t, ruedas) {
  const desde = Math.max(0, t - 756);
  const propios = [], excesos = [];
  for (let i = desde; i + ruedas <= t; i++) {
    propios.push(al.p[i + ruedas] / al.p[i] - 1);
    excesos.push(mercRel_(al, i, i + ruedas));
  }
  if (excesos.length < 20) return null;
  const banda = mercBanda_(al, t, ruedas);
  propios.sort((a, b) => a - b);
  const exOrd = excesos.slice().sort((a, b) => a - b);
  return {
    tasa: excesos.filter(x => x > 0).length / excesos.length, ventanas: excesos.length,
    anios: Math.max(1, Math.round((t - desde) / 252)),
    rango: { p16: mercPercentil_(propios, 0.16), p50: mercPercentil_(propios, 0.5), p84: mercPercentil_(propios, 0.84) },
    rangoExceso: { p16: mercPercentil_(exOrd, 0.16), p50: mercPercentil_(exOrd, 0.5), p84: mercPercentil_(exOrd, 0.84) },
    banda: banda
  };
}

/** Banda de "parecido al índice": medio movimiento normal (desvío) del exceso en ese plazo, del último año. */
function mercBanda_(al, t, ruedas) {
  const rets = [];
  for (let i = Math.max(1, t - 251); i <= t; i++) rets.push(Math.log((al.p[i] / al.p[i - 1]) / (al.r[i] / al.r[i - 1])));
  if (rets.length < 20) return null;
  return Math.round(mercAcotar_(0.5 * mercDesvio_(rets) * Math.sqrt(ruedas), 0.005, 0.15) * 10000) / 10000;
}

// ======================= Proyección: probabilidad de subir y rango =======================

/** Distribución normal acumulada (Abramowitz-Stegun 7.1.26). */
function mercNormal_(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Inversa de la normal (Acklam), para p entre 0 y 1. */
function mercNormalInv_(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q0 = Math.min(Math.max(p, 1e-9), 1 - 1e-9);
  if (q0 < 0.02425) { const q = Math.sqrt(-2 * Math.log(q0)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (q0 > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - q0)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = q0 - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * Cuánto puede subir o bajar la acción en el plazo, en su moneda (pesos para las .BA, dólares el resto):
 *  - parte de cómo se movió ESA acción en ventanas del mismo plazo en los últimos 3 años (tasa base): el rango
 *    normal (2 de cada 3 veces) da el desvío, y la mitad de la mediana histórica da la tendencia (la mitad: lo
 *    que pasó suele exagerar lo que viene);
 *  - corre el centro según la probabilidad de ganarle al índice del pronóstico: si es p, el centro se mueve
 *    z(p) veces el desvío habitual de la acción contra el índice (56 % → +0,15 desvíos).
 * Devuelve {probSube, centro, desde, hasta} (desde/hasta: 2 de cada 3 veces), o null sin tasa base.
 */
function mercProyeccion_(probabilidad, tasaBase, cuant) {
  const t = tasaBase;
  if (!t || !t.rango || !t.rangoExceso) return null;
  const sOwn = (t.rango.p84 - t.rango.p16) / 2, sRel = (t.rangoExceso.p84 - t.rangoExceso.p16) / 2;
  if (!(sOwn > 0) || !(sRel >= 0)) return null;
  let p = probabilidad !== null && probabilidad !== undefined && probabilidad !== '' ? Number(probabilidad) : (cuant ? cuant.probabilidad : 50);
  if (!isFinite(p)) p = 50;
  p = Math.max(5, Math.min(95, p)) / 100;
  const tendencia = 0.5 * (t.rango.p50 || 0);
  const ajuste = sRel * mercNormalInv_(p);
  const centro = tendencia + ajuste;
  const r4 = x => Math.round(x * 10000) / 10000;
  return { probSube: Math.round(mercNormal_(centro / sOwn) * 100), centro: r4(centro), desde: r4(centro - sOwn), hasta: r4(centro + sOwn),
    desvio: r4(sOwn), tendencia: r4(tendencia), ajuste: r4(ajuste), probIndice: Math.round(p * 100) };
}

// ======================= Contexto de mercado =======================

function mercContexto_(simbolo, busqueda, grafico) {
  const sim = String(simbolo || '').toUpperCase();
  const local = mercEsLocal_(sim);
  const argentina = local || MERC_ADR_ARG.indexOf(sim) >= 0 || busqueda.bolsa === 'BUE';
  const lineas = [];
  const pct = mercPctTxt_;
  const varDias = (g, dias) => g && g.ok && g.filas.length > dias ? g.precio / g.filas[g.filas.length - 1 - dias][1] - 1 : null;
  const comparar = (nombre, g) => {
    if (!grafico.ok || !g || !g.ok) return;
    const partes = [];
    [['un mes', 21], ['tres meses', 63]].forEach(x => {
      const a = varDias(grafico, x[1]), b = varDias(g, x[1]);
      if (a === null || b === null) return;
      const dif = a - b;
      partes.push('en ' + x[0] + ' la acción ' + pct(a) + ' contra ' + pct(b) + (Math.abs(dif) < 0.01 ? ' (parecido)' : ' (' + (dif > 0 ? 'mejor' : 'peor') + ' por ' + pct(Math.abs(dif)).substring(1) + ')'));
    });
    if (partes.length) lineas.push('Contra ' + nombre + ': ' + partes.join('; '));
  };

  // Índice: Merval para las locales, S&P 500 para el resto (y también para los ADR argentinos).
  if (local) comparar('el Merval (en pesos)', mercGrafico_('^MERV'));
  comparar('el S&P 500', mercGrafico_('^GSPC'));
  const sec = MERC_SECTOR_ETF[claveTexto(busqueda.sector)];
  if (sec) comparar('su sector, ' + sec[1] + ' en EE.UU. (' + sec[0] + ')', mercGrafico_(sec[0]));
  if (busqueda.sector) lineas.push('Sector: ' + busqueda.sector + (busqueda.industria ? ' · ' + busqueda.industria : ''));

  if (argentina) {
    try {
      const d = cotizacionesDolar_();
      if (d && d.ok) {
        const t = [];
        if (d.oficial) t.push('oficial ' + mercNum_(d.oficial.venta));
        if (d.mep) t.push('MEP ' + mercNum_(d.mep.venta));
        if (d.ccl) t.push('contado con liqui ' + mercNum_(d.ccl.venta));
        if (d.oficial && d.ccl) t.push('brecha CCL/oficial ' + pct(d.ccl.venta / d.oficial.venta - 1));
        if (t.length) lineas.push('Dólar hoy (venta): ' + t.join(', ') + (d.fecha ? ' (' + d.fecha + ')' : ''));
      }
    } catch (e) {}
    const rp = mercRiesgoPais_();
    if (rp) lineas.push('Riesgo país: ' + rp.valor + ' puntos' + (rp.hace30 ? ' (hace un mes ' + rp.hace30 + ', ' + (rp.valor < rp.hace30 ? 'bajó' : rp.valor > rp.hace30 ? 'subió' : 'igual') + ')' : '') + (rp.hace90 ? '; hace tres meses ' + rp.hace90 : ''));
    if (local && grafico.ok) {
      const ccl = mercCcl_();
      if (ccl.length) {
        const g = grafico.filas, n = g.length;
        const usd = dias => {
          if (n <= dias) return null;
          const a = mercCclEn_(ccl, g[n - 1 - dias][0]), b = mercCclEn_(ccl, g[n - 1][0]);
          return a && b ? (g[n - 1][1] / b) / (g[n - 1 - dias][1] / a) - 1 : null;
        };
        const u1 = usd(21), u3 = usd(63);
        if (u1 !== null) lineas.push('En dólares (contado con liqui): un mes ' + pct(u1) + (u3 !== null ? ', tres meses ' + pct(u3) : ''));
      }
    }
  }
  return { lineas: lineas, argentina: argentina };
}

/** 1234567 → "$ 1.234.567". */
function mercNum_(n) {
  const t = String(Math.round(Math.abs(n)));
  let r = '';
  for (let i = 0; i < t.length; i++) {
    if (i > 0 && (t.length - i) % 3 === 0) r += '.';
    r += t.charAt(i);
  }
  return (n < 0 ? '-$ ' : '$ ') + r;
}

/** Riesgo país de argentinadatos.com (guardado 1 hora). */
function mercRiesgoPais_() {
  const cache = CacheService.getScriptCache();
  const g = cache.get('merc_riesgo');
  if (g) { try { return JSON.parse(g); } catch (e) {} }
  const lista = mercFetchJson_('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais');
  if (!Array.isArray(lista) || !lista.length) return null;
  const ult = lista[lista.length - 1];
  const antes = dias => {
    const lim = sumarDias(String(ult.fecha).substring(0, 10), -dias);
    for (let i = lista.length - 1; i >= 0; i--) if (String(lista[i].fecha).substring(0, 10) <= lim) return Number(lista[i].valor);
    return null;
  };
  const r = { valor: Number(ult.valor), fecha: String(ult.fecha).substring(0, 10), hace30: antes(30), hace90: antes(90) };
  try { cache.put('merc_riesgo', JSON.stringify(r), 3600); } catch (e) {}
  return r;
}

/** Contado con liqui diario de los últimos años (argentinadatos.com, guardado 3 horas): [[aaaa-mm-dd, venta]]. */
function mercCcl_() {
  const cache = CacheService.getScriptCache();
  const g = cache.get('merc_ccl');
  if (g) { try { return JSON.parse(g); } catch (e) {} }
  const lista = mercFetchJson_('https://api.argentinadatos.com/v1/cotizaciones/dolares/contadoconliqui');
  if (!Array.isArray(lista)) return [];
  const desde = sumarDias(ahoraLocal().hoy, -1200);
  const out = lista.map(x => [String((x && x.fecha) || '').substring(0, 10), Number(x && (x.venta || x.compra))])
    .filter(x => x[0] >= desde && x[1] > 0).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  try { cache.put('merc_ccl', JSON.stringify(out), 3 * 3600); } catch (e) {}
  return out;
}

function mercCclEn_(ccl, iso) {
  const i = mercIndiceHasta_(ccl.map(x => x[0]), iso);
  return i >= 0 ? ccl[i][1] : null;
}

/** Dólar implícito de la acción local contra su ADR, comparado con el contado con liqui. */
function mercBrechaAdr_(local, grafico) {
  const par = MERC_PAR_ADR[local];
  if (!par || !grafico.ok) return null;
  const adr = mercGrafico_(par[0]);
  const ccl = mercCcl_();
  if (!adr.ok || !ccl.length) return null;
  const implicito = grafico.precio / (adr.precio / par[1]);
  const cclHoy = ccl[ccl.length - 1][1];
  const brecha = implicito / cclHoy - 1;
  // Más de 15 % de diferencia no es arbitraje: seguramente cambió el ratio del ADR.
  if (!isFinite(brecha) || Math.abs(brecha) > 0.15) return null;
  return { adr: par[0], implicito: implicito, ccl: cclHoy, brecha: brecha };
}

// ======================= Historial y verificación =======================

function mercGuardar_(a, u) {
  try {
    const hoja = obtenerHoja_(MERC_HOJA, MERC_HEADERS);
    const detalle = { motivosSuba: a.motivosSuba, motivosBaja: a.motivosBaja, queCambiaria: a.queCambiaria, aMirar: a.aMirar, tecnico: a.tecnico, conNoticiasEnVivo: a.conNoticiasEnVivo,
      escenarios: a.escenarios, masProbable: a.masProbable, eventos: a.eventos, contexto: a.contexto, argentina: a.argentina,
      cuant: a.cuant, tasaBase: a.tasaBase, coincidencia: a.coincidencia, referencia: a.referencia, sobreIndicadores: a.sobreIndicadores };
    const fila = {
      'ID': a.id, 'Fecha': a.fecha, 'Usuario': u['Usuario'], 'Símbolo': a.simbolo, 'Nombre': a.nombre, 'Horizonte': a.horizonte,
      'Inclinación': a.inclinacion, 'Confianza': a.confianza, 'Precio': a.precio === null ? '' : a.precio, 'Moneda': a.moneda,
      'Resumen': a.resumen, 'Detalle': JSON.stringify(detalle).substring(0, 45000), 'Fuentes': JSON.stringify(a.fuentes).substring(0, 20000),
      'Verificar el': a.verificarEl, 'Precio al verificar': '', 'Variación': '', 'Resultado': a.precio === null ? 'Sin precio' : '', 'Modelo': a.modelo,
      'Referencia': a.referencia.simbolo, 'Precio referencia': a.referencia.precio === null ? '' : a.referencia.precio,
      'Probabilidad': a.probabilidad === null ? '' : a.probabilidad, 'Puntaje': a.cuant ? a.cuant.puntaje : '',
      'Señal cuantitativa': a.cuant ? a.cuant.direccion : '', 'Banda': a.tasaBase && a.tasaBase.banda ? a.tasaBase.banda : '',
      'Sector': a.sector, 'Mercado': a.mercado, 'Coincidencia': a.coincidencia.votos + '/' + a.coincidencia.total,
      'Variación referencia': '', 'Exceso': '', 'Variación USD': '', 'Regla tendencia': a.reglaTendencia || '', 'Método': MERC_METODO
    };
    hoja.appendRow(MERC_HEADERS.map(h => fila[h]));
  } catch (e) {
    console.log('Mercados · no se pudo guardar: ' + e.message);
  }
}

/** "dd/MM/yyyy HH:mm" o Date → aaaa-mm-dd. */
function mercIsoDeFecha_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const s = String(v || '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return mercIso_(s);
}

/**
 * Verifica un pronóstico contra su índice (f: fila como arreglo; col: índice de cada título).
 * Sirve también para pasar al método nuevo los que se verificaron con el viejo (solo "subió/bajó").
 * Devuelve false si todavía no se puede (sin precios).
 */
function mercEvaluar_(f, col, hoy) {
  const sim = String(f[col('Símbolo')]);
  const p0 = Number(f[col('Precio')]);
  const fecha = mercIsoDeFecha_(f[col('Fecha')]);
  const verificar = mercIso_(f[col('Verificar el')]);
  if (!p0 || !fecha || !verificar) return false;
  const g = mercGrafico_(sim);
  const refSim = String(f[col('Referencia')] || '') || mercReferencia_(sim).simbolo;
  const gRef = mercGrafico_(refSim);
  if (!g.ok || !gRef.ok) return false;
  const al = mercAlinear_(g, gRef);
  // Cierre en el día de verificación (o el primero después). Si todavía no hay: el mismo día se espera
  // al cierre; pasado ese día (feriado, fin de semana o Yahoo atrasado) se usa el último disponible.
  let i1 = al.fechas.findIndex(x => x >= verificar);
  if (i1 < 0) {
    if (verificar >= hoy) return false;
    i1 = al.fechas.length - 1;
  }
  const t0 = mercIndiceHasta_(al.fechas, fecha);
  if (t0 < 0 || i1 <= t0) return false;
  const r0 = Number(f[col('Precio referencia')]) || al.r[t0];
  const p1 = al.p[i1], r1 = al.r[i1];
  const v = p1 / p0 - 1, vb = r1 / r0 - 1, e = (1 + v) / (1 + vb) - 1;
  const hId = String(f[col('Horizonte')]);
  const h = MERC_HORIZONTES[hId] || MERC_HORIZONTES.mes;
  let banda = Number(f[col('Banda')]);
  if (!banda) { banda = mercBanda_(al, t0, h.ruedas) || h.umbral / 2; f[col('Banda')] = banda; }
  if (!f[col('Regla tendencia')]) f[col('Regla tendencia')] = mercReglaTendencia_(al, t0);
  if (!f[col('Referencia')]) f[col('Referencia')] = refSim;
  if (!f[col('Precio referencia')]) f[col('Precio referencia')] = r0;
  if (!f[col('Mercado')]) f[col('Mercado')] = mercMercado_(sim, '');
  if (mercEsLocal_(sim)) {
    const ccl = mercCcl_();
    const c0 = mercCclEn_(ccl, fecha), c1 = mercCclEn_(ccl, al.fechas[i1]);
    if (c0 && c1) f[col('Variación USD')] = Math.round(((p1 / c1) / (p0 / c0) - 1) * 10000) / 10000;
  }
  const inc = String(f[col('Inclinación')]);
  // Los pronósticos viejos (sin probabilidad ni indicadores) preguntaban si subía o bajaba: se los sigue
  // juzgando así, pero se guarda también cómo les fue contra el índice.
  const viejo = String(f[col('Probabilidad')]) === '' && String(f[col('Puntaje')]) === '';
  const h0 = MERC_HORIZONTES[hId] || MERC_HORIZONTES.mes;
  const acerto = viejo
    ? (inc === 'alcista' ? v > 0 : inc === 'bajista' ? v < 0 : Math.abs(v) <= h0.umbral)
    : (inc === 'alcista' ? e > 0 : inc === 'bajista' ? e < 0 : Math.abs(e) <= banda);
  f[col('Precio al verificar')] = p1;
  f[col('Variación')] = Math.round(v * 10000) / 10000;
  f[col('Variación referencia')] = Math.round(vb * 10000) / 10000;
  f[col('Exceso')] = Math.round(e * 10000) / 10000;
  f[col('Resultado')] = acerto ? 'Acertó' : 'Falló';
  f[col('Método')] = MERC_METODO;
  return true;
}

/** Cómo viene el pronóstico pendiente: exceso contra el índice desde que se hizo. */
function mercSeguimiento_(f, col, hoy) {
  const sim = String(f[col('Símbolo')]);
  const p0 = Number(f[col('Precio')]);
  const fecha = mercIsoDeFecha_(f[col('Fecha')]);
  if (!p0 || !fecha) return null;
  const g = mercGrafico_(sim);
  const refSim = String(f[col('Referencia')] || '') || mercReferencia_(sim).simbolo;
  const gRef = mercGrafico_(refSim);
  if (!g.ok || !gRef.ok) return null;
  const al = mercAlinear_(g, gRef);
  const t0 = mercIndiceHasta_(al.fechas, fecha);
  if (t0 < 0) return null;
  const r0 = Number(f[col('Precio referencia')]) || al.r[t0];
  const v = g.precio / p0 - 1, vb = gRef.precio / r0 - 1, e = (1 + v) / (1 + vb) - 1;
  const h = MERC_HORIZONTES[String(f[col('Horizonte')])] || MERC_HORIZONTES.mes;
  const banda = Number(f[col('Banda')]) || h.umbral / 2;
  const inc = String(f[col('Inclinación')]);
  const va = inc === 'neutral' ? (Math.abs(e) <= banda ? 'bien' : 'mal') : (inc === 'alcista' ? e > 0 : e < 0) ? 'bien' : 'mal';
  const verificar = mercIso_(f[col('Verificar el')]);
  const faltan = Math.max(0, Math.round((fechaUtc(verificar) - fechaUtc(hoy)) / 86400000));
  return { variacion: v, variacionReferencia: vb, exceso: e, va: va, faltan: faltan };
}

function mercHistorial_() {
  // Análisis cargados a mano (MercadosCarga.gs), si el archivo existe: se suman de a tandas.
  let manualesFaltan = 0;
  if (typeof mercCargarManuales_ === 'function') {
    try { manualesFaltan = mercCargarManuales_(); } catch (e) { console.log('Mercados · carga manual: ' + e.message); }
  }
  const hoja = obtenerHoja_(MERC_HOJA, MERC_HEADERS);
  const ultima = hoja.getLastRow();
  if (ultima < 2) return { ok: true, items: [], resumen: mercResumen_([]) };
  const rango = hoja.getRange(2, 1, ultima - 1, MERC_HEADERS.length);
  const valores = rango.getValues();
  const col = h => MERC_HEADERS.indexOf(h);
  const hoy = ahoraLocal().hoy;
  const inicio = Date.now();
  let cambios = false, trabajados = 0;
  valores.forEach(f => {
    if (trabajados >= 40 || Date.now() - inicio > 60000) return;
    const verificar = mercIso_(f[col('Verificar el')]);
    const res = String(f[col('Resultado')] || '');
    const pendiente = !res && verificar && verificar <= hoy;
    // Los verificados con el método viejo (solo "subió o bajó") se vuelven a medir contra el índice.
    const viejo = (res === 'Acertó' || res === 'Falló') && String(f[col('Método')] || '') !== MERC_METODO;
    if (!pendiente && !viejo) return;
    try {
      if (mercEvaluar_(f, col, hoy)) { cambios = true; trabajados++; }
    } catch (e) { console.log('Mercados · verificar ' + f[col('Símbolo')] + ': ' + e.message); }
  });
  if (cambios) rango.setValues(valores);
  const num = v => v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v);
  let seguidos = 0;
  const items = valores.map(f => {
    let detalle = {}, fuentes = [];
    try { detalle = JSON.parse(f[col('Detalle')] || '{}'); } catch (e) {}
    try { fuentes = JSON.parse(f[col('Fuentes')] || '[]'); } catch (e) {}
    const h = MERC_HORIZONTES[f[col('Horizonte')]] || MERC_HORIZONTES.mes;
    const refSim = String(f[col('Referencia')] || '') || mercReferencia_(String(f[col('Símbolo')])).simbolo;
    return {
      id: String(f[col('ID')]), fecha: mercTexto_(f[col('Fecha')]), fechaIso: mercIsoDeFecha_(f[col('Fecha')]), simbolo: String(f[col('Símbolo')]), nombre: String(f[col('Nombre')]),
      horizonte: String(f[col('Horizonte')]), horizonteNombre: h.nombre, dias: h.dias, inclinacion: String(f[col('Inclinación')]), confianza: String(f[col('Confianza')]),
      precio: num(f[col('Precio')]), moneda: String(f[col('Moneda')]), resumen: String(f[col('Resumen')]),
      motivosSuba: detalle.motivosSuba || [], motivosBaja: detalle.motivosBaja || [], queCambiaria: detalle.queCambiaria || [],
      aMirar: detalle.aMirar || [], tecnico: detalle.tecnico || [], conNoticiasEnVivo: !!detalle.conNoticiasEnVivo, fuentes: fuentes,
      escenarios: detalle.escenarios || [], masProbable: detalle.masProbable || '', eventos: detalle.eventos || [], contexto: detalle.contexto || [],
      cuant: detalle.cuant || null, tasaBase: detalle.tasaBase || null, coincidencia: detalle.coincidencia || null, sobreIndicadores: detalle.sobreIndicadores || '',
      referencia: { simbolo: refSim, nombre: mercNombreReferencia_(refSim) },
      probabilidad: num(f[col('Probabilidad')]), puntaje: num(f[col('Puntaje')]), senalCuant: String(f[col('Señal cuantitativa')] || ''),
      banda: num(f[col('Banda')]), sector: String(f[col('Sector')] || ''), mercado: String(f[col('Mercado')] || ''),
      reglaTendencia: String(f[col('Regla tendencia')] || ''), metodo: String(f[col('Método')] || ''),
      verificarEl: mercIso_(f[col('Verificar el')]), precioFinal: num(f[col('Precio al verificar')]),
      variacion: num(f[col('Variación')]), variacionReferencia: num(f[col('Variación referencia')]), exceso: num(f[col('Exceso')]),
      variacionUsd: num(f[col('Variación USD')]), resultado: String(f[col('Resultado')] || ''), modelo: String(f[col('Modelo')] || ''),
      proyeccion: mercProyeccion_(num(f[col('Probabilidad')]), detalle.tasaBase || null, detalle.cuant || null),
      _fila: f
    };
  }).reverse();
  // Cómo vienen los pendientes (los más recientes primero, con tope para no tardar).
  items.forEach(it => {
    if (it.resultado || seguidos >= 15 || Date.now() - inicio > 90000) return;
    try { it.seguimiento = mercSeguimiento_(it._fila, col, hoy); seguidos++; } catch (e) {}
  });
  items.forEach(it => { delete it._fila; });
  const resumen = mercResumen_(items);
  resumen.manualesFaltan = manualesFaltan;
  return { ok: true, items: items.slice(0, 200), resumen: resumen };
}

// ======================= Estadística de aciertos =======================

/** Intervalo de Wilson al 95 % para una proporción (aciertos de n). */
function mercWilson_(aciertos, n) {
  if (!n) return null;
  const z = 1.96, p = aciertos / n, den = 1 + z * z / n;
  const centro = (p + z * z / (2 * n)) / den;
  const margen = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
  return { desde: Math.max(0, centro - margen), hasta: Math.min(1, centro + margen) };
}

function mercTasa_(aciertos, n) {
  return { n: n, aciertos: aciertos, tasa: n ? aciertos / n : null, intervalo: mercWilson_(aciertos, n) };
}

/** ¿Acierta la dirección "dir" con este exceso y esta banda? */
function mercAciertaDir_(dir, e, banda) {
  return dir === 'alcista' ? e > 0 : dir === 'bajista' ? e < 0 : Math.abs(e) <= banda;
}

/**
 * Estadística sobre los verificados con el método nuevo, sin repetir: si la misma acción se analizó con
 * el mismo plazo antes de que venciera un pronóstico anterior, cuenta solo el primero (si no, un mismo
 * movimiento del precio se contaría varias veces).
 */
function mercResumen_(items) {
  // Solo los pronósticos nuevos (contra el índice): los viejos preguntaban otra cosa (si subía o bajaba).
  const nuevo = x => x.probabilidad !== null || !!x.cuant;
  const verificado = x => x.resultado === 'Acertó' || x.resultado === 'Falló';
  const cerrados = items.filter(x => verificado(x) && nuevo(x) && x.metodo === MERC_METODO && x.exceso !== null);
  const orden = cerrados.slice().sort((a, b) => (a.fechaIso || '').localeCompare(b.fechaIso || ''));
  const ultimoContado = {};
  const unicos = orden.filter(x => {
    const k = x.simbolo + '|' + x.horizonte;
    const u = ultimoContado[k];
    if (u && x.fechaIso && u.fechaIso && x.fechaIso < sumarDias(u.fechaIso, x.dias || 30)) return false;
    ultimoContado[k] = x;
    return true;
  });
  const n = unicos.length;
  const banda = x => x.banda || (MERC_HORIZONTES[x.horizonte] || MERC_HORIZONTES.mes).umbral / 2;
  const contar = (lista, fn) => lista.filter(fn).length;

  const gemini = mercTasa_(contar(unicos, x => x.resultado === 'Acertó'), n);
  const siempre = mercTasa_(contar(unicos, x => x.exceso > 0), n);
  const conRegla = unicos.filter(x => x.reglaTendencia);
  const regla = mercTasa_(contar(conRegla, x => mercAciertaDir_(x.reglaTendencia, x.exceso, banda(x))), conRegla.length);
  const conPuntaje = unicos.filter(x => x.puntaje !== null && x.senalCuant);
  const indicadores = mercTasa_(contar(conPuntaje, x => mercAciertaDir_(x.senalCuant, x.exceso, banda(x))), conPuntaje.length);
  // Combinado: promedio de la probabilidad de Gemini y la de los indicadores.
  const conAmbas = unicos.filter(x => x.probabilidad !== null && x.puntaje !== null);
  const probComb = x => (x.probabilidad + (50 + 12 * x.puntaje)) / 2;
  const dirComb = x => probComb(x) > 52 ? 'alcista' : probComb(x) < 48 ? 'bajista' : 'neutral';
  const combinado = mercTasa_(contar(conAmbas, x => mercAciertaDir_(dirComb(x), x.exceso, banda(x))), conAmbas.length);

  // Calibración y puntaje de Brier (0 = perfecto, 0,25 = decir siempre 50 %).
  const conProb = unicos.filter(x => x.probabilidad !== null);
  const brier = lista => lista.length ? lista.reduce((a, x) => { const y = x.exceso > 0 ? 1 : 0; const pp = x.probabilidad / 100; return a + (pp - y) * (pp - y); }, 0) / lista.length : null;
  const tramos = [[0, 40, 'menos de 40 %'], [40, 50, '40 a 49 %'], [50, 60, '50 a 59 %'], [60, 70, '60 a 69 %'], [70, 101, '70 % o más']];
  const calibracion = tramos.map(t => {
    const l = conProb.filter(x => x.probabilidad >= t[0] && x.probabilidad < t[1]);
    return { tramo: t[2], n: l.length, dijo: l.length ? l.reduce((a, x) => a + x.probabilidad, 0) / l.length / 100 : null,
      paso: l.length ? contar(l, x => x.exceso > 0) / l.length : null };
  }).filter(t => t.n);

  const porDimension = (fn) => {
    const g = {};
    unicos.forEach(x => { const k = fn(x) || 'Sin dato'; (g[k] = g[k] || []).push(x); });
    return Object.keys(g).map(k => Object.assign({ grupo: k }, mercTasa_(contar(g[k], x => x.resultado === 'Acertó'), g[k].length)))
      .sort((a, b) => b.n - a.n);
  };
  const NOMBRE_INC = { alcista: 'Mejor que el índice', bajista: 'Peor que el índice', neutral: 'Parecido al índice' };

  return {
    total: items.length, pendientes: items.filter(x => !x.resultado).length, verificados: cerrados.length, unicos: n,
    viejos: items.filter(x => verificado(x) && !nuevo(x)).length,
    gemini: gemini, siempreAlcista: siempre, reglaTendencia: regla, indicadores: indicadores, combinado: combinado,
    brier: brier(conProb), brierN: conProb.length, calibracion: calibracion,
    excesoPromedio: n ? unicos.reduce((a, x) => a + (x.inclinacion === 'bajista' ? -x.exceso : x.inclinacion === 'alcista' ? x.exceso : 0), 0) / n : null,
    grupos: {
      'Plazo': porDimension(x => x.horizonteNombre),
      'Confianza': porDimension(x => x.confianza),
      'Pronóstico': porDimension(x => NOMBRE_INC[x.inclinacion] || x.inclinacion),
      'Mercado': porDimension(x => x.mercado),
      'Sector': porDimension(x => x.sector),
      'Modelo de Gemini': porDimension(x => x.modelo)
    },
    // Compatibilidad con la pantalla vieja.
    aciertos: gemini.aciertos
  };
}

/** Lo que se le cuenta a Gemini de su propio historial (método nuevo). */
function mercHistorialParaPrompt_(simbolo) {
  try {
    const hoja = obtenerHoja_(MERC_HOJA, MERC_HEADERS);
    const ultima = hoja.getLastRow();
    if (ultima < 2) return [];
    const valores = hoja.getRange(2, 1, ultima - 1, MERC_HEADERS.length).getValues();
    const col = h => MERC_HEADERS.indexOf(h);
    const cerrados = valores.filter(f => String(f[col('Método')]) === MERC_METODO && (f[col('Resultado')] === 'Acertó' || f[col('Resultado')] === 'Falló'));
    if (!cerrados.length) return [];
    const l = [];
    const tasa = lista => lista.length ? Math.round(lista.filter(f => f[col('Resultado')] === 'Acertó').length * 100 / lista.length) + ' % de ' + lista.length : '';
    l.push('En total acertaste ' + tasa(cerrados) + ' pronósticos verificados.');
    ['alcista', 'bajista', 'neutral'].forEach(i => {
      const x = cerrados.filter(f => f[col('Inclinación')] === i);
      if (x.length >= 3) l.push('Cuando dijiste "' + i + '": ' + tasa(x) + '.');
    });
    const contra = cerrados.filter(f => f[col('Señal cuantitativa')] && f[col('Señal cuantitativa')] !== 'neutral' && f[col('Inclinación')] !== 'neutral' && f[col('Señal cuantitativa')] !== f[col('Inclinación')]);
    if (contra.length >= 3) l.push('Cuando fuiste en contra de los indicadores: ' + tasa(contra) + '.');
    const altas = cerrados.filter(f => Number(f[col('Probabilidad')]) >= 65 || (f[col('Probabilidad')] !== '' && Number(f[col('Probabilidad')]) <= 35));
    if (altas.length >= 3) l.push('Cuando diste probabilidades extremas (65 % o más, o 35 % o menos): ' + tasa(altas) + '.');
    const propios = cerrados.filter(f => String(f[col('Símbolo')]).toUpperCase() === String(simbolo).toUpperCase()).slice(-5);
    propios.forEach(f => l.push('Con esta acción, el ' + mercTexto_(f[col('Fecha')]).substring(0, 10) + ' dijiste "' + f[col('Inclinación')] + '" a ' +
      (MERC_HORIZONTES[f[col('Horizonte')]] || MERC_HORIZONTES.mes).nombre.toLowerCase() + ': ' + String(f[col('Resultado')]).toLowerCase() +
      ' (contra el índice ' + mercPctTxt_(Number(f[col('Exceso')])) + ').'));
    return l;
  } catch (e) {
    return [];
  }
}

/** Celda de fecha (Date o texto aaaa-mm-dd) → aaaa-mm-dd. */
function mercIso_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const s = String(v || '').trim();
  return s.length >= 10 && s.charAt(4) === '-' ? s.substring(0, 10) : '';
}

function mercTexto_(v) {
  return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') : String(v || '');
}
