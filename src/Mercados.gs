/**
 * Mercados — pronóstico justificado de subas y bajas de acciones (solo para el dueño).
 *
 * Archivo independiente. Para quitarlo: borrar este archivo y las líneas marcadas con
 * "MERCADOS" en Código.gs e Index.html.
 *
 * Para una acción (YPF, GGAL, AAPL, YPFD.BA…) junta:
 *  - el comportamiento del precio (Yahoo Finance, gráfico diario de un año): variaciones,
 *    medias móviles, distancia al máximo, volatilidad y volumen;
 *  - las noticias recientes (búsqueda de Google desde Gemini y, de respaldo, las de Yahoo);
 * y le pide a Gemini que arme los motivos para que suba, los motivos para que baje,
 * hacia dónde se inclina la balanza, con qué confianza y qué cambiaría el pronóstico.
 * No da precios objetivo. Cada pronóstico se guarda en la hoja "Mercados · Pronósticos"
 * y, al cumplirse el plazo, se verifica solo si acertó.
 *
 * La página habla con el servidor por la acción "mercados" de api():
 *   {op: 'estado'}                         → si está activo y la lista de horizontes.
 *   {op: 'analizar', simbolo, horizonte}   → pronóstico nuevo (y lo guarda).
 *   {op: 'historial'}                      → pronósticos guardados, verificando los vencidos.
 *
 * Propiedades del script:
 *   GEMINI_API_KEY      (obligatoria, la misma del asistente).
 *   MERCADOS_USUARIOS   (opcional) usuarios que entran, separados por coma (el usuario de
 *                       ingreso o su ID). Si no está, entra solo el primer usuario creado.
 */

const MERC_HOJA = 'Mercados · Pronósticos';
const MERC_HEADERS = ['ID', 'Fecha', 'Usuario', 'Símbolo', 'Nombre', 'Horizonte', 'Inclinación', 'Confianza',
  'Precio', 'Moneda', 'Resumen', 'Detalle', 'Fuentes', 'Verificar el', 'Precio al verificar', 'Variación', 'Resultado', 'Modelo'];
const MERC_PROP_USUARIOS = 'MERCADOS_USUARIOS';
const MERC_LIMITE_HORA = 15;
const MERC_HORIZONTES = {
  semana: { nombre: 'Una semana', dias: 7, umbral: 0.02 },
  mes: { nombre: 'Un mes', dias: 30, umbral: 0.04 },
  trimestre: { nombre: 'Tres meses', dias: 91, umbral: 0.07 }
};
const MERC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function mercados_(d, u) {
  if (!tieneAccesoMercados_(u)) return { ok: false, error: 'No tenés acceso a Mercados.' };
  const op = String((d && d.op) || 'estado');
  if (op === 'estado') return mercEstado_();
  if (op === 'analizar') return mercAnalizar_(d, u);
  if (op === 'historial') return mercHistorial_();
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
  cache.put(k, String(n + 1), 3700);
  return { ok: true };
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

  // 1) Qué acción es y cómo viene el precio.
  const busqueda = mercBuscarYahoo_(pedido);
  const simbolo = busqueda.simbolo || pedido.toUpperCase();
  const grafico = mercGrafico_(simbolo);
  const tecnico = grafico.ok ? mercTecnico_(grafico) : null;
  const nombre = (grafico.ok && grafico.nombre) || busqueda.nombre || simbolo;

  // 2) Gemini arma el pronóstico (con búsqueda de Google si la cuota lo permite).
  const hoy = ahoraLocal().hoy;
  const prompt = mercPrompt_(pedido, simbolo, nombre, h, tecnico, busqueda.noticias, hoy);
  const r = mercPreguntarGemini_(clave, prompt);
  if (!r.ok) return r;
  const p = mercParsear_(r.texto);
  if (!p) return { ok: false, error: 'Gemini no devolvió el análisis en el formato esperado. Probá de nuevo.' };

  const fuentes = r.fuentes.length ? r.fuentes : busqueda.noticias.map(n => ({ titulo: n.titulo, url: n.url }));
  const res = {
    id: Utilities.getUuid().substring(0, 8),
    fecha: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
    simbolo: simbolo, nombre: p.empresa || nombre, horizonte: hId, horizonteNombre: h.nombre,
    inclinacion: mercUnoDe_(p.inclinacion, ['alcista', 'bajista', 'neutral'], 'neutral'),
    confianza: mercUnoDe_(p.confianza, ['baja', 'media', 'alta'], 'baja'),
    resumen: String(p.resumen || ''),
    motivosSuba: mercMotivos_(p.motivosSuba), motivosBaja: mercMotivos_(p.motivosBaja),
    queCambiaria: mercTextos_(p.queCambiaria), aMirar: mercTextos_(p.aMirar),
    precio: tecnico ? tecnico.precio : null, moneda: grafico.ok ? grafico.moneda : '',
    tecnico: tecnico ? tecnico.lineas : [], conNoticiasEnVivo: r.conBusqueda,
    fuentes: fuentes.slice(0, 10), modelo: r.modelo,
    verificarEl: sumarDias(hoy, h.dias)
  };
  mercGuardar_(res, u);
  return { ok: true, analisis: res };
}

function mercUnoDe_(v, lista, def) {
  const k = claveTexto(v);
  return lista.indexOf(k) >= 0 ? k : def;
}

function mercMotivos_(lista) {
  return (Array.isArray(lista) ? lista : []).slice(0, 6).map(m => ({
    titulo: String((m && m.titulo) || m || '').substring(0, 160),
    detalle: String((m && m.detalle) || '').substring(0, 700)
  })).filter(m => m.titulo);
}

function mercTextos_(lista) {
  return (Array.isArray(lista) ? lista : []).slice(0, 5).map(x => String(x || '').substring(0, 300)).filter(Boolean);
}

function mercPrompt_(pedido, simbolo, nombre, h, tecnico, noticias, hoy) {
  const l = [];
  l.push('Hoy es ' + isoAMostrar(hoy) + '. Analizá la acción "' + nombre + '" (símbolo ' + simbolo + '; el usuario escribió "' + pedido + '").');
  l.push('Horizonte del pronóstico: ' + h.nombre.toLowerCase() + '.');
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
  if (noticias.length) {
    l.push('');
    l.push('Titulares recientes de Yahoo Finance (pueden servir de punto de partida):');
    noticias.forEach(n => l.push('- ' + n.titulo + (n.fecha ? ' (' + n.fecha + ')' : '') + (n.medio ? ' · ' + n.medio : '')));
  }
  l.push('');
  l.push('Reglas:');
  l.push('- No des precios objetivo ni porcentajes inventados: el usuario quiere motivos claros, no cifras.');
  l.push('- Cada motivo tiene que ser concreto y explicar por qué empujaría el precio (causa → efecto). Si sale de una noticia, mencioná de cuándo es.');
  l.push('- No inventes noticias. Si no encontrás información reciente, decilo en el resumen y bajá la confianza.');
  l.push('- La confianza es "alta" solo si casi todo empuja para el mismo lado; si hay fuerzas parejas, "baja" o "media" e inclinación "neutral".');
  l.push('- Escribí en español de Argentina, con voseo, claro y sin jerga innecesaria.');
  l.push('');
  l.push('Respondé SOLO con un objeto JSON válido, sin texto antes ni después, con esta forma:');
  l.push('{"empresa": "nombre de la empresa", "inclinacion": "alcista" | "bajista" | "neutral", "confianza": "baja" | "media" | "alta", ' +
    '"resumen": "2 o 3 oraciones con la conclusión y el motivo principal", ' +
    '"motivosSuba": [{"titulo": "frase corta", "detalle": "explicación de 1 a 3 oraciones"}], ' +
    '"motivosBaja": [{"titulo": "frase corta", "detalle": "explicación de 1 a 3 oraciones"}], ' +
    '"queCambiaria": ["qué hecho daría vuelta el pronóstico"], "aMirar": ["próximos eventos con fecha si se sabe: balance, datos, decisiones"]}');
  l.push('Entre 2 y 5 motivos de cada lado (si de un lado no hay motivos de peso, poné los que haya y decilo).');
  return l.join('\n');
}

/** Primero con búsqueda de Google; si el modelo o la cuota no la permiten, sin búsqueda. */
function mercPreguntarGemini_(clave, prompt) {
  const modelos = typeof asisModelos_ === 'function' ? asisModelos_(clave) : ['gemini-flash-latest', 'gemini-flash-lite-latest'];
  if (!modelos.length) return { ok: false, error: 'Se agotó la cuota gratuita de Gemini de hoy. Se renueva a la madrugada.' };
  let ultimo = 'No se pudo obtener respuesta de Gemini.';
  const inicio = Date.now();
  for (let conBusqueda = 1; conBusqueda >= 0; conBusqueda--) {
    for (let i = 0; i < modelos.length; i++) {
      if (Date.now() - inicio > 200000) return { ok: false, error: ultimo };
      const cuerpo = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
      if (conBusqueda) cuerpo.tools = [{ google_search: {} }];
      const r = mercLlamar_(clave, modelos[i], cuerpo);
      console.log('Mercados · ' + modelos[i] + (conBusqueda ? ' con búsqueda' : ' sin búsqueda') + ' · ' + (r.ok ? 'ok' : r.error));
      if (r.ok) { r.modelo = modelos[i]; r.conBusqueda = !!conBusqueda; return r; }
      ultimo = r.error;
      if (r.fatal) return r;
      // Si falla la búsqueda (sin cuota o no soportada), se pasa directo a la vuelta sin búsqueda.
      if (conBusqueda && r.busqueda) break;
    }
  }
  return { ok: false, error: ultimo };
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
  const codigo = res.getResponseCode();
  let json = {};
  try { json = JSON.parse(res.getContentText() || '{}'); } catch (e) {}
  const mensaje = String((json.error && json.error.message) || '');
  const m = claveTexto(mensaje);
  const conTools = !!cuerpo.tools;
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
    return { ok: false, busqueda: conTools, error: 'Se agotó la cuota gratuita de Gemini por ahora. Probá en unos minutos.' };
  }
  if (conTools && (codigo === 400 || codigo === 403)) return { ok: false, busqueda: true, error: 'La búsqueda de Google no está disponible para este modelo.' };
  return { ok: false, error: 'Gemini respondió con un error (' + codigo + ')' + (mensaje ? ': ' + mensaje.substring(0, 200) : '.') };
}

/** Saca el JSON de la respuesta (puede venir dentro de un bloque de código). */
function mercParsear_(texto) {
  const t = String(texto || '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.substring(a, b + 1)); } catch (e) { return null; }
}

// ======================= Yahoo Finance =======================

function mercFetchJson_(url) {
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': MERC_UA, 'Accept': 'application/json' } });
    if (res.getResponseCode() !== 200) return null;
    return JSON.parse(res.getContentText() || 'null');
  } catch (e) {
    console.log('Mercados · Yahoo: ' + e.message);
    return null;
  }
}

/** Símbolo, nombre y titulares a partir de lo que escribió el usuario. */
function mercBuscarYahoo_(texto) {
  const json = mercFetchJson_('https://query2.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(texto) + '&quotesCount=6&newsCount=8&lang=es-AR&region=AR');
  const vacio = { simbolo: '', nombre: '', noticias: [] };
  if (!json) return vacio;
  const quotes = (json.quotes || []).filter(q => q && q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'));
  const exacto = quotes.filter(q => String(q.symbol).toUpperCase() === String(texto).toUpperCase())[0];
  const q = exacto || quotes[0];
  const tz = Session.getScriptTimeZone();
  const noticias = (json.news || []).slice(0, 8).map(n => ({
    titulo: String(n.title || ''), medio: String(n.publisher || ''), url: String(n.link || ''),
    fecha: n.providerPublishTime ? Utilities.formatDate(new Date(n.providerPublishTime * 1000), tz, 'dd/MM/yyyy') : ''
  })).filter(n => n.titulo);
  return { simbolo: q ? String(q.symbol) : '', nombre: q ? String(q.longname || q.shortname || '') : '', noticias: noticias };
}

/** Cierres diarios del último año (y los cacheados por 30 minutos). */
function mercGrafico_(simbolo) {
  const cache = CacheService.getScriptCache();
  const k = 'merc_graf_' + simbolo;
  const guardado = cache.get(k);
  if (guardado) { try { return JSON.parse(guardado); } catch (e) {} }
  const json = mercFetchJson_('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(simbolo) + '?range=1y&interval=1d&includePrePost=false');
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r || !r.timestamp) return { ok: false };
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const tz = Session.getScriptTimeZone();
  const filas = [];
  r.timestamp.forEach((ts, i) => {
    const c = (q.close || [])[i];
    if (typeof c !== 'number' || isNaN(c)) return;
    filas.push([Utilities.formatDate(new Date(ts * 1000), tz, 'yyyy-MM-dd'), c, (q.volume || [])[i] || 0]);
  });
  if (filas.length < 5) return { ok: false };
  const meta = r.meta || {};
  const out = { ok: true, simbolo: simbolo, nombre: String(meta.longName || meta.shortName || ''), moneda: String(meta.currency || ''),
    mercado: String(meta.fullExchangeName || meta.exchangeName || ''), precio: typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : filas[filas.length - 1][1], filas: filas };
  try { cache.put(k, JSON.stringify(out), 1800); } catch (e) {}
  return out;
}

function mercTecnico_(g) {
  const cierres = g.filas.map(f => f[1]);
  const vols = g.filas.map(f => f[2]);
  const n = cierres.length;
  const precio = g.precio;
  const varDesde = dias => n > dias ? precio / cierres[n - 1 - dias] - 1 : null;
  const media = (lista, k) => lista.length >= k ? lista.slice(-k).reduce((a, x) => a + x, 0) / k : null;
  const pct = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1).split('.').join(',') + ' %';
  const lineas = [];
  lineas.push('Mercado: ' + (g.mercado || '—') + ' · moneda ' + (g.moneda || '—') + ' · último precio ' + precio.toFixed(2).split('.').join(','));
  const vars = [['una semana', 5], ['un mes', 21], ['tres meses', 63], ['seis meses', 126], ['un año', n - 1]]
    .map(x => { const v = varDesde(x[1]); return v === null ? '' : x[0] + ' ' + pct(v); }).filter(Boolean);
  if (vars.length) lineas.push('Variación en ' + vars.join(', '));
  [20, 50, 200].forEach(k => {
    const mm = media(cierres, k);
    if (mm) lineas.push('Media de ' + k + ' ruedas: el precio está ' + (precio >= mm ? 'por encima' : 'por debajo') + ' (' + pct(precio / mm - 1) + ')');
  });
  const max = Math.max.apply(null, cierres), min = Math.min.apply(null, cierres);
  lineas.push('Contra el máximo del año: ' + pct(precio / max - 1) + ' · contra el mínimo del año: ' + pct(precio / min - 1));
  if (n > 21) {
    const rets = [];
    for (let i = n - 20; i < n; i++) rets.push(Math.log(cierres[i] / cierres[i - 1]));
    const prom = rets.reduce((a, x) => a + x, 0) / rets.length;
    const desv = Math.sqrt(rets.reduce((a, x) => a + (x - prom) * (x - prom), 0) / (rets.length - 1));
    lineas.push('Volatilidad de las últimas 20 ruedas (anualizada): ' + (desv * Math.sqrt(252) * 100).toFixed(0) + ' %');
  }
  const v5 = media(vols, 5), v60 = media(vols, 60);
  if (v5 && v60) lineas.push('Volumen de la última semana contra el promedio de 3 meses: ' + pct(v5 / v60 - 1));
  return { precio: precio, lineas: lineas };
}

// ======================= Historial y verificación =======================

function mercGuardar_(a, u) {
  try {
    const hoja = obtenerHoja_(MERC_HOJA, MERC_HEADERS);
    const detalle = { motivosSuba: a.motivosSuba, motivosBaja: a.motivosBaja, queCambiaria: a.queCambiaria, aMirar: a.aMirar, tecnico: a.tecnico, conNoticiasEnVivo: a.conNoticiasEnVivo };
    const fila = {
      'ID': a.id, 'Fecha': a.fecha, 'Usuario': u['Usuario'], 'Símbolo': a.simbolo, 'Nombre': a.nombre, 'Horizonte': a.horizonte,
      'Inclinación': a.inclinacion, 'Confianza': a.confianza, 'Precio': a.precio === null ? '' : a.precio, 'Moneda': a.moneda,
      'Resumen': a.resumen, 'Detalle': JSON.stringify(detalle).substring(0, 45000), 'Fuentes': JSON.stringify(a.fuentes).substring(0, 20000),
      'Verificar el': a.verificarEl, 'Precio al verificar': '', 'Variación': '', 'Resultado': a.precio === null ? 'Sin precio' : '', 'Modelo': a.modelo
    };
    hoja.appendRow(MERC_HEADERS.map(h => fila[h]));
  } catch (e) {
    console.log('Mercados · no se pudo guardar: ' + e.message);
  }
}

function mercHistorial_() {
  const hoja = obtenerHoja_(MERC_HOJA, MERC_HEADERS);
  const ultima = hoja.getLastRow();
  if (ultima < 2) return { ok: true, items: [], resumen: mercResumen_([]) };
  const rango = hoja.getRange(2, 1, ultima - 1, MERC_HEADERS.length);
  const valores = rango.getValues();
  const col = h => MERC_HEADERS.indexOf(h);
  const hoy = ahoraLocal().hoy;
  let cambios = false, verificados = 0;
  valores.forEach(f => {
    const verificar = mercIso_(f[col('Verificar el')]);
    if (f[col('Resultado')] || !verificar || verificar > hoy || verificados >= 12) return;
    const g = mercGrafico_(String(f[col('Símbolo')]));
    if (!g.ok) return;
    const fila = g.filas.filter(x => x[0] >= verificar)[0] || (verificar <= hoy ? [hoy, g.precio] : null);
    if (!fila) return;
    const precio = Number(f[col('Precio')]);
    if (!precio) return;
    const v = fila[1] / precio - 1;
    const h = MERC_HORIZONTES[f[col('Horizonte')]] || MERC_HORIZONTES.mes;
    const inc = String(f[col('Inclinación')]);
    const acerto = inc === 'alcista' ? v > 0 : inc === 'bajista' ? v < 0 : Math.abs(v) <= h.umbral;
    f[col('Precio al verificar')] = fila[1];
    f[col('Variación')] = Math.round(v * 10000) / 10000;
    f[col('Resultado')] = acerto ? 'Acertó' : 'Falló';
    cambios = true;
    verificados++;
  });
  if (cambios) rango.setValues(valores);
  const items = valores.map(f => {
    let detalle = {}, fuentes = [];
    try { detalle = JSON.parse(f[col('Detalle')] || '{}'); } catch (e) {}
    try { fuentes = JSON.parse(f[col('Fuentes')] || '[]'); } catch (e) {}
    const h = MERC_HORIZONTES[f[col('Horizonte')]] || MERC_HORIZONTES.mes;
    return {
      id: String(f[col('ID')]), fecha: mercTexto_(f[col('Fecha')]), simbolo: String(f[col('Símbolo')]), nombre: String(f[col('Nombre')]),
      horizonte: String(f[col('Horizonte')]), horizonteNombre: h.nombre, inclinacion: String(f[col('Inclinación')]), confianza: String(f[col('Confianza')]),
      precio: f[col('Precio')] === '' ? null : Number(f[col('Precio')]), moneda: String(f[col('Moneda')]), resumen: String(f[col('Resumen')]),
      motivosSuba: detalle.motivosSuba || [], motivosBaja: detalle.motivosBaja || [], queCambiaria: detalle.queCambiaria || [],
      aMirar: detalle.aMirar || [], tecnico: detalle.tecnico || [], conNoticiasEnVivo: !!detalle.conNoticiasEnVivo, fuentes: fuentes,
      verificarEl: mercIso_(f[col('Verificar el')]), precioFinal: f[col('Precio al verificar')] === '' ? null : Number(f[col('Precio al verificar')]),
      variacion: f[col('Variación')] === '' ? null : Number(f[col('Variación')]), resultado: String(f[col('Resultado')] || ''), modelo: String(f[col('Modelo')] || '')
    };
  }).reverse();
  return { ok: true, items: items.slice(0, 200), resumen: mercResumen_(items) };
}

function mercResumen_(items) {
  const cerrados = items.filter(x => x.resultado === 'Acertó' || x.resultado === 'Falló');
  const porConf = {};
  ['alta', 'media', 'baja'].forEach(c => {
    const l = cerrados.filter(x => x.confianza === c);
    porConf[c] = { total: l.length, aciertos: l.filter(x => x.resultado === 'Acertó').length };
  });
  return {
    total: items.length, pendientes: items.filter(x => !x.resultado).length, verificados: cerrados.length,
    aciertos: cerrados.filter(x => x.resultado === 'Acertó').length, porConfianza: porConf
  };
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
