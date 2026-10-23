/**
 * Contratos de alquiler: vencimiento y actualización del monto.
 *
 * Una fila por contrato (hoja "Contratos"), atada a una unidad de un edificio de
 * Propiedades. Se cargan desde la pestaña Contratos de bgpsammar.com/propiedades.html.
 * Los datos (inquilinos, teléfonos, montos) viven solo en la planilla: el repositorio
 * y la página son públicos.
 *
 * Actualización: cada N meses desde la última, por
 *  - ICL (Índice para Contratos de Locación, BCRA): monto × ICL(hoy) / ICL(última actualización).
 *  - IPC (INDEC): monto × IPC(último mes publicado) / IPC(mes anterior a la última actualización).
 *  - Porcentaje fijo: monto × (1 + %).
 * Los índices se leen de las APIs públicas del BCRA y de datos.gob.ar; si no responden,
 * el contrato muestra la fecha igual y se puede cargar el monto nuevo a mano.
 *
 * Avisos (una vez por evento, por WhatsApp a los usuarios con WhatsApp configurado, y
 * en la revisión de Amaroki): el contrato vence en 60, 30 o 7 días, o le toca
 * actualizar en 15 días o ya le tocó.
 */

const SHEET_CONTRATOS = 'Contratos';
const HEADERS_CONTRATOS = [
  'ID', 'Edificio', 'Lugar', 'Unidad', 'Inquilino', 'Teléfono', 'Inicio', 'Fin', 'Monto', 'Moneda',
  'Índice', 'Cada (meses)', 'Porcentaje', 'Última actualización', 'Notas', 'Actualizado por', 'Fecha'
];
const INDICES_CONTRATO = ['ICL', 'IPC', 'Porcentaje fijo', 'Sin actualización'];
const CONTRATO_AVISOS_VENCE = [60, 30, 7];
const CONTRATO_AVISO_ACTUALIZA = 15;
const URL_ICL = 'https://api.bcra.gob.ar/estadisticas/v3.0/monetarias/40';
const URL_IPC = 'https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&format=json&limit=1000&sort=desc';

// ======================= Lectura =======================

function leerContratos_() {
  obtenerHoja_(SHEET_CONTRATOS, HEADERS_CONTRATOS);
  return leerFilas_(SHEET_CONTRATOS, HEADERS_CONTRATOS).filter(c => c['ID']);
}

/** Suma meses a una fecha aaaa-mm-dd (el 31 pasa al último día del mes si hace falta). */
function sumarMeses_(iso, n) {
  const p = partesIso(iso);
  const total = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(total / 12), m = total % 12 + 1;
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + Math.min(p.d, ultimo)).slice(-2);
}

function diasEntre_(desde, hasta) {
  return Math.round((fechaUtc(hasta) - fechaUtc(desde)) / 86400000);
}

/** Estado calculado de un contrato: próxima actualización, monto estimado y vencimiento. */
function estadoContrato_(c, hoy, indices) {
  const inicio = dmaAIso_(c['Inicio']), fin = dmaAIso_(c['Fin']);
  const ultima = dmaAIso_(c['Última actualización']) || inicio;
  const cada = parseInt(c['Cada (meses)'], 10);
  const monto = importeANumero(c['Monto']);
  const indice = c['Índice'] || 'Sin actualización';
  const e = { id: c['ID'], indice: indice, monto: monto, inicio: inicio, fin: fin, ultima: ultima };
  if (fin) { e.diasParaVencer = diasEntre_(hoy, fin); e.vencido = fin < hoy; }
  if (indice !== 'Sin actualización' && ultima && cada > 0) {
    e.proxima = sumarMeses_(ultima, cada);
    if (fin && e.proxima > fin) e.proxima = '';  // termina antes de la próxima actualización
  }
  if (e.proxima) {
    e.diasParaActualizar = diasEntre_(hoy, e.proxima);
    const est = montoActualizado_(monto, indice, ultima, parseFloat(String(c['Porcentaje'] || '').replace(',', '.')), indices);
    if (est) { e.nuevo = Math.round(est.monto * 100) / 100; e.variacion = monto ? est.monto / monto - 1 : null; e.datosHasta = est.hasta; }
    else e.sinIndice = true;
  }
  return e;
}

/** Monto actualizado según el índice. null si falta el dato. */
function montoActualizado_(monto, indice, ultima, pct, indices) {
  if (!monto) return null;
  if (indice === 'Porcentaje fijo') return isNaN(pct) ? null : { monto: monto * (1 + pct / 100), hasta: '' };
  if (indice === 'ICL') {
    const serie = indices.icl || [];
    const base = valorEnFecha_(serie, ultima), act = serie.length ? serie[serie.length - 1] : null;
    return base && act ? { monto: monto * act.valor / base.valor, hasta: act.fecha } : null;
  }
  if (indice === 'IPC') {
    // Variación del IPC entre el mes anterior a la última actualización y el último publicado.
    const serie = indices.ipc || [];
    const base = valorEnFecha_(serie, sumarMeses_(ultima.substring(0, 8) + '01', -1)), act = serie.length ? serie[serie.length - 1] : null;
    return base && act && act.fecha > base.fecha ? { monto: monto * act.valor / base.valor, hasta: act.fecha } : null;
  }
  return null;
}

/** Último valor de la serie con fecha ≤ iso (serie ordenada de vieja a nueva). */
function valorEnFecha_(serie, iso) {
  let r = null;
  for (let i = 0; i < serie.length && serie[i].fecha <= iso; i++) r = serie[i];
  return r;
}

/** {icl: [{fecha, valor}], ipc: [{fecha, valor}]} de vieja a nueva. Se guarda 12 horas. */
function indicesContratos_() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get('indices_contratos');
  if (guardado) { try { return JSON.parse(guardado); } catch (e) {} }
  const r = { icl: [], ipc: [] };
  try {
    const hasta = ahoraLocal().hoy, desde = sumarDias(hasta, -365 * 4);
    const res = UrlFetchApp.fetch(URL_ICL + '?desde=' + desde + '&hasta=' + hasta + '&limit=3000', { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      const json = JSON.parse(res.getContentText() || '{}');
      // La API devolvió distintas formas según la versión: lista de {fecha, valor} o {detalle: [...]}.
      let lista = json.results || [];
      if (lista.length && lista[0].detalle) lista = lista[0].detalle;
      r.icl = lista.map(x => ({ fecha: String(x.fecha).substring(0, 10), valor: Number(x.valor) })).filter(x => x.valor > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
    }
  } catch (e) { console.log('ICL: ' + e.message); }
  try {
    const res = UrlFetchApp.fetch(URL_IPC, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      const json = JSON.parse(res.getContentText() || '{}');
      r.ipc = (json.data || []).map(x => ({ fecha: String(x[0]).substring(0, 10), valor: Number(x[1]) })).filter(x => x.valor > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
    }
  } catch (e) { console.log('IPC: ' + e.message); }
  if (r.icl.length || r.ipc.length) { try { cache.put('indices_contratos', JSON.stringify(r), 43200); } catch (e) {} }
  return r;
}

/** Contratos con su estado. d: {edificio} (opcional) */
function obtenerContratos_(d) {
  const hoy = ahoraLocal().hoy;
  const indices = indicesContratos_();
  const lista = leerContratos_().filter(c => !d || !d.edificio || claveTexto(c['Edificio']) === claveTexto(d.edificio));
  return {
    ok: true, hoy: hoy,
    indices: { icl: indices.icl.length ? indices.icl[indices.icl.length - 1] : null, ipc: indices.ipc.length ? indices.ipc[indices.ipc.length - 1] : null },
    contratos: lista.map(c => ({ datos: c, estado: estadoContrato_(c, hoy, indices) }))
  };
}

// ======================= Escritura =======================

/** Alta o edición. d: {id?, edificio, lugar, unidad, inquilino, telefono, inicio, fin, monto, moneda, indice, cada, porcentaje, ultima, notas} (fechas aaaa-mm-dd) */
function guardarContrato_(d, u) {
  const edificio = String(d.edificio || '').trim(), unidad = String(d.unidad || '').trim();
  if (!edificio || !unidad) return { ok: false, error: 'Falta el edificio o la unidad.' };
  const inicio = asisIsoContrato_(d.inicio), fin = asisIsoContrato_(d.fin);
  if (!inicio) return { ok: false, error: 'Falta la fecha de inicio.' };
  if (fin && fin <= inicio) return { ok: false, error: 'La fecha de fin tiene que ser posterior al inicio.' };
  const monto = montoContrato_(d.monto);
  if (!(monto > 0)) return { ok: false, error: 'Falta el monto del alquiler.' };
  const indice = INDICES_CONTRATO.indexOf(d.indice) >= 0 ? d.indice : 'Sin actualización';
  const cada = parseInt(d.cada, 10);
  if (indice !== 'Sin actualización' && !(cada >= 1 && cada <= 24)) return { ok: false, error: 'Indicá cada cuántos meses se actualiza (1 a 24).' };
  if (indice === 'Porcentaje fijo' && isNaN(parseFloat(String(d.porcentaje || '').replace(',', '.')))) return { ok: false, error: 'Falta el porcentaje de actualización.' };
  const ultima = asisIsoContrato_(d.ultima) || inicio;
  return conLock_(() => {
    const hoja = obtenerHoja_(SHEET_CONTRATOS, HEADERS_CONTRATOS);
    const filas = leerFilas_(SHEET_CONTRATOS, HEADERS_CONTRATOS);
    const i = d.id ? filas.findIndex(f => f['ID'] === String(d.id)) : -1;
    if (d.id && i < 0) return { ok: false, error: 'No se encontró el contrato.' };
    const antes = i >= 0 ? filas[i] : '';
    const v = {
      'ID': i >= 0 ? filas[i]['ID'] : Utilities.getUuid(), 'Edificio': edificio, 'Lugar': String(d.lugar || '').trim(), 'Unidad': unidad,
      'Inquilino': String(d.inquilino || '').trim(), 'Teléfono': String(d.telefono || '').replace(/[^\d+]/g, ''),
      'Inicio': isoAMostrar(inicio), 'Fin': fin ? isoAMostrar(fin) : '', 'Monto': formatoPesos(monto).replace('$ ', ''),
      'Moneda': d.moneda === 'USD' ? 'USD' : 'Pesos', 'Índice': indice, 'Cada (meses)': indice === 'Sin actualización' ? '' : String(cada),
      'Porcentaje': indice === 'Porcentaje fijo' ? String(d.porcentaje).trim() : '', 'Última actualización': isoAMostrar(ultima),
      'Notas': String(d.notas || '').trim().substring(0, 500), 'Actualizado por': nombreDe_(u), 'Fecha': ahoraTexto_()
    };
    hoja.getRange(i >= 0 ? i + 2 : hoja.getLastRow() + 1, 1, 1, HEADERS_CONTRATOS.length).setNumberFormat('@').setValues([HEADERS_CONTRATOS.map(h => v[h])]);
    registrar_(u, antes ? 'Contrato modificado' : 'Contrato cargado', edificio + ' · ' + unidad + (v['Inquilino'] ? ' · ' + v['Inquilino'] : '') + ' · $ ' + v['Monto'] + ' · ' + indice, v['ID'], antes, v);
    return { ok: true, id: v['ID'] };
  });
}

/** Aplica la actualización: el monto nuevo pasa a ser el actual desde la fecha que tocaba. d: {id, monto?} */
function aplicarActualizacionContrato_(d, u) {
  return conLock_(() => {
    const hoja = obtenerHoja_(SHEET_CONTRATOS, HEADERS_CONTRATOS);
    const filas = leerFilas_(SHEET_CONTRATOS, HEADERS_CONTRATOS);
    const i = filas.findIndex(f => f['ID'] === String(d.id || ''));
    if (i < 0) return { ok: false, error: 'No se encontró el contrato.' };
    const c = filas[i];
    const e = estadoContrato_(c, ahoraLocal().hoy, indicesContratos_());
    if (!e.proxima) return { ok: false, error: 'Este contrato no tiene una actualización pendiente.' };
    const nuevo = montoContrato_(d.monto) || e.nuevo;
    if (!(nuevo > 0)) return { ok: false, error: 'No hay índice para calcularlo: escribí el monto nuevo.' };
    const v = Object.assign({}, c, {
      'Monto': formatoPesos(nuevo).replace('$ ', ''), 'Última actualización': isoAMostrar(e.proxima),
      'Actualizado por': nombreDe_(u), 'Fecha': ahoraTexto_()
    });
    hoja.getRange(i + 2, 1, 1, HEADERS_CONTRATOS.length).setNumberFormat('@').setValues([HEADERS_CONTRATOS.map(h => v[h] == null ? '' : String(v[h]))]);
    registrar_(u, 'Contrato actualizado', c['Edificio'] + ' · ' + c['Unidad'] + ': $ ' + c['Monto'] + ' → $ ' + v['Monto'] + ' desde el ' + v['Última actualización'] + ' (' + c['Índice'] + ')', c['ID'], c, v);
    return { ok: true, monto: nuevo, desde: e.proxima };
  });
}

function eliminarContrato_(d, u) {
  return conLock_(() => {
    const salen = eliminarFilasDonde_(SHEET_CONTRATOS, HEADERS_CONTRATOS, f => f[0] === String(d.id || ''));
    if (!salen.length) return { ok: false, error: 'No se encontró el contrato.' };
    const c = filaComoObjeto_(HEADERS_CONTRATOS, salen[0]);
    registrar_(u, 'Contrato eliminado', c['Edificio'] + ' · ' + c['Unidad'] + (c['Inquilino'] ? ' · ' + c['Inquilino'] : ''), c['ID'], c, '');
    return { ok: true };
  });
}

/**
 * Monto escrito a mano: "300.000", "300000", "300.000,50" o un número. En un texto con
 * solo puntos, los grupos de tres cifras son miles (importeANumero los tomaría como decimales).
 */
function montoContrato_(v) {
  if (typeof v === 'number') return v;
  const t = String(v || '').replace(/[^\d.,-]/g, '');
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) return parseFloat(t.split('.').join(''));
  return importeANumero(t);
}

function asisIsoContrato_(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  if (t.indexOf('/') > 0) return dmaAIso_(t);
  return esIsoValida(t.substring(0, 10)) ? t.substring(0, 10) : '';
}

// ======================= Avisos =======================

/** Lo que hay que avisar hoy de los contratos: [{clave, texto, voz, grave}] */
function avisosContratos_(hoy) {
  const indices = indicesContratos_();
  const out = [];
  leerContratos_().forEach(c => {
    const e = estadoContrato_(c, hoy, indices);
    const quien = c['Edificio'] + ' · ' + c['Unidad'] + (c['Inquilino'] ? ' (' + c['Inquilino'] + ')' : '');
    if (e.fin && !e.vencido) {
      const tramo = CONTRATO_AVISOS_VENCE.filter(n => e.diasParaVencer <= n).pop();
      if (tramo !== undefined) {
        out.push({
          clave: 'vence|' + c['ID'] + '|' + tramo, grave: e.diasParaVencer <= 7,
          texto: 'El contrato de ' + quien + ' vence el ' + isoAMostrar(e.fin) + ' (en ' + e.diasParaVencer + ' día' + (e.diasParaVencer === 1 ? '' : 's') + '). ¿Se renueva?',
          voz: 'El contrato de ' + c['Unidad'] + ' de ' + c['Edificio'] + ' vence en ' + e.diasParaVencer + ' días.'
        });
      }
    }
    if (e.proxima && e.diasParaActualizar <= CONTRATO_AVISO_ACTUALIZA) {
      const monto = e.nuevo ? ' Con ' + e.indice + ' quedaría en ' + formatoPesos(e.nuevo) + ' (' + (e.variacion >= 0 ? '+' : '') + (e.variacion * 100).toFixed(1).replace('.', ',') + ' %).' : ' No pude leer el índice: cargá el monto nuevo a mano.';
      out.push({
        clave: 'actualiza|' + c['ID'] + '|' + e.proxima, grave: e.diasParaActualizar <= 0,
        texto: (e.diasParaActualizar <= 0 ? 'Ya le tocó actualizar' : 'Le toca actualizar el ' + isoAMostrar(e.proxima)) + ' al alquiler de ' + quien + ': hoy paga ' + formatoPesos(e.monto) + '.' + monto,
        voz: (e.diasParaActualizar <= 0 ? 'Ya le tocó actualizar el alquiler' : 'En ' + e.diasParaActualizar + ' días toca actualizar el alquiler') + ' de ' + c['Unidad'] + ' de ' + c['Edificio'] + '.'
      });
    }
  });
  return out;
}

/** Desde revisarAlertas (cada hora): manda por WhatsApp cada aviso de contrato una sola vez. */
function enviarAvisosContratos_(usuarios) {
  const p = propiedades_();
  const hoy = ahoraLocal().hoy;
  let enviados = {};
  try { enviados = JSON.parse(p.getProperty('CONTRATOS_AVISADOS') || '{}') || {}; } catch (e) {}
  const nuevos = avisosContratos_(hoy).filter(a => !enviados[a.clave]);
  if (!nuevos.length) return;
  const texto = '*Propiedades · Contratos*\n' + nuevos.map(a => '• ' + a.texto).join('\n');
  enviarATodos_(usuarios, texto);
  nuevos.forEach(a => { enviados[a.clave] = hoy; });
  // Se guardan los últimos 400 para que la propiedad no crezca sin fin.
  const claves = Object.keys(enviados).sort((a, b) => enviados[b].localeCompare(enviados[a])).slice(0, 400);
  const limpio = {};
  claves.forEach(k => { limpio[k] = enviados[k]; });
  p.setProperty('CONTRATOS_AVISADOS', JSON.stringify(limpio));
}

/** WhatsApp a todos los usuarios activos que lo tienen configurado (sin cortar si uno falla). */
function enviarATodos_(usuarios, texto) {
  Object.keys(usuarios).forEach(id => {
    const u = usuarios[id];
    if (!u['Teléfono WhatsApp'] || !propiedades_().getProperty('WA_APIKEY_' + u['ID'])) return;
    try { enviarWhatsapp_(u, texto); } catch (e) { console.error('WhatsApp a ' + u['Usuario'] + ': ' + e.message); }
  });
}

// ======================= No abonó =======================

/**
 * Al guardar una liquidación: avisa por WhatsApp quién figura "no abonó" y antes no
 * figuraba (en esa misma liquidación). Una liquidación nueva avisa a todos los que no abonaron.
 */
function avisarNoAbono_(datos, datosAntes, u) {
  const antes = {};
  ((datosAntes && datosAntes.unidades) || []).forEach(un => { if (un.estado === 'no-abono') antes[String(un.unidad)] = true; });
  const nuevos = (datos.unidades || []).filter(un => un.estado === 'no-abono' && !antes[String(un.unidad)]);
  if (!nuevos.length) return 0;
  const usuarios = {};
  leerUsuarios_().forEach(x => { if (x['Activo'] === 'Sí') usuarios[x['ID']] = x; });
  const texto = '*Propiedades · No abonó*\n' + datos.edificio + ' · ' + datos.periodo + '\n' +
    nuevos.map(un => '• ' + un.unidad + (un.inquilino ? ' (' + un.inquilino + ')' : '') + (un.lugar ? ' · ' + un.lugar : '')).join('\n') +
    '\nCargado por ' + String(nombreDe_(u)).split(' (')[0] + '.';
  enviarATodos_(usuarios, texto);
  return nuevos.length;
}
