/**
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
const PROP_VALORES_NOMBRE = 'Propiedades · Valores de unidades';
const SHEET_VALORES_UNIDADES = 'Unidades';
const HEADERS_VALORES_UNIDADES = [
  'Edificio', 'Lugar', 'Unidad', 'Clave', 'Valor real', 'Precio de compra', 'Alquiler mensual', 'Rendimiento anual',
  'Valor de venta estimado', 'Dormitorios', 'Destino', 'Cochera', 'Actualizado por', 'Fecha', 'Gastos mensuales'
];
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
    const lock = LockService.getScriptLock();
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
    actualizadoPor: String(f['Actualizado por'] || ''), fecha: fecha
  };
}

/** Valores de las unidades de un edificio. d: {edificio} */
function obtenerValoresPropiedades_(d) {
  const edificio = String((d && d.edificio) || '').trim();
  const libro = libroValoresPropiedades_();
  const valores = leerValoresUnidades_().filter(f => !edificio || claveTexto(f['Edificio']) === claveTexto(edificio)).map(valorPublico_);
  const par = leerParametrosProp_().find(x => claveTexto(x.edificio) === claveTexto(edificio)) || null;
  return { ok: true, valores: valores, destinos: DESTINOS_UNIDAD, url: libro.getUrl(), parametros: par };
}

/**
 * Guarda los valores y el detalle de una unidad (una fila por edificio y unidad).
 * d: {edificio, lugar, unidad, clave, valorReal, precioCompra, ventaEstimada, dormitorios, destino, cochera, alquiler}
 */
function guardarValorPropiedad_(d, u) {
  // Los parámetros de Rentabilidad viajan por esta misma acción (así no hace falta otra en Código.gs).
  if (d && d.parametros) return guardarParametrosPropiedades_(d, u);
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
    const rango = hoja.getRange(nro, 1, 1, HEADERS_VALORES_UNIDADES.length);
    rango.setValues([HEADERS_VALORES_UNIDADES.map(h => v[h])]);
    COL_VALORES_IMPORTES.forEach(c => hoja.getRange(nro, c).setNumberFormat('$ #,##0.00'));
    hoja.getRange(nro, COL_VALORES_RENDIMIENTO).setNumberFormat('0.00%');
    hoja.getRange(nro, 14).setNumberFormat('@').setValue(v['Fecha']);
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
