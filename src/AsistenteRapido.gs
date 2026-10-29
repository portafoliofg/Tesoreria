/**
 * Asistente · respuestas rápidas.
 *
 * Las preguntas más comunes se contestan directo con los datos, sin pasar por Gemini:
 * tarda uno o dos segundos y no gasta cuota. Si la pregunta no encaja clara en una
 * regla (o pide algo que la regla no cubre), devuelve null y la contesta Gemini como siempre.
 *
 *   Cheques   "cheques en cartera para octubre", "cheques emitidos que vencen esta semana",
 *             "cheques vencidos sin pagar", "cheques a cobrar el mes que viene"
 *   Saldos    "¿cuánto tenemos de saldo a favor?", "saldo de Galicia", "saldo de FCI",
 *             "¿cuánta plata tenemos?"
 *   FCI       "rendimiento del FCI de Galicia", "¿cuánto rindió el FCI en septiembre?"
 *   Pagos     "¿qué vence esta semana?", "pagos de los próximos 15 días"
 *
 * Cada regla devuelve { texto, voz }: texto para la pantalla (guiones y **negrita**) y
 * voz para leer en voz alta (corto, sin listas).
 */

const ASIS_RAPIDA_MAX_LINEAS = 15;

// Palabras que piden algo más que el dato directo: eso lo contesta Gemini.
const ASIS_RAPIDA_NO = ['por que', 'porque', 'compar', 'evoluc', 'historial', 'grafic', 'explica', 'analiz', 'recorda', 'anota',
  'pendiente de', 'conciliar', 'concilia', 'factura', 'proveedor', 'inquilino', 'alquiler', 'propiedad', 'tarjeta', 'plan de pago',
  'quien', 'cargo', 'cargaron', 'mensual', 'mail', 'whatsapp', 'promedio', 'proyecc', 'deberia', 'conviene', 'si hubiera', 'cuantos dias'];

/** null si no hay regla para esta pregunta. */
function asisRapida_(texto, u) {
  const t = ' ' + claveTexto(texto).replace(/[¿?¡!.,;:()"]/g, ' ').replace(/\s+/g, ' ') + ' ';
  if (t.length > 160) return null;  // una pregunta larga suele tener matices
  if (ASIS_RAPIDA_NO.some(p => t.indexOf(p) >= 0)) return null;
  ASIS_MEMO_ = {};
  const hoy = ahoraLocal().hoy;
  try {
    if (/ cheq/.test(t)) return asisRapidaCheques_(t, hoy);
    if (/ (rendimiento|rindio|rinde|rindieron|rinden|gano|ganaron|tna) /.test(t) && /( fci | fondo| fcis )/.test(t)) return asisRapidaRendimiento_(t, hoy);
    if (/ saldo|cuanta plata|cuanto dinero|cuanta guita|cuanto tenemos|cuanto tengo|cuanto hay /.test(t)) return asisRapidaSaldos_(t, hoy);
    if (/ (vence|vencen|vencimientos|pagos|pagar) /.test(t) && !/ (pago|pagamos|pague|pagaron) a /.test(t)) return asisRapidaVencimientos_(t, hoy);
  } catch (e) {
    console.log('Asistente · respuesta rápida falló, sigue Gemini: ' + e.message);
  }
  return null;
}

// ---------- Fechas ----------

/**
 * Período nombrado en la pregunta: { desde, hasta, nombre } (aaaa-mm-dd), o null si no nombra ninguno.
 * Entiende hoy, mañana, ayer, esta semana, la semana que viene, este mes, el mes que viene,
 * el mes pasado, un mes por nombre (con año o sin), próximos / últimos N días y vencidos.
 */
function asisPeriodo_(t, hoy) {
  const y = parseInt(hoy.substring(0, 4), 10), m = parseInt(hoy.substring(5, 7), 10);
  const mes = (yy, mm) => {
    while (mm > 12) { mm -= 12; yy++; }
    while (mm < 1) { mm += 12; yy--; }
    const ini = yy + '-' + ('0' + mm).slice(-2) + '-01';
    return { desde: ini, hasta: ini.substring(0, 8) + ('0' + ultimoDiaDelMes(ini)).slice(-2), nombre: ASIS_MESES[mm - 1] + (yy !== y ? ' de ' + yy : '') };
  };
  const lunes = sumarDias(hoy, 1 - diaSemana(hoy));
  let r;
  if ((r = / (proximos|siguientes) (\d{1,3}) dias /.exec(t)) || (r = / (en|a) (\d{1,3}) dias /.exec(t))) {
    return { desde: hoy, hasta: sumarDias(hoy, parseInt(r[2], 10)), nombre: 'los próximos ' + r[2] + ' días' };
  }
  if ((r = / (ultimos|pasados) (\d{1,3}) dias /.exec(t))) return { desde: sumarDias(hoy, -parseInt(r[2], 10)), hasta: hoy, nombre: 'los últimos ' + r[2] + ' días' };
  if (/ pasado manana /.test(t)) { const d = sumarDias(hoy, 2); return { desde: d, hasta: d, nombre: 'pasado mañana' }; }
  if (/ manana /.test(t)) { const d = sumarDias(hoy, 1); return { desde: d, hasta: d, nombre: 'mañana' }; }
  if (/ hoy /.test(t)) return { desde: hoy, hasta: hoy, nombre: 'hoy' };
  if (/ ayer /.test(t)) { const d = sumarDias(hoy, -1); return { desde: d, hasta: d, nombre: 'ayer' }; }
  if (/ (semana que viene|proxima semana|semana proxima|siguiente semana) /.test(t)) return { desde: sumarDias(lunes, 7), hasta: sumarDias(lunes, 13), nombre: 'la semana que viene' };
  if (/ (semana pasada|ultima semana) /.test(t)) return { desde: sumarDias(lunes, -7), hasta: sumarDias(lunes, -1), nombre: 'la semana pasada' };
  if (/ (esta semana|la semana|en la semana) /.test(t)) return { desde: lunes, hasta: sumarDias(lunes, 6), nombre: 'esta semana' };
  if (/ (mes que viene|proximo mes|mes proximo|siguiente mes) /.test(t)) return mes(y, m + 1);
  if (/ (mes pasado|ultimo mes|mes anterior) /.test(t)) return mes(y, m - 1);
  if (/ (este mes|del mes|en el mes|el mes) /.test(t)) return mes(y, m);
  for (let i = 0; i < 12; i++) {
    const n = ASIS_MESES[i] === 'septiembre' ? '(septiembre|setiembre)' : ASIS_MESES[i];
    const rm = new RegExp(' ' + n + '( de| del)?( (20\\d\\d))? ').exec(t);
    if (rm) return mes(rm[3] ? parseInt(rm[3], 10) : y, i + 1);
  }
  if ((r = / (20\d\d) /.exec(t))) return { desde: r[1] + '-01-01', hasta: r[1] + '-12-31', nombre: r[1] };
  return null;
}

function asisFechaCorta_(iso) {
  return iso ? iso.substring(8, 10) + '/' + iso.substring(5, 7) : '';
}

// ---------- Bancos ----------

const ASIS_RAPIDA_BANCOS = [['bancor', 'bancor'], ['cordoba', 'bancor'], ['bbva', 'bbva'], ['frances', 'bbva'], ['nacion', 'nacion'],
  ['supervielle', 'supervielle'], ['galicia', 'galicia'], ['macro', 'macro'], ['santander', 'santander'], ['ciudad', 'ciudad'],
  ['hipotecario', 'hipotecario'], ['credicoop', 'credicoop'], ['patagonia', 'patagonia'], ['icbc', 'icbc'], ['hsbc', 'hsbc'],
  ['brubank', 'brubank'], ['mercado pago', 'mercadopago'], ['mercadopago', 'mercadopago'], ['provincia', 'provincia']];

/** Banco nombrado en la pregunta (como lo devuelve bancoCanon_), o ''. */
function asisBancoEnTexto_(t) {
  for (let i = 0; i < ASIS_RAPIDA_BANCOS.length; i++) if (t.indexOf(' ' + ASIS_RAPIDA_BANCOS[i][0]) >= 0) return ASIS_RAPIDA_BANCOS[i][1];
  return '';
}

function asisNombreBanco_(canon) {
  const nombres = { bancor: 'Bancor', bbva: 'BBVA', nacion: 'Nación', galicia: 'Galicia', macro: 'Macro', santander: 'Santander', ciudad: 'Ciudad',
    supervielle: 'Supervielle', hipotecario: 'Hipotecario', credicoop: 'Credicoop', patagonia: 'Patagonia', icbc: 'ICBC', hsbc: 'HSBC',
    brubank: 'Brubank', mercadopago: 'Mercado Pago', provincia: 'Provincia' };
  return nombres[canon] || asisMayuscula_(canon);
}

/** Totales por moneda en texto: "$ 1.000,00 y US$ 50,00". */
function asisTotalesTexto_(tot, negrita) {
  return ['Pesos', 'USD'].filter(k => tot[k]).map(k => (negrita ? '**' : '') + asisFormato_(tot[k], k) + (negrita ? '**' : '')).join(' y ') || asisFormato_(0, 'Pesos');
}

function asisTotalesVoz_(tot) {
  return ['Pesos', 'USD'].filter(k => tot[k]).map(k => asisImporteVoz_(tot[k], k)).join(' y ') || 'cero pesos';
}

// ---------- Cheques ----------

function asisRapidaCheques_(t, hoy) {
  // Un número de cheque puntual o una persona: mejor con Gemini (busca por texto).
  if (/\d{4,}/.test(t.replace(/ 20\d\d /g, ' '))) return null;
  if (/ (de|a|para) (la |el )?(empresa|sr|sra|senor|senora) /.test(t)) return null;
  const terceros = / (cartera|terceros|a cobrar|cobrar|a favor|recibidos|recibimos|depositar|custodia) /.test(t);
  const emitidos = / (emitidos|emitimos|emitido|propios|a pagar|pagar|a debitar|debitar|en contra|librados) /.test(t);
  const vencidos = / (vencidos|vencido|atrasados|sin pagar|impagos) /.test(t);
  const venceVerbo = / (vence|vencen|vencimiento|vencimientos|vencer) /.test(t);
  if (!terceros && !emitidos && !vencidos && !venceVerbo) return null;
  let periodo = asisPeriodo_(t, hoy);
  if (vencidos && !periodo) periodo = { desde: '', hasta: sumarDias(hoy, -1), nombre: '' };
  const tipos = terceros && !emitidos ? ['De terceros'] : emitidos && !terceros ? ['Emitido'] : vencidos && !terceros ? ['Emitido'] : ['De terceros', 'Emitido'];

  const lista = [];
  asisFilas_(SHEET_CHEQUES, HEADERS_CHEQUES).forEach(c => {
    if (!c['N° de Cheque'] && !c['Importe']) return;
    if (tipos.indexOf(c['Tipo']) < 0) return;
    if (c['Conciliación'] || ESTADOS_ABIERTOS_SRV.indexOf(claveTexto(c['Estado'])) < 0) return;
    const iso = asisIso_(c['Fecha de Pago']) || asisIso_(c['Fecha de Emisión']);
    if (periodo && !asisEnRango_(iso, periodo.desde, periodo.hasta)) return;
    lista.push({ iso: iso, imp: Math.abs(importeANumero(c['Importe'])), moneda: c['Moneda'] === 'USD' ? 'USD' : 'Pesos', c: c });
  });
  lista.sort((x, y) => (x.iso || '9').localeCompare(y.iso || '9') || y.imp - x.imp);

  const que = tipos.length === 2 ? 'cheques abiertos' : tipos[0] === 'De terceros' ? 'cheques de terceros en cartera' : vencidos ? 'cheques emitidos vencidos sin pagar' : 'cheques emitidos pendientes';
  const cuando = periodo && periodo.nombre ? (/^(hoy|mañana|ayer|pasado|esta|la)/.test(periodo.nombre) ? ' ' : ' en ') + periodo.nombre : '';
  if (!lista.length) {
    const txt = 'No hay ' + que + (cuando ? ' con fecha de pago' + cuando : '') + '.';
    return { texto: txt, voz: txt };
  }
  const bloques = tipos.map(tipo => {
    const sub = lista.filter(x => x.c['Tipo'] === tipo);
    const tot = {};
    sub.forEach(x => { tot[x.moneda] = (tot[x.moneda] || 0) + x.imp; });
    return { tipo: tipo, sub: sub, tot: tot };
  }).filter(b => b.sub.length);

  const l = [];
  const v = [];
  bloques.forEach(b => {
    const nombre = b.tipo === 'De terceros' ? (tipos.length === 2 ? 'A cobrar (de terceros en cartera)' : '') : (tipos.length === 2 ? 'A pagar (emitidos)' : '');
    const cab = b.sub.length + ' cheque' + (b.sub.length === 1 ? '' : 's') + ' por ' + asisTotalesTexto_(b.tot, true);
    l.push(nombre ? '**' + nombre + '**: ' + cab : asisMayuscula_(que) + cuando + ': ' + cab + '.');
    b.sub.slice(0, ASIS_RAPIDA_MAX_LINEAS).forEach(x => {
      const c = x.c;
      const quien = b.tipo === 'De terceros' ? (c['Titular'] || c['Banco Emisor'] || '') : (c['Destino'] || c['Titular'] || c['Concepto'] || c['Banco'] || '');
      const estado = claveTexto(c['Estado']).indexOf('custodia') === 0 ? ' · en custodia' : '';
      const vencido = b.tipo === 'Emitido' && x.iso && x.iso < hoy ? ' · vencido' : '';
      l.push('- ' + (asisFechaCorta_(x.iso) || 'sin fecha') + ' · N° ' + c['N° de Cheque'] + (quien ? ' · ' + quien : '') + ' · ' + asisFormato_(x.imp, x.moneda) + estado + vencido);
    });
    if (b.sub.length > ASIS_RAPIDA_MAX_LINEAS) l.push('- y ' + (b.sub.length - ASIS_RAPIDA_MAX_LINEAS) + ' más.');
    v.push(b.sub.length + ' ' + (b.tipo === 'De terceros' ? (tipos.length === 2 ? 'a cobrar' : 'cheque' + (b.sub.length === 1 ? '' : 's')) : (tipos.length === 2 ? 'a pagar' : 'cheque' + (b.sub.length === 1 ? '' : 's'))) + ' por ' + asisTotalesVoz_(b.tot));
  });
  if (tipos.length === 2) l.unshift('Cheques abiertos' + (cuando ? ' con fecha de pago' + cuando : '') + ':');
  l.push('', 'Por fecha de pago. El detalle está en Cheques.');
  return { texto: l.join('\n'), voz: asisMayuscula_(que) + cuando + ': ' + v.join(', y ') + '.' };
}

// ---------- Saldos ----------

/** El último saldo informado de cada cuenta y de cada FCI. */
function asisUltimosSaldos_() {
  const ult = {};
  asisFilas_(SHEET_SALDOS, HEADERS_SALDOS).forEach(s => {
    const k = s['Cuenta ID'];
    const iso = dmaAIso_(s['Fecha']);
    if (!k || !iso || !String(s['Saldo'] || '').trim()) return;
    if (!ult[k] || iso > ult[k].iso || (iso === ult[k].iso && ordenFechaCarga_(s['Fecha de Carga']) > ordenFechaCarga_(ult[k].s['Fecha de Carga']))) ult[k] = { iso: iso, s: s };
  });
  const cuentas = [], fci = [];
  Object.keys(ult).forEach(k => {
    const s = ult[k].s;
    const fila = { banco: s['Banco'], canon: bancoCanon_(s['Banco']), cuenta: s['N° de Cuenta'], iso: ult[k].iso, saldo: importeANumero(s['Saldo']), moneda: s['Moneda'] === 'USD' ? 'USD' : 'Pesos' };
    if (s['Tipo'] === 'FCI' || String(k).indexOf('FCI|') === 0) fci.push(fila); else cuentas.push(fila);
  });
  // Como en la app: un FCI informado 45 días antes que el último ya no suma (fondo rescatado).
  const ultimoFci = fci.reduce((mx, f) => f.iso > mx ? f.iso : mx, '');
  const corte = ultimoFci ? sumarDias(ultimoFci, -45) : '';
  fci.forEach(f => { f.viejo = f.iso < corte; });
  return { cuentas: cuentas, fci: fci.filter(f => f.saldo) };
}

function asisRapidaSaldos_(t, hoy) {
  if (asisPeriodo_(t, hoy)) return null;  // saldos a otra fecha: Gemini con el historial
  const banco = asisBancoEnTexto_(t);
  const soloFci = / (fci|fcis|fondo|fondos) /.test(t) && !/ cuentas /.test(t);
  const aFavor = / a favor /.test(t);
  const d = asisUltimosSaldos_();
  const cuentas = d.cuentas.filter(c => (!banco || c.canon === banco) && !soloFci);
  const fci = d.fci.filter(f => !banco || f.canon === banco);
  if (!cuentas.length && !fci.length) {
    const txt = banco ? 'No tengo saldos cargados de ' + asisNombreBanco_(banco) + (soloFci ? ' en FCI' : '') + '.' : 'Todavía no hay saldos cargados.';
    return { texto: txt, voz: txt };
  }
  const suma = (lista, moneda) => lista.filter(x => x.moneda === moneda && !x.viejo).reduce((a, x) => a + x.saldo, 0);
  const fechaDe = lista => { const f = lista.map(x => x.iso).sort(); return f.length ? f[f.length - 1] : ''; };
  const l = [];
  let voz;

  if (banco) {
    const nombre = asisNombreBanco_(banco);
    const tot = { Pesos: suma(cuentas, 'Pesos') + suma(fci, 'Pesos'), USD: suma(cuentas, 'USD') + suma(fci, 'USD') };
    l.push('**' + nombre + '**' + (soloFci ? ' en FCI' : '') + ': ' + asisTotalesTexto_(tot, true) + '.');
    cuentas.sort((a, b) => (a.moneda + a.cuenta).localeCompare(b.moneda + b.cuenta)).forEach(c => l.push('- Cuenta ' + c.cuenta + ': ' + asisFormato_(c.saldo, c.moneda) + ' (al ' + isoAMostrar(c.iso) + ')'));
    fci.forEach(f => l.push('- FCI: ' + asisFormato_(f.saldo, f.moneda) + ' (al ' + isoAMostrar(f.iso) + (f.viejo ? ', desactualizado: no suma' : '') + ')'));
    voz = (soloFci ? 'En el FCI de ' : 'En ') + nombre + ' hay ' + asisTotalesVoz_(tot) + ', según el último saldo informado.';
  } else if (soloFci) {
    const tot = { Pesos: suma(fci, 'Pesos'), USD: suma(fci, 'USD') };
    l.push('En FCI hay ' + asisTotalesTexto_(tot, true) + '.');
    fci.slice().sort((a, b) => b.saldo - a.saldo).forEach(f => l.push('- ' + f.banco + ': ' + asisFormato_(f.saldo, f.moneda) + ' (al ' + isoAMostrar(f.iso) + (f.viejo ? ', desactualizado: no suma' : '') + ')'));
    voz = 'En FCI hay ' + asisTotalesVoz_(tot) + ', según el último saldo informado de cada banco.';
  } else {
    const c = { Pesos: suma(cuentas, 'Pesos'), USD: suma(cuentas, 'USD') };
    const f = { Pesos: suma(fci, 'Pesos'), USD: suma(fci, 'USD') };
    const tot = { Pesos: c.Pesos + f.Pesos, USD: c.USD + f.USD };
    l.push((aFavor ? 'Saldo a favor' : 'Saldo total') + ', cuentas más FCI: ' + asisTotalesTexto_(tot, true) + '.');
    l.push('- Cuentas en pesos: ' + asisFormato_(c.Pesos, 'Pesos'));
    l.push('- FCI en pesos: ' + asisFormato_(f.Pesos, 'Pesos'));
    if (c.USD || f.USD) l.push('- En dólares: cuentas ' + asisFormato_(c.USD, 'USD') + (f.USD ? ' · FCI ' + asisFormato_(f.USD, 'USD') : ''));
    const negativas = cuentas.filter(x => x.saldo < 0);
    if (negativas.length) l.push('- En negativo: ' + negativas.map(x => x.banco + ' ' + x.cuenta + ' ' + asisFormato_(x.saldo, x.moneda)).join('; '));
    voz = 'Entre cuentas y FCI hay ' + asisTotalesVoz_(tot) + '.';
    if (aFavor) {
      // "A favor" también son los cheques de terceros en cartera, como en Flujo de cheques.
      const ch = { Pesos: 0, USD: 0 };
      let n = 0;
      asisFilas_(SHEET_CHEQUES, HEADERS_CHEQUES).forEach(x => {
        if (x['Tipo'] !== 'De terceros' || x['Conciliación'] || ESTADOS_ABIERTOS_SRV.indexOf(claveTexto(x['Estado'])) < 0) return;
        const imp = Math.abs(importeANumero(x['Importe']));
        if (!imp) return;
        ch[x['Moneda'] === 'USD' ? 'USD' : 'Pesos'] += imp;
        n++;
      });
      if (n) {
        l.push('', 'Además, a favor en cheques de terceros en cartera: **' + asisTotalesTexto_(ch, false) + '** (' + n + ' cheque' + (n === 1 ? '' : 's') + ').');
        voz += ' Y en cheques de terceros en cartera, ' + asisTotalesVoz_(ch) + '.';
      }
    }
  }
  const fecha = fechaDe(cuentas.concat(fci));
  l.push('', 'Último saldo informado de cada cuenta' + (fecha ? ' (el más nuevo es del ' + isoAMostrar(fecha) + ')' : '') + '.');
  return { texto: l.join('\n'), voz: voz };
}

// ---------- Rendimiento del FCI ----------

/**
 * Igual que en la app (FCI y Bolsa): entre dos saldos de FCI seguidos de un banco, en dos pasos:
 *   1. Cierre del día anterior (23:50, hora de Argentina) = saldo de inicio + suscripciones − rescates
 *      del medio (los del mismo día del saldo nuevo van al período siguiente).
 *   2. Rendimiento = saldo de hoy − cierre del día anterior.
 * Rendimiento % = rendimiento ÷ cierre del día anterior. TNA = rendimiento sobre el capital por los
 * días, llevado a 365. Los tramos que dan más de 0,3% diario se dejan afuera.
 */
function asisRendimientoFci_() {
  const grupos = {};
  asisFilas_(SHEET_SALDOS, HEADERS_SALDOS).forEach(s => {
    if (!(s['Tipo'] === 'FCI' || String(s['Cuenta ID']).indexOf('FCI|') === 0)) return;
    const iso = dmaAIso_(s['Fecha']);
    if (!iso) return;
    const moneda = s['Moneda'] === 'USD' ? 'USD' : 'Pesos';
    const k = bancoCanon_(s['Banco']) + '|' + moneda;
    const g = grupos[k] || (grupos[k] = { k: k, canon: bancoCanon_(s['Banco']), banco: s['Banco'], moneda: moneda, porFecha: {} });
    const prev = g.porFecha[iso];
    if (!prev || ordenFechaCarga_(s['Fecha de Carga']) >= ordenFechaCarga_(prev['Fecha de Carga'])) g.porFecha[iso] = s;
  });
  // Rescates y suscripciones; los cargados en la app (FCIM-) que repiten uno de la planilla no se cuentan dos veces.
  const todos = [];
  asisFilas_(SHEET_FCI, HEADERS_FCI).forEach(f => {
    if (claveTexto(f['Movimiento']).trim() === 'saldo') return;
    const iso = asisIso_(f['Fecha']);
    const monto = importeANumero(f['Monto']);
    if (!iso || !monto) return;
    todos.push({ iso: iso, monto: monto, manual: String(f['ID Planilla'] || '').indexOf('FCIM-') === 0, k: bancoCanon_(f['Banco']) + '|' + asisMoneda_(f['Moneda']) });
  });
  const dePlanilla = {};
  todos.forEach(x => { if (!x.manual) { const c = x.k + '|' + x.iso + '|' + x.monto.toFixed(2); dePlanilla[c] = (dePlanilla[c] || 0) + 1; } });
  const movs = todos.filter(x => {
    if (!x.manual) return true;
    const c = x.k + '|' + x.iso + '|' + x.monto.toFixed(2);
    if (!dePlanilla[c]) return true;
    dePlanilla[c]--;
    return false;
  });
  return Object.keys(grupos).map(k => {
    const g = grupos[k];
    const fechas = Object.keys(g.porFecha).sort();
    const delBanco = movs.filter(x => x.k === k);
    const periodos = [];
    for (let i = 1; i < fechas.length; i++) {
      const desde = fechas[i - 1], hasta = fechas[i];
      const ini = importeANumero(g.porFecha[desde]['Saldo']), fin = importeANumero(g.porFecha[hasta]['Saldo']);
      let mov = 0;
      delBanco.forEach(x => { if (x.iso >= desde && x.iso < hasta) mov += x.monto; });
      const capital = ini + mov;
      const dias = Math.max(1, Math.round((fechaUtc(hasta) - fechaUtc(desde)) / 86400000));
      const rend = fin - capital;
      periodos.push({ desde: desde, hasta: hasta, dias: dias, capital: capital, rend: rend, dudoso: !(capital > 0) || Math.abs(rend / capital) / dias > 0.003 });
    }
    const ultima = fechas[fechas.length - 1];
    return { canon: g.canon, banco: g.banco, moneda: g.moneda, periodos: periodos, ultimo: { iso: ultima, saldo: importeANumero(g.porFecha[ultima]['Saldo']) } };
  });
}

function asisRapidaRendimiento_(t, hoy) {
  let banco = asisBancoEnTexto_(t);
  if (!banco) {
    // "rendimiento del FCI Pionero": el fondo dice de qué banco es.
    asisFilas_(SHEET_FCI, HEADERS_FCI).some(f => {
      const fondo = claveTexto(f['Fondo']).trim();
      if (fondo.length >= 4 && t.indexOf(' ' + fondo) >= 0) { banco = bancoCanon_(f['Banco']); return true; }
      return false;
    });
  }
  const periodo = asisPeriodo_(t, hoy) || { desde: sumarDias(hoy, -30), hasta: hoy, nombre: 'los últimos 30 días' };
  // Los tramos que terminan dentro del período.
  const desde = sumarDias(periodo.desde, -1), hasta = periodo.hasta;
  const todos = asisRendimientoFci_();
  const fondos = todos.filter(f => !banco || f.canon === banco);
  if (!fondos.length) {
    const hay = todos.map(f => f.banco).filter((b, i, a) => a.indexOf(b) === i);
    const txt = banco ? 'No tengo saldos de FCI de ' + asisNombreBanco_(banco) + '.' + (hay.length ? ' Hay FCI de: ' + hay.join(', ') + '.' : '') : 'Todavía no hay saldos de FCI cargados para calcular el rendimiento.';
    return { texto: txt, voz: txt };
  }
  const filas = fondos.map(f => {
    let rend = 0, base = 0, dudosos = 0, ini = '', fin = '', n = 0, cierre = 0;
    f.periodos.forEach(p => {
      if (p.hasta <= desde || p.hasta > hasta) return;
      if (p.dudoso) { dudosos++; return; }
      rend += p.rend;
      base += p.capital * p.dias;
      n++;
      cierre = p.capital;
      if (!ini || p.desde < ini) ini = p.desde;
      if (!fin || p.hasta > fin) fin = p.hasta;
    });
    // Rendimiento % sobre el cierre del día anterior: solo cuando es un tramo (un día o un fin de semana).
    return { f: f, rend: rend, tna: base > 0 ? rend / base * 365 : null, pct: n === 1 && cierre > 0 ? rend / cierre : null, cierre: n === 1 ? cierre : null, dudosos: dudosos, ini: ini, fin: fin };
  }).filter(x => x.ini || x.dudosos).sort((a, b) => b.rend - a.rend);
  const cuando = /^(hoy|mañana|ayer|pasado|esta|la)/.test(periodo.nombre) ? periodo.nombre : 'en ' + periodo.nombre;
  if (!filas.length) {
    const txt = 'No tengo dos saldos de FCI' + (banco ? ' de ' + asisNombreBanco_(banco) : '') + ' seguidos ' + cuando + ' para calcular el rendimiento. Se calcula con los saldos de FCI que se cargan en Saldos.';
    return { texto: txt, voz: txt };
  }
  const pct = x => x === null ? '' : (Math.round(x * 1000) / 10).toFixed(1).replace('.', ',') + '%';
  const tot = {};
  filas.forEach(x => { tot[x.f.moneda] = (tot[x.f.moneda] || 0) + x.rend; });
  const l = [];
  const quien = banco ? 'El FCI de ' + asisNombreBanco_(banco) : 'Los FCI';
  l.push(quien + (banco ? ' rindió ' : ' rindieron ') + asisTotalesTexto_(tot, true) + ' ' + cuando + '.');
  filas.forEach(x => {
    l.push('- ' + x.f.banco + (x.f.moneda === 'USD' ? ' (dólares)' : '') + ': ' + asisFormato_(x.rend, x.f.moneda) +
      (x.pct !== null ? ' (' + (Math.round(x.pct * 100000) / 1000).toFixed(3).replace('.', ',') + '% sobre el cierre del día anterior de ' + asisFormato_(x.cierre, x.f.moneda) + ')' : '') +
      (x.tna !== null ? ' · TNA ' + pct(x.tna) : '') +
      (x.ini ? ' · del ' + isoAMostrar(x.ini) + ' al ' + isoAMostrar(x.fin) : '') + (x.dudosos ? ' · ' + x.dudosos + ' tramo(s) que no cierran, sin contar' : ''));
  });
  l.push('', 'Rendimiento = saldo del día − cierre del día anterior (saldo anterior + suscripciones − rescates, a las 23:50).');
  const uno = filas.length === 1 ? filas[0] : null;
  const voz = quien + (banco ? ' rindió ' : ' rindieron ') + asisTotalesVoz_(tot) + ' ' + cuando + (uno && uno.tna !== null ? ', una tasa nominal anual de ' + pct(uno.tna).replace('%', ' por ciento') : '') + '.';
  return { texto: l.join('\n'), voz: voz };
}

// ---------- Vencimientos ----------

function asisRapidaVencimientos_(t, hoy) {
  const periodo = asisPeriodo_(t, hoy);
  if (periodo && periodo.hasta < hoy) return null;  // lo que ya se pagó: Gemini con los movimientos
  const hasta = periodo ? periodo.hasta : sumarDias(hoy, 7);
  const dias = Math.max(1, Math.round((fechaUtc(hasta) - fechaUtc(hoy)) / 86400000));
  if (dias > 120) return null;
  const desde = periodo && periodo.desde > hoy ? periodo.desde : '';
  const r = asisVencimientos_({ dias: dias, limite: 80 });
  // asisVencimientos_ incluye lo vencido impago; si el período empieza más adelante, se recorta.
  const filas = (r.filas || []).filter(x => !desde || dmaAIso_(x.fecha) >= desde);
  const cuando = periodo ? (/^(hoy|mañana|pasado|esta|la)/.test(periodo.nombre) ? periodo.nombre : 'en ' + periodo.nombre) : 'los próximos 7 días';
  if (!filas.length) {
    const txt = 'No hay vencimientos ' + cuando + '.';
    return { texto: txt, voz: txt };
  }
  const pagar = {}, cobrar = {};
  filas.forEach(x => { const o = x.importe < 0 ? pagar : cobrar; o[x.moneda] = (o[x.moneda] || 0) + Math.abs(x.importe); });
  const l = ['Vencimientos ' + cuando + (desde ? '' : ' (incluye lo vencido sin pagar)') + ': a pagar ' + asisTotalesTexto_(pagar, true) +
    (Object.keys(cobrar).length ? ', a cobrar ' + asisTotalesTexto_(cobrar, true) : '') + '.'];
  filas.slice(0, ASIS_RAPIDA_MAX_LINEAS).forEach(x => l.push('- ' + x.fecha.substring(0, 5) + ' · ' + x.tipo + ' · ' + x.detalle + ' · ' + asisFormato_(x.importe, x.moneda) + (x.vencido ? ' · vencido' : '')));
  if (filas.length > ASIS_RAPIDA_MAX_LINEAS) l.push('- y ' + (filas.length - ASIS_RAPIDA_MAX_LINEAS) + ' más.');
  const voz = 'Para ' + cuando.replace(/^en /, '') + ' hay ' + filas.length + ' vencimiento' + (filas.length === 1 ? '' : 's') + ': a pagar ' + asisTotalesVoz_(pagar) +
    (Object.keys(cobrar).length ? ' y a cobrar ' + asisTotalesVoz_(cobrar) : '') + '.';
  return { texto: l.join('\n'), voz: voz };
}
