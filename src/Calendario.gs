/**
 * Calendario de vencimientos (vista Calendario) y su suscripción en Google Calendar.
 *
 * Junta lo que vence cada día: cheques emitidos a pagar y de terceros a cobrar, cheques
 * negociados en bolsa, compromisos (planes, pagos mensuales, tarjetas) y los recordatorios
 * con importe. Solo lectura: no cambia ninguna hoja.
 *
 * Google Calendar: se suscribe a un enlace secreto (formato iCal) que sirve esta misma
 * app (doGet con ?cal=...). Así no hace falta darle al script permiso sobre Calendar:
 * el calendario lo lee Google cada algunas horas y muestra un evento por día con el
 * total a pagar y a cobrar. El enlace se puede regenerar (el anterior deja de andar).
 */

const CAL_PROP_TOKEN = 'CALENDARIO_TOKEN';
const CAL_MAX_DIAS = 100;          // rango máximo que pide la vista de una vez
const CAL_ICS_ATRAS = 31;          // la suscripción muestra desde un mes atrás...
const CAL_ICS_ADELANTE = 210;      // ...hasta 7 meses adelante
// La URL pública de la app (la misma que usa bgpsammar.com en docs/sesion.js).
const CAL_URL_APP = 'https://script.google.com/macros/s/AKfycbzHN2YsUy94lXMT0RcSLfnuXQzx9j9ov4MleXNQhyPAKr7-tEwLIGEmnYcKaeA7pmh2IQ/exec';

/**
 * Lo que vence entre desde y hasta (aaaa-mm-dd, inclusive). Cada item:
 * {iso, tipo, clase: 'pagar'|'cobrar', titulo, detalle, importe (con signo), moneda, estimado, vencido, ref}
 * Los cheques y compromisos vencidos sin pagar aparecen en su fecha (vencido: true).
 */
function itemsCalendario_(desde, hasta) {
  const hoy = ahoraLocal().hoy;
  const items = [];
  const enRango = iso => iso && iso >= desde && iso <= hasta;
  const abierto = (estado, conc) => !conc && ESTADOS_ABIERTOS_SRV.indexOf(claveTexto(estado)) >= 0;
  const iso = s => {
    const t = String(s || '').trim().split(' ')[0];
    if (t.indexOf('/') > 0) return dmaAIso_(t);
    return esIsoValida(t.substring(0, 10)) ? t.substring(0, 10) : '';
  };

  leerFilas_(SHEET_CHEQUES, HEADERS_CHEQUES).forEach(c => {
    if (!c['N° de Cheque'] && !c['Importe']) return;
    if (!abierto(c['Estado'], c['Conciliación'])) return;
    const f = iso(c['Fecha de Pago']) || iso(c['Fecha de Emisión']);
    if (!enRango(f)) return;
    const imp = Math.abs(importeANumero(c['Importe']));
    if (!imp) return;
    const moneda = c['Moneda'] === 'USD' ? 'USD' : 'Pesos';
    if (c['Tipo'] === 'Emitido') {
      items.push({ iso: f, tipo: 'Cheque emitido', clase: 'pagar', titulo: 'Cheque N° ' + c['N° de Cheque'] + ' · ' + (c['Banco'] || ''),
        detalle: c['Destino'] || c['Titular'] || c['Concepto'] || '', importe: -imp, moneda: moneda, vencido: f < hoy, ref: 'ch-' + c['Banco'] + '-' + c['N° de Cheque'] });
    } else {
      items.push({ iso: f, tipo: 'Cheque de terceros', clase: 'cobrar', titulo: 'Cheque N° ' + c['N° de Cheque'] + (c['Banco Emisor'] ? ' · ' + c['Banco Emisor'] : ''),
        detalle: (c['Titular'] || '') + (claveTexto(c['Estado']).indexOf('custodia') === 0 ? ' · en custodia' : ''), importe: imp, moneda: moneda, vencido: false, ref: 'ct-' + c['Banco Emisor'] + '-' + c['N° de Cheque'] });
    }
  });

  leerFilas_(SHEET_BOLSA, HEADERS_BOLSA).forEach(b => {
    if (!abierto(b['Condicion'], '')) return;
    const f = iso(b['Fecha de pago']);
    const m = importeANumero(b['Monto']);
    if (!enRango(f) || !m) return;
    const moneda = claveTexto(b['Moneda']).indexOf('u') === 0 ? 'USD' : 'Pesos';
    items.push({ iso: f, tipo: 'Cheque en bolsa', clase: m < 0 ? 'pagar' : 'cobrar', titulo: 'Bolsa · cheque N° ' + (b['Numero de cheque'] || b['ID']) + (b['ALYC'] ? ' · ' + b['ALYC'] : ''),
      detalle: [b['SGR/Emisor'], b['Destino'], b['Concepto']].filter(Boolean).join(' · '), importe: m, moneda: moneda, vencido: m < 0 && f < hoy, ref: 'bo-' + (b['ID Planilla'] || b['ID']) });
  });

  leerFilas_(SHEET_COMPROMISOS, HEADERS_COMPROMISOS).forEach(c => {
    if (!c['ID'] || c['Estado'] === 'Pagado') return;
    const f = iso(c['Fecha de Vencimiento']);
    if (!enRango(f)) return;
    const real = Math.abs(importeANumero(c['Monto']));
    const m = real || Math.abs(importeANumero(c['Monto Estimado']));
    items.push({ iso: f, tipo: c['Categoría'] || 'Compromiso', clase: 'pagar', titulo: c['Concepto'] || 'Compromiso',
      detalle: [c['Detalle'], c['Cuenta'], c['Modo de Pago']].filter(Boolean).join(' · '), importe: -m, moneda: c['Moneda'] === 'USD' ? 'USD' : 'Pesos',
      estimado: !real && !!m, vencido: f < hoy, ref: 'co-' + c['ID'] });
  });

  // Recordatorios con importe (como en Saldos y flujo): desde hoy, no hacia atrás.
  const usuarios = {};
  leerUsuarios_().forEach(x => { usuarios[x['ID']] = x['Nombre'] || x['Usuario']; });
  const inicio = desde > hoy ? desde : hoy;
  if (inicio <= hasta) {
    const dias = Math.min(400, Math.round((fechaUtc(hasta) - fechaUtc(inicio)) / 86400000));
    leerAlertas_().forEach(a => {
      if (!a['ID'] || a['Activa'] !== 'Sí' || !String(a['Importe'] || '').trim()) return;
      const imp = Math.abs(importeANumero(a['Importe']));
      if (!imp) return;
      for (let i = 0; i <= dias; i++) {
        const f = sumarDias(inicio, i);
        if (!coincideAlerta(a, f)) continue;
        const ingreso = a['Tipo de Importe'] === 'Ingreso';
        items.push({ iso: f, tipo: 'Recordatorio', clase: ingreso ? 'cobrar' : 'pagar', titulo: a['Título'] || 'Recordatorio',
          detalle: usuarios[a['Usuario']] ? 'De ' + usuarios[a['Usuario']] : '', importe: ingreso ? imp : -imp, moneda: 'Pesos', vencido: false, ref: 'al-' + a['ID'] + '-' + f });
        if (a['Frecuencia'] === 'Una vez') break;
      }
    });
  }

  items.forEach(x => { x.importe = Math.round(x.importe * 100) / 100; });
  items.sort((a, b) => a.iso.localeCompare(b.iso) || a.clase.localeCompare(b.clase) || Math.abs(b.importe) - Math.abs(a.importe));
  return items;
}

/** d: {desde, hasta} (aaaa-mm-dd). */
function obtenerCalendario_(d) {
  const hoy = ahoraLocal().hoy;
  let desde = esIsoValida(d.desde) ? d.desde : hoy.substring(0, 8) + '01';
  let hasta = esIsoValida(d.hasta) ? d.hasta : sumarDias(desde, 41);
  if (hasta < desde) hasta = desde;
  if ((fechaUtc(hasta) - fechaUtc(desde)) / 86400000 > CAL_MAX_DIAS) hasta = sumarDias(desde, CAL_MAX_DIAS);
  return { ok: true, hoy: hoy, desde: desde, hasta: hasta, items: itemsCalendario_(desde, hasta) };
}

/** Enlace de suscripción para Google Calendar. d.regenerar: crea uno nuevo (el anterior deja de andar). */
function suscripcionCalendario_(d, u) {
  return conLock_(() => {
    const props = propiedades_();
    let token = props.getProperty(CAL_PROP_TOKEN);
    if (!token || d.regenerar) {
      const nuevo = !token;
      token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
      props.setProperty(CAL_PROP_TOKEN, token);
      registrar_(u, nuevo ? 'Calendario: enlace creado' : 'Calendario: enlace regenerado',
        nuevo ? 'Enlace de suscripción de Google Calendar creado.' : 'Se generó un enlace nuevo de Google Calendar; el anterior dejó de funcionar.', 'Calendario', '', '');
    }
    const url = CAL_URL_APP + '?cal=' + token;
    return { ok: true, url: url, webcal: url.replace(/^https:/, 'webcal:') };
  });
}

// ---------- iCal ----------

/** Lo que devuelve doGet cuando la URL trae ?cal=... */
function feedCalendario_(token) {
  const guardado = propiedades_().getProperty(CAL_PROP_TOKEN);
  if (!guardado || String(token || '') !== guardado) {
    return ContentService.createTextOutput('Enlace de calendario inválido o regenerado.').setMimeType(ContentService.MimeType.TEXT);
  }
  const hoy = ahoraLocal().hoy;
  return ContentService.createTextOutput(icsCalendario_(itemsCalendario_(sumarDias(hoy, -CAL_ICS_ATRAS), sumarDias(hoy, CAL_ICS_ADELANTE)), hoy))
    .setMimeType(ContentService.MimeType.ICAL);
}

function icsTexto_(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Corta las líneas largas como pide el formato (75 caracteres, sigue con un espacio). */
function icsLinea_(s) {
  if (s.length <= 74) return s;
  const partes = [];
  for (let i = 0; i < s.length; i += 73) partes.push((i ? ' ' : '') + s.substring(i, i + 73));
  return partes.join('\r\n');
}

/** Un evento de día completo por día con vencimientos: el total a pagar y a cobrar en el título y el detalle abajo. */
function icsCalendario_(items, hoy) {
  const porDia = {};
  items.forEach(x => { (porDia[x.iso] = porDia[x.iso] || []).push(x); });
  const sello = Utilities.formatDate(new Date(), 'UTC', "yyyyMMdd'T'HHmmss'Z'");
  const l = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sammartino//Tesoreria//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Tesorería · vencimientos', 'X-WR-TIMEZONE:America/Argentina/Buenos_Aires',
    'X-WR-CALDESC:' + icsTexto_('Vencimientos de la Tesorería de ' + empresa_() + ': cheques, bolsa, compromisos y recordatorios.'),
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  Object.keys(porDia).sort().forEach(iso => {
    const lista = porDia[iso];
    const tot = { pagar: { Pesos: 0, USD: 0 }, cobrar: { Pesos: 0, USD: 0 } };
    lista.forEach(x => { tot[x.clase][x.moneda] += Math.abs(x.importe); });
    const texto = o => ['Pesos', 'USD'].filter(k => o[k]).map(k => asisFormatoCal_(o[k], k)).join(' + ');
    const partes = [];
    if (texto(tot.pagar)) partes.push('Pagar ' + texto(tot.pagar));
    if (texto(tot.cobrar)) partes.push('Cobrar ' + texto(tot.cobrar));
    const vencidos = lista.filter(x => x.vencido).length;
    const resumen = (iso < hoy && vencidos ? '⚠ ' : '') + 'Tesorería: ' + (partes.join(' · ') || lista.length + ' vencimiento(s)');
    const detalle = lista.map(x => (x.clase === 'pagar' ? '− ' : '+ ') + x.tipo + ': ' + x.titulo + (x.detalle ? ' (' + x.detalle + ')' : '') + ' · ' +
      asisFormatoCal_(Math.abs(x.importe), x.moneda) + (x.estimado ? ' (estimado)' : '') + (x.vencido ? ' · VENCIDO SIN PAGAR' : '')).join('\n');
    const fin = sumarDias(iso, 1);
    l.push('BEGIN:VEVENT', 'UID:tesoreria-' + iso + '@bgpsammar.com', 'DTSTAMP:' + sello,
      'DTSTART;VALUE=DATE:' + iso.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + fin.replace(/-/g, ''),
      icsLinea_('SUMMARY:' + icsTexto_(resumen)), icsLinea_('DESCRIPTION:' + icsTexto_(detalle + '\n\nAbrir la Tesorería: https://bgpsammar.com')),
      'TRANSP:TRANSPARENT', 'END:VEVENT');
  });
  l.push('END:VCALENDAR');
  return l.join('\r\n') + '\r\n';
}

function asisFormatoCal_(n, moneda) {
  const t = formatoPesos(Number(n) || 0);
  return moneda === 'USD' ? t.split('$ ').join('US$ ') : t;
}
