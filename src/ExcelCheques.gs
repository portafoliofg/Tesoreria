/**
 * Cheques para Excel: un enlace secreto (como el de Google Calendar, ver Calendario.gs)
 * que devuelve los cheques abiertos en CSV para traerlos con Power Query
 * (Datos → Obtener datos). Lo sirve doGet con ?xls=<token>&tipo=cartera|emitidos.
 *
 * - cartera: cheques de terceros todavía en cartera (pendiente, en cartera, en custodia).
 * - emitidos: cheques propios todavía sin debitar (incluye los vencidos sin pagar).
 * - sin tipo: los dos juntos, con la columna Tipo.
 *
 * Cada fila trae la columna Mes (aaaa-mm) de la fecha de pago, para agrupar mes por mes.
 * Fechas en aaaa-mm-dd e importes con punto decimal y sin separador de miles: así no
 * dependen de la configuración regional del Excel (la consulta les pone el tipo con
 * cultura en-US). Solo lectura: no cambia ninguna hoja. El enlace se puede regenerar.
 */

const XLS_PROP_TOKEN = 'EXCEL_CHEQUES_TOKEN';
const XLS_COLUMNAS = ['Tipo', 'Mes', 'Fecha de pago', 'Banco', 'N° de cheque', 'Titular / Destino', 'CUIT', 'Concepto', 'Importe', 'Moneda', 'Estado', 'Vencido'];

/** Filas de cheques abiertos. tipo: 'cartera', 'emitidos' u otro (los dos). */
function filasExcelCheques_(tipo) {
  const hoy = ahoraLocal().hoy;
  const iso = s => {
    const t = String(s || '').trim().split(' ')[0];
    if (t.indexOf('/') > 0) return dmaAIso_(t);
    return esIsoValida(t.substring(0, 10)) ? t.substring(0, 10) : '';
  };
  const filas = [];
  leerFilas_(SHEET_CHEQUES, HEADERS_CHEQUES).forEach(c => {
    if (!c['N° de Cheque'] && !c['Importe']) return;
    if (c['Conciliación'] || ESTADOS_ABIERTOS_SRV.indexOf(claveTexto(c['Estado'])) < 0) return;
    const emitido = c['Tipo'] === 'Emitido';
    if ((tipo === 'cartera' && emitido) || (tipo === 'emitidos' && !emitido)) return;
    const imp = Math.round(Math.abs(importeANumero(c['Importe'])) * 100) / 100;
    if (!imp) return;
    const f = iso(c['Fecha de Pago']) || iso(c['Fecha de Emisión']);
    filas.push({
      'Tipo': emitido ? 'Emitido' : 'En cartera',
      'Mes': f ? f.substring(0, 7) : 'Sin fecha',
      'Fecha de pago': f,
      'Banco': emitido ? (c['Banco'] || '') : (c['Banco Emisor'] || c['Banco'] || ''),
      'N° de cheque': String(c['N° de Cheque'] || ''),
      'Titular / Destino': emitido ? (c['Destino'] || c['Titular'] || '') : (c['Titular'] || ''),
      'CUIT': String(c['CUIT'] || ''),
      'Concepto': c['Concepto'] || '',
      'Importe': imp,
      'Moneda': c['Moneda'] === 'USD' ? 'USD' : 'Pesos',
      'Estado': c['Estado'] || 'Pendiente',
      'Vencido': emitido && f && f < hoy ? 'Sí' : 'No'
    });
  });
  // Sin fecha al final; dentro de cada día, primero los más grandes.
  filas.sort((a, b) => (a['Fecha de pago'] || '9999').localeCompare(b['Fecha de pago'] || '9999') || b['Importe'] - a['Importe']);
  return filas;
}

function csvCampo_(v) {
  const s = String(v === undefined || v === null ? '' : v).replace(/\r?\n/g, ' ');
  return '"' + s.replace(/"/g, '""') + '"';
}

function csvExcelCheques_(filas) {
  const l = [XLS_COLUMNAS.map(csvCampo_).join(',')];
  filas.forEach(f => l.push(XLS_COLUMNAS.map(k => k === 'Importe' ? String(f[k]) : csvCampo_(f[k])).join(',')));
  // Marca UTF-8 al principio: así Excel no rompe los acentos.
  return '﻿' + l.join('\r\n') + '\r\n';
}

/** Lo que devuelve doGet cuando la URL trae ?xls=... */
function feedExcelCheques_(token, tipo) {
  const guardado = propiedades_().getProperty(XLS_PROP_TOKEN);
  if (!guardado || String(token || '') !== guardado) {
    return ContentService.createTextOutput('Enlace de cheques inválido o regenerado.').setMimeType(ContentService.MimeType.TEXT);
  }
  return ContentService.createTextOutput(csvExcelCheques_(filasExcelCheques_(String(tipo || '').toLowerCase())))
    .setMimeType(ContentService.MimeType.CSV);
}

/** Enlaces para Excel. d.regenerar: crea uno nuevo (el anterior deja de andar). */
function enlaceExcelCheques_(d, u) {
  return conLock_(() => {
    const props = propiedades_();
    let token = props.getProperty(XLS_PROP_TOKEN);
    if (!token || d.regenerar) {
      const nuevo = !token;
      token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
      props.setProperty(XLS_PROP_TOKEN, token);
      registrar_(u, nuevo ? 'Excel: enlace de cheques creado' : 'Excel: enlace de cheques regenerado',
        nuevo ? 'Enlace de cheques para Excel creado.' : 'Se generó un enlace nuevo de cheques para Excel; el anterior dejó de funcionar.', 'Cheques', '', '');
    }
    const base = CAL_URL_APP + '?xls=' + token;
    return { ok: true, cartera: base + '&tipo=cartera', emitidos: base + '&tipo=emitidos', todos: base };
  });
}
