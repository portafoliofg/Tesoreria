/**
 * Planilla de Propiedades (aparte de la de Tesorería): acá viven TODAS las hojas de
 * Propiedades. Las de liquidaciones (Propiedades), Contratos y Ubicaciones de propiedades
 * estaban antes en la planilla de Tesorería: la primera vez que se usan se mudan solas
 * (se copian, se verifica que la copia sea igual y recién ahí se borran de Tesorería;
 * ver libroPropiedadesMigrado_). Código.gs las busca acá con libroDe_.
 *
 * Valores de cada unidad de Propiedades: valor real, precio de compra, valor de venta
 * estimado y el detalle (dormitorios, destino y cochera). Se cargan a mano desde la
 * pestaña Unidades de bgpsammar.com/propiedades.html (botón "i" de cada unidad).
 *
 * Viven en una planilla de Google APARTE (no en la de Tesorería e inversiones): se crea
 * sola la primera vez que se usa y su ID queda en la propiedad del script
 * PROPIEDADES_VALORES_ID. Si se borra la planilla, se crea otra vacía.
 *
 * El rendimiento no se carga: es el alquiler mensual × 12 sobre el precio de compra.
 * La página lo calcula con el alquiler actual (contrato o liquidación) y en la planilla
 * queda como fórmula sobre el alquiler que tenía la unidad al guardar.
 *
 * Gastos mensuales: lo que paga el dueño por la unidad aparte de la administración y los
 * arreglos que ya descuenta la liquidación (impuestos, expensas, seguro…). Con eso la
 * página calcula el rendimiento neto.
 *
 * Hoja Parámetros: por edificio, los costos de venta (%) y la tasa anual de la inversión
 * alternativa (%) con que la pestaña Rentabilidad arma los escenarios de venta.
 */

const PROP_VALORES_ID = 'PROPIEDADES_VALORES_ID';
const PROP_VALORES_NOMBRE = 'Propiedades';
// Nombre que tenía la planilla antes de recibir todas las hojas de Propiedades.
const PROP_VALORES_NOMBRE_VIEJO = 'Propiedades · Valores de unidades';
const PROP_HOJAS_MIGRADAS = 'PROPIEDADES_HOJAS_MIGRADAS';
const SHEET_VALORES_UNIDADES = 'Unidades';
const HEADERS_VALORES_UNIDADES = [
  'Edificio', 'Lugar', 'Unidad', 'Clave', 'Valor real', 'Precio de compra', 'Alquiler mensual', 'Rendimiento anual',
  'Valor de venta estimado', 'Dormitorios', 'Destino', 'Cochera', 'Actualizado por', 'Fecha', 'Gastos mensuales',
  // Cuentas de impuestos de la unidad (texto): municipalidad, aguas y rentas.
  'Cuenta municipal', 'Cuenta de aguas', 'Cuenta de rentas'
];
const CUENTAS_UNIDAD = { muni: 'Cuenta municipal', aguas: 'Cuenta de aguas', rentas: 'Cuenta de rentas' };
const SHEET_PARAMETROS_PROP = 'Parámetros';
const HEADERS_PARAMETROS_PROP = ['Edificio', 'Costos de venta %', 'Tasa alternativa %', 'Actualizado por', 'Fecha'];
const DESTINOS_UNIDAD = ['Vivienda', 'Comercial', 'Oficina', 'Cochera', 'Depósito', 'Otro'];
// Columnas con importes y la del rendimiento (1 = columna A).
const COL_VALORES_IMPORTES = [5, 6, 7, 9, 15];
const COL_VALORES_RENDIMIENTO = 8;

let LIBRO_VALORES_ = null;

/** La planilla aparte de valores (la crea si todavía no existe o la borraron). */
function libroValoresPropiedades_() {
  if (LIBRO_VALORES_) return LIBRO_VALORES_;
  const p = propiedades_();
  const id = p.getProperty(PROP_VALORES_ID);
  if (id) {
    try {
      if (!DriveApp.getFileById(id).isTrashed()) LIBRO_VALORES_ = SpreadsheetApp.openById(id);
    } catch (e) {}
  }
  if (!LIBRO_VALORES_) {
    // Con el lock y volviendo a mirar el ID: dos pedidos a la vez no crean dos planillas.
    const lock = lockPropiedades_();
    lock.waitLock(20000);
    try {
      olvidarPropiedades_();
      const otro = propiedades_().getProperty(PROP_VALORES_ID);
      if (otro && otro !== id) { try { LIBRO_VALORES_ = SpreadsheetApp.openById(otro); } catch (e) {} }
      if (!LIBRO_VALORES_) {
        LIBRO_VALORES_ = SpreadsheetApp.create(PROP_VALORES_NOMBRE);
        propiedades_().setProperty(PROP_VALORES_ID, LIBRO_VALORES_.getId());
      }
    } finally {
      lock.releaseLock();
    }
  }
  return LIBRO_VALORES_;
}

/**
 * Lock propio (el del documento de Tesorería), distinto del de conLock_: esto puede
 * ejecutarse con conLock_ ya tomado (por ejemplo al guardar un contrato) sin trabarse.
 */
function lockPropiedades_() {
  return LockService.getDocumentLock() || LockService.getScriptLock();
}

let HOJAS_MIGRADAS_ = null;
let MUDANZA_INTENTADA_ = false;

/**
 * El libro de la hoja de Propiedades `nombre`: la planilla de Propiedades, con las hojas viejas
 * ya mudadas desde la de Tesorería. Se intenta mudar una vez por ejecución; ya mudadas, queda
 * anotado en la propiedad PROPIEDADES_HOJAS_MIGRADAS. Si esa hoja no se pudo mudar, se sigue
 * usando la de Tesorería (así no se pierde de vista ningún dato).
 */
function libroPropiedadesMigrado_(nombre) {
  const libro = libroValoresPropiedades_();
  if (!HOJAS_MIGRADAS_) { try { HOJAS_MIGRADAS_ = JSON.parse(propiedades_().getProperty(PROP_HOJAS_MIGRADAS) || '{}'); } catch (e) { HOJAS_MIGRADAS_ = {}; } }
  if (!MUDANZA_INTENTADA_ && HOJAS_PROPIEDADES_.some(n => !HOJAS_MIGRADAS_[n])) {
    MUDANZA_INTENTADA_ = true;
    migrarHojasPropiedades_(libro);
  }
  return HOJAS_MIGRADAS_[nombre] ? libro : libro_();
}

/** Mismo contenido (lo que se ve en cada celda) en las dos hojas. */
function hojasIguales_(a, b) {
  const fa = a.getLastRow(), ca = a.getLastColumn();
  if (fa !== b.getLastRow() || ca !== b.getLastColumn()) return false;
  if (!fa || !ca) return true;
  return JSON.stringify(a.getRange(1, 1, fa, ca).getDisplayValues()) === JSON.stringify(b.getRange(1, 1, fa, ca).getDisplayValues());
}

/**
 * Muda a la planilla de Propiedades las hojas de Propiedades que quedaron en la de Tesorería:
 * copia la hoja entera (con formatos), verifica que la copia sea igual y recién ahí la borra
 * de Tesorería. Si algo no coincide, no borra nada y deja el error en el registro.
 */
function migrarHojasPropiedades_(destino) {
  const lock = lockPropiedades_();
  lock.waitLock(30000);
  try {
    olvidarPropiedades_();
    try { HOJAS_MIGRADAS_ = JSON.parse(propiedades_().getProperty(PROP_HOJAS_MIGRADAS) || '{}'); } catch (e) { HOJAS_MIGRADAS_ = {}; }
    const tesoreria = libro_();
    const hechas = [];
    HOJAS_PROPIEDADES_.forEach(nombre => {
      if (HOJAS_MIGRADAS_[nombre]) return;
      try {
        const origen = tesoreria.getSheetByName(nombre);
        if (origen) {
          const temporal = 'Mudando · ' + nombre;
          const resto = destino.getSheetByName(temporal);
          if (resto) destino.deleteSheet(resto);  // de un intento anterior que se cortó
          const ya = destino.getSheetByName(nombre);
          if (ya && !hojasIguales_(origen, ya)) {
            // No debería pasar: ya hay otra hoja con ese nombre y distinto contenido. No se toca nada.
            throw new Error('La planilla de Propiedades ya tiene una hoja "' + nombre + '" distinta de la de Tesorería.');
          }
          if (!ya) {
            const copia = origen.copyTo(destino).setName(temporal);
            SpreadsheetApp.flush();
            if (!hojasIguales_(origen, copia)) { destino.deleteSheet(copia); throw new Error('La copia de "' + nombre + '" no salió igual.'); }
            copia.setName(nombre);
            SpreadsheetApp.flush();
          }
          const filas = Math.max(0, origen.getLastRow() - 1);
          tesoreria.deleteSheet(origen);
          hechas.push(nombre + ' (' + filas + ' filas)');
        }
        HOJAS_MIGRADAS_[nombre] = 1;
        // Lo que esta ejecución tenía guardado de la hoja vieja.
        delete HOJAS_[nombre];
        Object.keys(HOJAS_LISTAS_).forEach(k => { if (k.indexOf(nombre + '|') === 0) delete HOJAS_LISTAS_[k]; });
      } catch (e) {
        console.error('No se pudo mudar la hoja ' + nombre + ' a la planilla de Propiedades: ' + e.message);
        registrar_(null, 'Propiedades: error al mudar hoja', nombre + ': ' + e.message, nombre, '', '');
      }
    });
    if (destino.getName() === PROP_VALORES_NOMBRE_VIEJO) destino.rename(PROP_VALORES_NOMBRE);
    // La hoja vacía que trae una planilla nueva ("Hoja 1"), si ya hay otras.
    if (destino.getSheets().length > 1) destino.getSheets().filter(h => /^(Hoja|Sheet) ?1$/.test(h.getName()) && h.getLastRow() === 0).forEach(h => destino.deleteSheet(h));
    propiedades_().setProperty(PROP_HOJAS_MIGRADAS, JSON.stringify(HOJAS_MIGRADAS_));
    if (hechas.length) {
      try { marcarCambioDatos_(); } catch (e) {}
      registrar_(null, 'Propiedades: hojas mudadas a su planilla', hechas.join(' · ') + ' → ' + destino.getName(), destino.getId(), '', '');
    }
  } finally {
    lock.releaseLock();
  }
}

/** Hoja Unidades de la planilla de valores, con los títulos en negrita y fijos. */
function hojaValoresUnidades_() {
  const libro = libroValoresPropiedades_();
  let hoja = libro.getSheetByName(SHEET_VALORES_UNIDADES);
  if (!hoja) {
    // La planilla nueva trae una hoja vacía ("Hoja 1"): se usa esa.
    const hojas = libro.getSheets();
    hoja = hojas.length === 1 && hojas[0].getLastRow() === 0 ? hojas[0].setName(SHEET_VALORES_UNIDADES) : libro.insertSheet(SHEET_VALORES_UNIDADES);
  }
  titulosValores_(hoja, HEADERS_VALORES_UNIDADES);
  return hoja;
}

/** Títulos en negrita y fijos; si la hoja ya existía con menos columnas, completa los que faltan. */
function titulosValores_(hoja, headers) {
  if (hoja.getMaxColumns() < headers.length) hoja.insertColumnsAfter(hoja.getMaxColumns(), headers.length - hoja.getMaxColumns());
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    hoja.setFrozenRows(1);
    return;
  }
  const actuales = hoja.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (headers.some((h, i) => !String(actuales[i] || '').trim())) {
    hoja.getRange(1, 1, 1, headers.length).setValues([headers.map((h, i) => String(actuales[i] || '').trim() || h)]).setFontWeight('bold');
  }
}

function hojaParametrosProp_() {
  const libro = libroValoresPropiedades_();
  const hoja = libro.getSheetByName(SHEET_PARAMETROS_PROP) || libro.insertSheet(SHEET_PARAMETROS_PROP);
  titulosValores_(hoja, HEADERS_PARAMETROS_PROP);
  return hoja;
}

function leerParametrosProp_() {
  const hoja = hojaParametrosProp_();
  const ultima = hoja.getLastRow();
  if (ultima < 2) return [];
  return hoja.getRange(2, 1, ultima - 1, HEADERS_PARAMETROS_PROP.length).getValues().map((f, i) => ({
    fila: i + 2, edificio: String(f[0] || ''), costosVenta: numeroValor_(f[1]), tasaAlternativa: numeroValor_(f[2]),
    actualizadoPor: String(f[3] || ''), fecha: String(f[4] || '')
  })).filter(x => x.edificio);
}

function numeroValor_(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : importeANumero(String(v));
  return typeof n === 'number' && !isNaN(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function leerValoresUnidades_() {
  const hoja = hojaValoresUnidades_();
  const ultima = hoja.getLastRow();
  if (ultima < 2) return [];
  return hoja.getRange(2, 1, ultima - 1, HEADERS_VALORES_UNIDADES.length).getValues().map((fila, i) => {
    const o = { fila: i + 2 };
    HEADERS_VALORES_UNIDADES.forEach((h, k) => { o[h] = fila[k]; });
    return o;
  }).filter(f => f['Edificio'] && (f['Clave'] || f['Unidad']));
}

function valorPublico_(f) {
  const num = v => typeof v === 'number' ? v : numeroValor_(v);
  const fecha = f['Fecha'] instanceof Date ? Utilities.formatDate(f['Fecha'], Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') : String(f['Fecha'] || '');
  return {
    lugar: String(f['Lugar'] || ''), unidad: String(f['Unidad'] || ''), clave: String(f['Clave'] || ''),
    valorReal: num(f['Valor real']), precioCompra: num(f['Precio de compra']), ventaEstimada: num(f['Valor de venta estimado']),
    dormitorios: f['Dormitorios'] === '' || f['Dormitorios'] === null ? null : Number(f['Dormitorios']),
    destino: String(f['Destino'] || ''), cochera: String(f['Cochera'] || ''),
    gastosMensuales: num(f['Gastos mensuales']),
    muni: String(f['Cuenta municipal'] || ''), aguas: String(f['Cuenta de aguas'] || ''), rentas: String(f['Cuenta de rentas'] || ''),
    actualizadoPor: String(f['Actualizado por'] || ''), fecha: fecha
  };
}

/** Valores de las unidades de un edificio. d: {edificio} */
function obtenerValoresPropiedades_(d) {
  const edificio = String((d && d.edificio) || '').trim();
  const libro = libroValoresPropiedades_();
  const valores = leerValoresUnidades_().filter(f => !edificio || claveTexto(f['Edificio']) === claveTexto(edificio)).map(valorPublico_);
  const par = leerParametrosProp_().find(x => claveTexto(x.edificio) === claveTexto(edificio)) || null;
  let unidadesMapa = [];
  try { unidadesMapa = unidadesMapaDeEdificio_(edificio); } catch (e) { console.log('Unidades del mapa: ' + e.message); }
  return { ok: true, valores: valores, destinos: DESTINOS_UNIDAD, url: libro.getUrl(), parametros: par, unidadesMapa: unidadesMapa };
}

/**
 * Guarda los valores y el detalle de una unidad (una fila por edificio y unidad).
 * d: {edificio, lugar, unidad, clave, valorReal, precioCompra, ventaEstimada, dormitorios, destino, cochera, alquiler}
 */
function guardarValorPropiedad_(d, u) {
  // Los parámetros de Rentabilidad viajan por esta misma acción (así no hace falta otra en Código.gs).
  if (d && d.parametros) return guardarParametrosPropiedades_(d, u);
  // Lo mismo con las cuentas de impuestos cargadas de a muchas (pegadas de un listado).
  if (d && d.cuentas) return guardarCuentasPropiedades_(d, u);
  const edificio = String((d && d.edificio) || '').trim(), unidad = String((d && d.unidad) || '').trim();
  if (!edificio || !unidad) return { ok: false, error: 'Falta el edificio o la unidad.' };
  const clave = String(d.clave || unidad).trim();
  const dorm = d.dormitorios === '' || d.dormitorios === null || d.dormitorios === undefined ? '' : parseInt(d.dormitorios, 10);
  if (dorm !== '' && !(dorm >= 0 && dorm <= 20)) return { ok: false, error: 'La cantidad de dormitorios tiene que ser un número de 0 a 20.' };
  const destino = DESTINOS_UNIDAD.indexOf(d.destino) >= 0 ? d.destino : '';
  const cochera = d.cochera === 'Sí' || d.cochera === 'No' ? d.cochera : '';
  // La planilla se abre (o se crea, con su propio lock) antes de tomar el lock de la escritura.
  libroValoresPropiedades_();
  return conLock_(() => {
    const hoja = hojaValoresUnidades_();
    const filas = leerValoresUnidades_();
    const previa = filas.find(f => claveTexto(f['Edificio']) === claveTexto(edificio) && claveTexto(f['Clave'] || f['Unidad']) === claveTexto(clave));
    const nro = previa ? previa.fila : hoja.getLastRow() + 1;
    const vacio = v => v === null ? '' : v;
    const v = {
      'Edificio': edificio, 'Lugar': String(d.lugar || '').trim(), 'Unidad': unidad, 'Clave': clave,
      'Valor real': vacio(numeroValor_(d.valorReal)), 'Precio de compra': vacio(numeroValor_(d.precioCompra)),
      'Alquiler mensual': vacio(numeroValor_(d.alquiler)),
      // Rendimiento anual sobre el precio de compra: (alquiler × 12) / compra.
      'Rendimiento anual': '=IF(AND(ISNUMBER(F' + nro + '),F' + nro + '>0,ISNUMBER(G' + nro + ')),G' + nro + '*12/F' + nro + ',"")',
      'Valor de venta estimado': vacio(numeroValor_(d.ventaEstimada)),
      'Dormitorios': dorm, 'Destino': destino, 'Cochera': cochera, 'Actualizado por': nombreDe_(u), 'Fecha': ahoraTexto_(),
      'Gastos mensuales': vacio(numeroValor_(d.gastosMensuales))
    };
    // Cuentas de impuestos: las que no vienen en el pedido quedan como estaban.
    Object.keys(CUENTAS_UNIDAD).forEach(k => {
      const h = CUENTAS_UNIDAD[k];
      v[h] = d[k] !== undefined && d[k] !== null ? textoCuenta_(d[k]) : (previa ? String(previa[h] || '') : '');
    });
    const rango = hoja.getRange(nro, 1, 1, HEADERS_VALORES_UNIDADES.length);
    rango.setValues([HEADERS_VALORES_UNIDADES.map(h => v[h])]);
    COL_VALORES_IMPORTES.forEach(c => hoja.getRange(nro, c).setNumberFormat('$ #,##0.00'));
    hoja.getRange(nro, COL_VALORES_RENDIMIENTO).setNumberFormat('0.00%');
    hoja.getRange(nro, 14).setNumberFormat('@').setValue(v['Fecha']);
    formatoCuentas_(hoja, nro, v);
    const resumen = ['Valor real', 'Precio de compra', 'Valor de venta estimado'].filter(h => v[h] !== '').map(h => h + ' ' + formatoPesos(v[h])).join(' · ');
    registrar_(u, previa ? 'Propiedades: valores modificados' : 'Propiedades: valores cargados', edificio + ' · ' + unidad + (resumen ? ' · ' + resumen : ''), edificio + ' · ' + unidad,
      previa ? JSON.stringify(valorPublico_(previa)) : '', JSON.stringify(v));
    return { ok: true, valor: valorPublico_(v) };
  });
}

/** Costos de venta y tasa alternativa de un edificio. d: {parametros: true, edificio, costosVenta, tasaAlternativa} (en %) */
function guardarParametrosPropiedades_(d, u) {
  const edificio = String(d.edificio || '').trim();
  if (!edificio) return { ok: false, error: 'Falta el edificio.' };
  const costos = numeroValor_(d.costosVenta), tasa = numeroValor_(d.tasaAlternativa);
  if (costos !== null && costos > 50) return { ok: false, error: 'Los costos de venta tienen que ser un porcentaje de 0 a 50.' };
  if (tasa !== null && tasa > 1000) return { ok: false, error: 'La tasa alternativa tiene que ser un porcentaje anual de 0 a 1000.' };
  libroValoresPropiedades_();
  return conLock_(() => {
    const hoja = hojaParametrosProp_();
    const previa = leerParametrosProp_().find(x => claveTexto(x.edificio) === claveTexto(edificio));
    const fila = [edificio, costos === null ? '' : costos, tasa === null ? '' : tasa, nombreDe_(u), ahoraTexto_()];
    hoja.getRange(previa ? previa.fila : hoja.getLastRow() + 1, 1, 1, fila.length).setValues([fila]);
    registrar_(u, 'Propiedades: parámetros de rentabilidad', edificio + ' · costos de venta ' + (costos === null ? '—' : costos + ' %') + ' · tasa alternativa ' + (tasa === null ? '—' : tasa + ' %'), edificio,
      previa ? JSON.stringify(previa) : '', JSON.stringify(fila));
    return { ok: true, parametros: { edificio: edificio, costosVenta: costos, tasaAlternativa: tasa, actualizadoPor: nombreDe_(u), fecha: ahoraTexto_() } };
  });
}

/** Número de cuenta como texto, sin espacios de más (máx. 60 caracteres). */
function textoCuenta_(x) {
  return String(x == null ? '' : x).replace(/\s+/g, ' ').trim().substring(0, 60);
}

/** Las columnas de cuentas en texto, así los números largos no se vuelven 1,1E+11. */
function formatoCuentas_(hoja, nro, v) {
  Object.keys(CUENTAS_UNIDAD).forEach(k => {
    const col = HEADERS_VALORES_UNIDADES.indexOf(CUENTAS_UNIDAD[k]) + 1;
    hoja.getRange(nro, col).setNumberFormat('@').setValue(v[CUENTAS_UNIDAD[k]]);
  });
}

/**
 * Cuentas de impuestos (y, si vienen, dormitorios, destino y cochera) de muchas unidades de un edificio a la vez.
 * d: {cuentas: [{unidad, clave, lugar, muni, aguas, rentas, dormitorios, destino, cochera}], edificio}
 * Solo escribe esos datos (y crea la fila de la unidad si no tenía); los valores no se tocan.
 */
function guardarCuentasPropiedades_(d, u) {
  const edificio = String(d.edificio || '').trim();
  const lista = (d.cuentas || []).filter(x => x && String(x.unidad || '').trim());
  if (!edificio) return { ok: false, error: 'Falta el edificio.' };
  if (!lista.length) return { ok: false, error: 'No hay cuentas para guardar.' };
  if (lista.length > 300) return { ok: false, error: 'Son demasiadas unidades de una vez (máx. 300).' };
  libroValoresPropiedades_();
  return conLock_(() => {
    const hoja = hojaValoresUnidades_();
    const filas = leerValoresUnidades_();
    const cols = HEADERS_VALORES_UNIDADES.length;
    const guardadas = [];
    lista.forEach(x => {
      const unidad = String(x.unidad).trim(), clave = String(x.clave || unidad).trim();
      let previa = filas.find(f => claveTexto(f['Edificio']) === claveTexto(edificio) && claveTexto(f['Clave'] || f['Unidad']) === claveTexto(clave));
      let nro;
      if (previa) nro = previa.fila;
      else {
        nro = hoja.getLastRow() + 1;
        const nueva = HEADERS_VALORES_UNIDADES.map(h => ({ 'Edificio': edificio, 'Lugar': String(x.lugar || '').trim(), 'Unidad': unidad, 'Clave': clave })[h] || '');
        hoja.getRange(nro, 1, 1, cols).setValues([nueva]);
        previa = { fila: nro };
        HEADERS_VALORES_UNIDADES.forEach((h, i) => { previa[h] = nueva[i]; });
        filas.push(previa);
      }
      const v = {};
      Object.keys(CUENTAS_UNIDAD).forEach(k => {
        const h = CUENTAS_UNIDAD[k];
        v[h] = x[k] !== undefined && x[k] !== null ? textoCuenta_(x[k]) : String(previa[h] || '');
        previa[h] = v[h];
      });
      formatoCuentas_(hoja, nro, v);
      // Dormitorios y destino, si vienen (de 0 a 20 y uno de la lista).
      const dorm = x.dormitorios === undefined || x.dormitorios === null || x.dormitorios === '' ? null : parseInt(x.dormitorios, 10);
      if (dorm !== null && dorm >= 0 && dorm <= 20) { hoja.getRange(nro, HEADERS_VALORES_UNIDADES.indexOf('Dormitorios') + 1).setValue(dorm); previa['Dormitorios'] = dorm; }
      if (x.cochera === 'Sí' || x.cochera === 'No') { hoja.getRange(nro, HEADERS_VALORES_UNIDADES.indexOf('Cochera') + 1).setValue(x.cochera); previa['Cochera'] = x.cochera; }
      if (x.destino && DESTINOS_UNIDAD.indexOf(x.destino) >= 0) { hoja.getRange(nro, HEADERS_VALORES_UNIDADES.indexOf('Destino') + 1).setValue(x.destino); previa['Destino'] = x.destino; }
      hoja.getRange(nro, HEADERS_VALORES_UNIDADES.indexOf('Actualizado por') + 1, 1, 2).setNumberFormat('@').setValues([[nombreDe_(u), ahoraTexto_()]]);
      previa['Actualizado por'] = nombreDe_(u); previa['Fecha'] = ahoraTexto_();
      guardadas.push(valorPublico_(previa));
    });
    registrar_(u, 'Propiedades: cuentas de impuestos', edificio + ' · ' + guardadas.length + ' unidad(es)', edificio, '', JSON.stringify(lista));
    return { ok: true, valores: guardadas };
  });
}
