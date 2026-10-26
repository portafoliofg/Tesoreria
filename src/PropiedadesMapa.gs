/**
 * Mapa de propiedades (bgpsammar.com/propiedades-mapa.html): ubicación de cada
 * lugar de las liquidaciones de alquileres, para verlos en un mapa satelital 3D.
 *
 * Las direcciones y coordenadas viven solo en la planilla (pestaña "Ubicaciones de
 * propiedades"), nunca en el repositorio ni en la página, que son públicos.
 * La primera vez se busca la ubicación sola: el primer lugar de cada edificio por
 * el nombre del edificio (que es su dirección, "CALLE EJEMPLO NRO. 123") y el resto
 * por su nombre, aceptándola solo si el resultado es una dirección precisa. Las que
 * no se encuentran, o quedan aproximadas, se corrigen desde el mapa escribiendo la
 * dirección o arrastrando el pin. Geocodificador: el de Google que trae Apps Script
 * (sin clave); si falla, OpenStreetMap (Nominatim).
 *
 * Propiedad del script opcional: PROPIEDADES_ZONA (por ejemplo "Córdoba, Argentina"),
 * que se agrega a las búsquedas que no la traen. Por defecto "Argentina".
 *
 * Unidades en el mapa (hoja "Unidades en el mapa", en la planilla de Propiedades): cada lote o
 * galpón de un lugar con su punto y, si tiene, su contorno. Se cargan importando un KML de Google
 * Earth desde el mapa (una carpeta por lugar, un marcador por unidad, polígonos para los contornos).
 * "Unidad" es el nombre de la unidad en la app (puede ser distinto del de Google Earth: por
 * ejemplo el lote "Lote 10 Mza. 48" es la unidad "Galpón chico"). Esas unidades también se ven
 * en Propiedades aunque no estén en la liquidación.
 */

const SHEET_UBICACIONES = 'Ubicaciones de propiedades';
// Rumbo / Inclinación / Panorama: la vista de Street View de la entrada (el panorama sale del enlace que se pega).
const HEADERS_UBICACIONES = ['Clave', 'Edificio', 'Lugar', 'Dirección', 'Lat', 'Lon', 'Precisión', 'Fuente', 'Actualizado por', 'Fecha', 'Rumbo', 'Inclinación', 'Panorama'];
const SHEET_UNIDADES_MAPA = 'Unidades en el mapa';
const HEADERS_UNIDADES_MAPA = ['Clave', 'Edificio', 'Lugar', 'Nombre', 'Unidad', 'Tipo', 'Lat', 'Lon', 'Contorno', 'Actualizado por', 'Fecha'];
const UBIC_MAX_PERIODOS = 12;   // liquidaciones por lugar que se mandan al mapa
const UBIC_MAX_BUSQUEDAS = 5;   // búsquedas automáticas por pedido (para no demorar)

// Los mismos que LUGARES de docs/propiedades-vista.js.
const LUGARES_PREDETERMINADOS_ = ['Saavedra', 'Polo 52', 'Dario', 'Esteban Porucini', 'Casa Morón', 'Oficina PEA'];

function claveUbicacion_(edificio, lugar) {
  return claveTexto(edificio) + '|' + claveTexto(lugar);
}

/** "CALLE EJEMPLO NRO. 123" → "Calle Ejemplo 123". */
function direccionDeEdificio_(edificio) {
  const t = String(edificio || '').replace(/\b(?:NRO|NUM|NUMERO)\b\.?|N[°º]\.?/gi, ' ').replace(/\s+/g, ' ').trim();
  return t.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
}

/** Unidades de un lugar en una liquidación (las sin lugar son del primero, igual que en Propiedades). */
function unidadesDelLugar_(d, lugar, primero) {
  return (d.unidades || []).filter(un => (un.lugar || primero) === lugar);
}

/**
 * Lugares de cada edificio (de su última liquidación), con las unidades de cada uno y
 * el historial resumido de sus liquidaciones (para el análisis desde el mapa).
 */
function lugaresPropiedades_() {
  // Lugares que tienen unidades en el mapa o contratos: se muestran aunque la liquidación no traiga unidades suyas.
  const conAlgo = {};
  leerUnidadesMapa_().forEach(f => { conAlgo[claveUbicacion_(f['Edificio'], f['Lugar'])] = true; });
  try { leerContratos_().forEach(c => { if (c['Lugar']) conAlgo[claveUbicacion_(c['Edificio'], c['Lugar'])] = true; }); } catch (e) {}
  const ult = {}, todas = {};
  (obtenerPropiedades_().liquidaciones || []).forEach(x => {
    const k = claveTexto(x.edificio);
    (todas[k] = todas[k] || []).push(x);
    if (!ult[k] || String(x.orden) > String(ult[k].orden)) ult[k] = x;
  });
  const lugares = [];
  Object.keys(ult).forEach(k => {
    const x = ult[k], d = x.datos || {};
    const unidades = d.unidades || [];
    let nombres = (d.lugares || []).filter(Boolean);
    if (!nombres.length) unidades.forEach(un => { if (un.lugar && nombres.indexOf(un.lugar) < 0) nombres.push(un.lugar); });
    if (!nombres.length) nombres = [''];
    // También valen los lugares de siempre que no estén en la lista de la liquidación (sin lista propia,
    // o agregados después, como Oficina PEA), si tienen unidades en el mapa o contratos
    // (el primero, Saavedra, es el del edificio cuando no hay nombre).
    LUGARES_PREDETERMINADOS_.forEach((l, j) => {
      if ((j > 0 || nombres[0]) && nombres.indexOf(l) < 0) nombres.push(l);
    });
    nombres.forEach((lugar, i) => {
      // Las unidades sin lugar son del primero (igual que en la página de Propiedades).
      const suyas = unidades.filter(un => (un.lugar || nombres[0]) === lugar);
      if (i > 0 && !suyas.length && !conAlgo[claveUbicacion_(x.edificio, lugar)]) return;
      const estados = {};
      suyas.forEach(un => { const e = un.estado || 'sin marca'; estados[e] = (estados[e] || 0) + 1; });
      const total = suyas.reduce((a, un) => a + (typeof un.total === 'number' ? un.total : 0), 0);
      const historial = todas[k].slice().sort((a, b) => String(b.orden).localeCompare(String(a.orden))).slice(0, UBIC_MAX_PERIODOS).map(liq => {
        const dl = liq.datos || {};
        const primero = ((dl.lugares || []).filter(Boolean)[0]) || nombres[0];
        return {
          periodo: liq.periodo, orden: liq.orden,
          unidades: unidadesDelLugar_(dl, lugar, primero).map(un => ({
            unidad: un.unidad, inquilino: un.inquilino, estado: un.estado || '', forma: un.forma || '',
            transferencia: un.transferencia, efectivo: un.efectivo, total: un.total
          })),
          liquidacion: (dl.liquidacion || []).map(l => ({ concepto: l.concepto, monto: l.monto, tipo: l.tipo }))
        };
      });
      lugares.push({
        clave: claveUbicacion_(x.edificio, lugar), edificio: x.edificio, lugar: lugar, primero: i === 0, varios: nombres.length > 1,
        periodo: x.periodo, unidades: suyas.length, estados: estados, total: Math.round(total * 100) / 100, historial: historial
      });
    });
  });
  return lugares;
}

/** Lugares con su ubicación. Busca sola las que todavía no tienen (unas pocas por vez). */
function ubicacionesPropiedades_(d, u) {
  const lugares = lugaresPropiedades_();
  const hoja = obtenerHoja_(SHEET_UBICACIONES, HEADERS_UBICACIONES);
  const filas = leerFilas_(SHEET_UBICACIONES, HEADERS_UBICACIONES);
  const porClave = {};
  filas.forEach((f, i) => { if (f['Clave']) porClave[f['Clave']] = { f: f, i: i }; });
  let buscadas = 0;
  const nuevas = [];
  lugares.forEach(l => {
    if (porClave[l.clave] || buscadas >= UBIC_MAX_BUSQUEDAS) return;
    buscadas++;
    const consulta = l.primero ? direccionDeEdificio_(l.edificio) : l.lugar;
    const r = geocodificar_(consulta);
    // Por el nombre de un lugar solo se acepta un resultado preciso (si no, cualquier "Dario" del país).
    const sirve = r && (l.primero || r.precision === 'exacta');
    const f = {
      'Clave': l.clave, 'Edificio': l.edificio, 'Lugar': l.lugar, 'Dirección': sirve ? r.direccion : consulta,
      'Lat': sirve ? String(r.lat) : '', 'Lon': sirve ? String(r.lon) : '', 'Precisión': sirve ? r.precision : 'sin ubicar',
      'Fuente': sirve ? 'Automática (' + r.fuente + ')' : 'Automática', 'Actualizado por': 'Sistema', 'Fecha': ahoraTexto_()
    };
    nuevas.push(HEADERS_UBICACIONES.map(h => f[h]));
    porClave[l.clave] = { f: f, i: -1 };
  });
  if (nuevas.length) {
    conLock_(() => hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, HEADERS_UBICACIONES.length).setNumberFormat('@').setValues(nuevas));
  }
  // Unidades del mapa (puntos y contornos), con la clave de su lugar.
  const unidades = leerUnidadesMapa_().map(f => {
    let contorno = null;
    try { contorno = f['Contorno'] ? JSON.parse(f['Contorno']) : null; } catch (e) {}
    const lat = parseFloat(f['Lat']), lon = parseFloat(f['Lon']);
    return { clave: f['Clave'], lugarClave: claveUbicacion_(f['Edificio'], f['Lugar']), edificio: f['Edificio'], lugar: f['Lugar'], nombre: f['Nombre'],
      unidad: f['Unidad'] || f['Nombre'], tipo: f['Tipo'] || 'punto', lat: isNaN(lat) ? null : lat, lon: isNaN(lon) ? null : lon, contorno: contorno };
  });
  return {
    ok: true, unidades: unidades,
    // Todos los lugares de las liquidaciones, aunque todavía no tengan unidades (para importar un KML).
    todos: Object.values(lugaresConocidos_()).map(l => ({ clave: claveUbicacion_(l.edificio, l.lugar), edificio: l.edificio, lugar: l.lugar })),
    pendientes: lugares.filter(l => !porClave[l.clave]).length,
    lugares: lugares.map(l => {
      const f = (porClave[l.clave] || {}).f || {};
      const lat = parseFloat(f['Lat']), lon = parseFloat(f['Lon']);
      return Object.assign(l, {
        direccion: f['Dirección'] || '', lat: isNaN(lat) ? null : lat, lon: isNaN(lon) ? null : lon,
        precision: f['Precisión'] || 'sin ubicar', fuente: f['Fuente'] || '', actualizado: f['Fecha'] || '',
        rumbo: f['Rumbo'] === '' || f['Rumbo'] === undefined ? null : parseFloat(f['Rumbo']),
        inclinacion: f['Inclinación'] === '' || f['Inclinación'] === undefined ? null : parseFloat(f['Inclinación']),
        panorama: f['Panorama'] || ''
      });
    })
  };
}

/**
 * Corrige la ubicación de un lugar. d: {clave, edificio, lugar, direccion, lat, lon}
 * Con lat/lon (pin arrastrado) se guarda tal cual; con solo la dirección, se busca.
 */
function guardarUbicacionPropiedad_(d, u) {
  // La importación de un KML viaja por esta misma acción (así no hace falta otra en Código.gs).
  if (d && d.kml) return importarKmlPropiedades_(d, u);
  const clave = String(d.clave || '');
  if (!clave) return { ok: false, error: 'Falta el lugar.' };
  let direccion = String(d.direccion || '').trim().substring(0, 200);
  let lat = parseFloat(d.lat), lon = parseFloat(d.lon), precision = 'exacta', fuente = 'Manual (pin)';
  if (isNaN(lat) || isNaN(lon)) {
    if (!direccion) return { ok: false, error: 'Escribí la dirección.' };
    const r = geocodificar_(direccion);
    if (!r) return { ok: false, error: 'No encontré esa dirección. Probá con calle, número y ciudad (por ejemplo "Av. Colón 1234, Córdoba").' };
    lat = r.lat; lon = r.lon; precision = r.precision; fuente = 'Manual (' + r.fuente + ')';
    direccion = r.direccion || direccion;
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return { ok: false, error: 'Coordenadas inválidas.' };
  return conLock_(() => {
    const hoja = obtenerHoja_(SHEET_UBICACIONES, HEADERS_UBICACIONES);
    const filas = leerFilas_(SHEET_UBICACIONES, HEADERS_UBICACIONES);
    const i = filas.findIndex(f => f['Clave'] === clave);
    const antes = i >= 0 ? filas[i] : '';
    // Si la casa cambia de lugar, la vista de Street View guardada ya no sirve.
    const f = {
      'Clave': clave, 'Edificio': String(d.edificio || (antes && antes['Edificio']) || ''), 'Lugar': String(d.lugar || (antes && antes['Lugar']) || ''),
      'Dirección': direccion, 'Lat': lat.toFixed(6), 'Lon': lon.toFixed(6), 'Precisión': precision, 'Fuente': fuente,
      'Actualizado por': nombreDe_(u), 'Fecha': ahoraTexto_(), 'Rumbo': '', 'Inclinación': '', 'Panorama': ''
    };
    hoja.getRange(i >= 0 ? i + 2 : hoja.getLastRow() + 1, 1, 1, HEADERS_UBICACIONES.length).setNumberFormat('@').setValues([HEADERS_UBICACIONES.map(h => f[h])]);
    registrar_(u, 'Propiedades: ubicación', (f['Lugar'] || f['Edificio']) + ' → ' + direccion + ' (' + fuente + ')', clave, antes, f);
    return { ok: true, direccion: direccion, lat: lat, lon: lon, precision: precision, fuente: fuente };
  });
}

/**
 * Guarda la vista de Street View de la entrada de un lugar.
 * d: {clave, enlace} (enlace de Google Maps en Street View, también los cortos maps.app.goo.gl)
 *  o {clave, rumbo, inclinacion} (girada desde el mapa).
 */
function guardarVistaCalle_(d, u) {
  const clave = String(d.clave || '');
  if (!clave) return { ok: false, error: 'Falta el lugar.' };
  let vista;
  if (d.enlace) {
    vista = vistaDeEnlace_(String(d.enlace).trim());
    if (!vista) return { ok: false, error: 'No reconocí ese enlace. Abrí Street View en Google Maps, poné la vista de la entrada, tocá Compartir → Copiar vínculo y pegalo acá.' };
  } else {
    const rumbo = parseFloat(d.rumbo), incl = parseFloat(d.inclinacion);
    if (isNaN(rumbo)) return { ok: false, error: 'Falta hacia dónde mirar.' };
    vista = { rumbo: ((rumbo % 360) + 360) % 360, inclinacion: isNaN(incl) ? 0 : Math.max(-60, Math.min(60, incl)), panorama: String(d.panorama || '') };
  }
  return conLock_(() => {
    const hoja = obtenerHoja_(SHEET_UBICACIONES, HEADERS_UBICACIONES);
    const filas = leerFilas_(SHEET_UBICACIONES, HEADERS_UBICACIONES);
    const i = filas.findIndex(f => f['Clave'] === clave);
    if (i < 0) return { ok: false, error: 'Primero ubicá el lugar en el mapa.' };
    const antes = filas[i];
    const f = Object.assign({}, antes, {
      'Rumbo': vista.rumbo.toFixed(1), 'Inclinación': vista.inclinacion.toFixed(1), 'Panorama': vista.panorama || '',
      'Actualizado por': nombreDe_(u), 'Fecha': ahoraTexto_()
    });
    // Un enlace trae la posición exacta desde donde se mira: si no había ubicación, sirve.
    if (vista.lat !== undefined && !String(antes['Lat'] || '').trim()) { f['Lat'] = vista.lat.toFixed(6); f['Lon'] = vista.lon.toFixed(6); f['Precisión'] = 'aproximada'; }
    hoja.getRange(i + 2, 1, 1, HEADERS_UBICACIONES.length).setNumberFormat('@').setValues([HEADERS_UBICACIONES.map(h => f[h] == null ? '' : String(f[h]))]);
    registrar_(u, 'Propiedades: vista de la entrada', (f['Lugar'] || f['Edificio']) + ' · rumbo ' + f['Rumbo'] + '°' + (vista.panorama ? ' (panorama de Street View)' : ''), clave, antes, f);
    return { ok: true, rumbo: vista.rumbo, inclinacion: vista.inclinacion, panorama: vista.panorama || '' };
  });
}

/**
 * Enlace de Street View → {rumbo, inclinacion, panorama, lat, lon}.
 * "https://www.google.com/maps/@-31.41,-64.18,3a,75y,210.5h,95t/data=!3m6!1e1!3m4!1s<panorama>!2e0…"
 * Los cortos (maps.app.goo.gl) se siguen hasta el largo.
 */
function vistaDeEnlace_(enlace) {
  let url = enlace;
  for (let i = 0; i < 4 && /goo\.gl|g\.co\//.test(url); i++) {
    try {
      const r = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
      const h = r.getAllHeaders();
      const sig = h.Location || h.location;
      if (!sig) break;
      url = Array.isArray(sig) ? sig[0] : sig;
    } catch (e) { break; }
  }
  try { url = decodeURIComponent(url); } catch (e) {}
  const m = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,[^,\/]*?a)?(?:,[^,\/]*?y)?,(\d+(?:\.\d+)?)h(?:,(\d+(?:\.\d+)?)t)?/);
  if (!m) return null;
  const pano = url.match(/!1s([^!]+)!2e0/);
  return {
    lat: parseFloat(m[1]), lon: parseFloat(m[2]), rumbo: parseFloat(m[3]),
    inclinacion: m[4] ? Math.max(-60, Math.min(60, parseFloat(m[4]) - 90)) : 0, panorama: pano ? pano[1] : ''
  };
}

/** {lat, lon, direccion, precision: 'exacta'|'aproximada', fuente} o null. */
function geocodificar_(texto) {
  let q = String(texto || '').trim();
  if (!q) return null;
  const zona = String(propiedades_().getProperty('PROPIEDADES_ZONA') || 'Argentina').trim();
  if (claveTexto(q).indexOf(claveTexto(zona.split(',')[0])) < 0 && claveTexto(q).indexOf('argentina') < 0) q += ', ' + zona;
  try {
    const r = Maps.newGeocoder().setRegion('ar').setLanguage('es').geocode(q);
    const x = r && r.status === 'OK' && r.results && r.results[0];
    if (x) {
      const tipo = x.geometry.location_type;
      return { lat: x.geometry.location.lat, lon: x.geometry.location.lng, direccion: x.formatted_address,
        precision: tipo === 'ROOFTOP' || tipo === 'RANGE_INTERPOLATED' ? 'exacta' : 'aproximada', fuente: 'Google' };
    }
  } catch (e) {
    console.log('Geocodificador de Google: ' + e.message);
  }
  try {
    const res = UrlFetchApp.fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ar&q=' + encodeURIComponent(q),
      { headers: { 'User-Agent': 'Tesoreria-Sammartino/1.0 (bgpsammar.com)' }, muteHttpExceptions: true });
    const lista = res.getResponseCode() === 200 ? JSON.parse(res.getContentText() || '[]') : [];
    const x = lista[0];
    if (x) return { lat: parseFloat(x.lat), lon: parseFloat(x.lon), direccion: x.display_name,
      precision: x.addresstype === 'building' || x.addresstype === 'house' || x.type === 'house' ? 'exacta' : 'aproximada', fuente: 'OpenStreetMap' };
  } catch (e) {
    console.log('Nominatim: ' + e.message);
  }
  return null;
}

// ======================= Unidades en el mapa (KML de Google Earth) =======================

function leerUnidadesMapa_() {
  obtenerHoja_(SHEET_UNIDADES_MAPA, HEADERS_UNIDADES_MAPA);
  return leerFilas_(SHEET_UNIDADES_MAPA, HEADERS_UNIDADES_MAPA).filter(f => f['Clave']);
}

/** Lugares de cada edificio según su última liquidación (todos, tengan o no unidades): {clave lugar: {edificio, lugar}}. */
function lugaresConocidos_() {
  const ult = {};
  (obtenerPropiedades_().liquidaciones || []).forEach(x => {
    const k = claveTexto(x.edificio);
    if (!ult[k] || String(x.orden) > String(ult[k].orden)) ult[k] = x;
  });
  const out = {};
  Object.keys(ult).forEach(k => {
    const d = ult[k].datos || {};
    // Sin lista propia, la liquidación usa los lugares de siempre (igual que la página de Propiedades).
    const propios = (d.lugares || []).filter(Boolean);
    // Más los de siempre que falten en su lista (agregados después, como Oficina PEA).
    (propios.length ? propios.concat(LUGARES_PREDETERMINADOS_.filter(l => propios.indexOf(l) < 0)) : LUGARES_PREDETERMINADOS_)
      .concat((d.unidades || []).map(un => un.lugar)).filter(Boolean).forEach(l => {
      if (!out[claveTexto(l)]) out[claveTexto(l)] = { edificio: ult[k].edificio, lugar: l };
    });
  });
  return out;
}

/**
 * Guarda las unidades leídas de un KML. d: {kml: true, items: [{lugar, nombre, unidad, tipo: 'punto'|'poligono',
 * lat, lon, contorno: [[lon, lat], …]}]}. Cada lugar tiene que ser uno de las liquidaciones (por nombre).
 * Si el lugar todavía no está en el mapa, se ubica en el centro de sus unidades.
 */
function importarKmlPropiedades_(d, u) {
  const items = Array.isArray(d.items) ? d.items.slice(0, 300) : [];
  if (!items.length) return { ok: false, error: 'El archivo no trae unidades para importar.' };
  const conocidos = lugaresConocidos_();
  const errores = [], filas = [];
  items.forEach((it, i) => {
    const l = conocidos[claveTexto(it.lugar)];
    if (!l) { errores.push('"' + it.lugar + '" no es un lugar de las liquidaciones'); return; }
    const nombre = String(it.nombre || '').trim().substring(0, 120), unidad = String(it.unidad || nombre).trim().substring(0, 120);
    if (!nombre) return;
    const tipo = it.tipo === 'poligono' ? 'poligono' : 'punto';
    let lat = parseFloat(it.lat), lon = parseFloat(it.lon), contorno = '';
    if (tipo === 'poligono') {
      const pts = (Array.isArray(it.contorno) ? it.contorno : []).map(p => [parseFloat(p[0]), parseFloat(p[1])]).filter(p => !isNaN(p[0]) && !isNaN(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90);
      if (pts.length < 3) { errores.push('"' + nombre + '": el contorno no tiene puntos suficientes'); return; }
      contorno = JSON.stringify(pts.slice(0, 500).map(p => [Math.round(p[0] * 1e7) / 1e7, Math.round(p[1] * 1e7) / 1e7]));
      lon = pts.reduce((a, p) => a + p[0], 0) / pts.length; lat = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    }
    if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { errores.push('"' + nombre + '": coordenadas inválidas'); return; }
    filas.push({
      'Clave': claveUbicacion_(l.edificio, l.lugar) + '|' + claveTexto(nombre), 'Edificio': l.edificio, 'Lugar': l.lugar, 'Nombre': nombre,
      'Unidad': unidad, 'Tipo': tipo, 'Lat': lat.toFixed(7), 'Lon': lon.toFixed(7), 'Contorno': contorno, 'Actualizado por': nombreDe_(u), 'Fecha': ahoraTexto_()
    });
  });
  if (errores.length && !filas.length) return { ok: false, error: 'No se importó nada: ' + errores.join(' · ') + '.' };
  return conLock_(() => {
    const hoja = obtenerHoja_(SHEET_UNIDADES_MAPA, HEADERS_UNIDADES_MAPA);
    const existentes = leerFilas_(SHEET_UNIDADES_MAPA, HEADERS_UNIDADES_MAPA);
    let nuevas = 0, actualizadas = 0;
    filas.forEach(f => {
      const i = existentes.findIndex(x => x['Clave'] === f['Clave']);
      const fila = [HEADERS_UNIDADES_MAPA.map(h => f[h])];
      if (i >= 0) { hoja.getRange(i + 2, 1, 1, HEADERS_UNIDADES_MAPA.length).setNumberFormat('@').setValues(fila); existentes[i] = f; actualizadas++; }
      else { hoja.getRange(hoja.getLastRow() + 1, 1, 1, HEADERS_UNIDADES_MAPA.length).setNumberFormat('@').setValues(fila); existentes.push(f); nuevas++; }
    });
    // Lugares sin ubicación: al centro de sus unidades.
    const hojaU = obtenerHoja_(SHEET_UBICACIONES, HEADERS_UBICACIONES);
    const ubic = leerFilas_(SHEET_UBICACIONES, HEADERS_UBICACIONES);
    const porLugar = {};
    filas.forEach(f => { const k = claveUbicacion_(f['Edificio'], f['Lugar']); (porLugar[k] = porLugar[k] || { e: f['Edificio'], l: f['Lugar'], pts: [] }).pts.push([parseFloat(f['Lon']), parseFloat(f['Lat'])]); });
    const ubicados = [];
    Object.keys(porLugar).forEach(k => {
      const i = ubic.findIndex(x => x['Clave'] === k);
      if (i >= 0 && String(ubic[i]['Lat'] || '').trim()) return;
      const g = porLugar[k];
      const lon = g.pts.reduce((a, p) => a + p[0], 0) / g.pts.length, lat = g.pts.reduce((a, p) => a + p[1], 0) / g.pts.length;
      const f = { 'Clave': k, 'Edificio': g.e, 'Lugar': g.l, 'Dirección': i >= 0 ? ubic[i]['Dirección'] : '', 'Lat': lat.toFixed(6), 'Lon': lon.toFixed(6),
        'Precisión': 'exacta', 'Fuente': 'KML de Google Earth', 'Actualizado por': nombreDe_(u), 'Fecha': ahoraTexto_(), 'Rumbo': '', 'Inclinación': '', 'Panorama': '' };
      hojaU.getRange(i >= 0 ? i + 2 : hojaU.getLastRow() + 1, 1, 1, HEADERS_UBICACIONES.length).setNumberFormat('@').setValues([HEADERS_UBICACIONES.map(h => f[h])]);
      ubicados.push(g.l);
    });
    registrar_(u, 'Propiedades: unidades en el mapa', nuevas + ' nueva(s), ' + actualizadas + ' actualizada(s) desde un KML' + (ubicados.length ? ' · ubicado(s): ' + ubicados.join(', ') : '') + (errores.length ? ' · no se importó: ' + errores.join('; ') : ''),
      String(d.archivo || ''), '', textoCorto_(filas.map(f => f['Lugar'] + ' · ' + f['Nombre'] + (f['Unidad'] !== f['Nombre'] ? ' = ' + f['Unidad'] : ''))));
    return { ok: true, nuevas: nuevas, actualizadas: actualizadas, ubicados: ubicados, errores: errores };
  });
}

/** Unidades del mapa de un edificio, para la página de Propiedades: [{lugar, nombre, unidad}] (sin los contornos). */
function unidadesMapaDeEdificio_(edificio) {
  return leerUnidadesMapa_().filter(f => claveTexto(f['Edificio']) === claveTexto(edificio) && (f['Tipo'] || 'punto') === 'punto')
    .map(f => ({ lugar: f['Lugar'], nombre: f['Nombre'], unidad: f['Unidad'] || f['Nombre'] }));
}
