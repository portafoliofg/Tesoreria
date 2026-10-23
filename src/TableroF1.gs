/**
 * Modo Fórmula 1 (bgpsammar.com/f1.html): tablero para una pantalla de la oficina.
 * Junta en un solo pedido la caja (cuentas y FCI), lo del mes, los próximos
 * vencimientos, las propiedades y los avisos. Solo lee. La página se refresca sola.
 */

function tableroF1_(d, u) {
  const hoy = ahoraLocal().hoy;
  const ayer = sumarDias(hoy, -1);
  const colores = {};
  leerFilas_(SHEET_BANCOS, HEADERS_BANCOS).forEach(b => { if (b['Banco']) colores[bancoCanon_(b['Banco'])] = b['Color']; });
  const cuentas = {};
  leerFilas_(SHEET_CUENTAS, HEADERS_CUENTAS).forEach(c => { if (c['ID']) cuentas[c['ID']] = c; });

  // Último saldo de cada cuenta y FCI, y el que tenía hasta ayer (para la diferencia).
  const porId = {};
  leerFilas_(SHEET_SALDOS, HEADERS_SALDOS).forEach(s => {
    const id = s['Cuenta ID'], iso = dmaAIso_(s['Fecha']);
    if (!id || !iso || iso > hoy) return;
    const x = porId[id] || (porId[id] = { ult: null, previo: null });
    const fila = { iso: iso, s: s, carga: ordenFechaCarga_(s['Fecha de Carga']) };
    const mejor = (a, b) => !a || b.iso > a.iso || (b.iso === a.iso && b.carga >= a.carga);
    if (mejor(x.ult, fila)) x.ult = fila;
    if (iso <= ayer && mejor(x.previo, fila)) x.previo = fila;
  });
  const pilotos = [];
  let total = 0, totalAyer = 0, comparable = 0, ctas = 0, fci = 0, usd = 0;
  Object.keys(porId).forEach(id => {
    const x = porId[id];
    if (!x.ult) return;
    const s = x.ult.s;
    const esFci = s['Tipo'] === 'FCI' || id.indexOf('FCI|') === 0;
    const moneda = s['Moneda'] === 'USD' ? 'USD' : 'Pesos';
    const saldo = importeANumero(s['Saldo']);
    const c = cuentas[id];
    const num = soloDigitos(s['N° de Cuenta']);
    pilotos.push({
      nombre: s['Banco'] + (esFci ? ' · FCI' : ' · ' + (c ? siglaCuenta_(c['Tipo de Cuenta']) : 'Cta') + (num ? ' ' + num.slice(-4) : '')),
      banco: s['Banco'], color: colores[bancoCanon_(s['Banco'])] || '', fci: esFci, moneda: moneda, saldo: saldo, fecha: s['Fecha'],
      antes: x.previo ? importeANumero(x.previo.s['Saldo']) : null
    });
    if (moneda === 'USD') { usd += saldo; return; }
    total += saldo;
    if (esFci) fci += saldo; else ctas += saldo;
    // La diferencia contra ayer, solo con las cuentas que tenían saldo ayer (una cuenta nueva no es "ganancia").
    if (x.previo) { totalAyer += importeANumero(x.previo.s['Saldo']); comparable += saldo; }
  });
  pilotos.sort((a, b) => (a.moneda === b.moneda ? 0 : a.moneda === 'USD' ? 1 : -1) || b.saldo - a.saldo);

  // Ingresos y egresos del mes en curso (pesos, sin propias ni resúmenes ya conciliados).
  const mes = hoy.substring(0, 7);
  let ing = 0, egr = 0, nMov = 0;
  leerFilas_(SHEET_TRANSFERENCIAS, HEADERS_TRANSFERENCIAS).forEach(f => {
    const iso = dmaAIso_(f['Fecha del Movimiento'] || f['Fecha de Carga']);
    if (!iso || iso.substring(0, 7) !== mes || f['Entre Cuentas Propias'] === 'Sí' || f['Moneda'] === 'USD') return;
    if (f['Origen'] === 'Resumen' && f['Conciliación']) return;
    const m = importeANumero(f['Monto']);
    nMov++;
    if (m >= 0) ing += m; else egr += m;
  });

  // Próximos 7 días (de Asistente.gs, si está).
  let boxes = [];
  try {
    if (typeof asisVencimientos_ === 'function') boxes = (asisVencimientos_({ dias: 7, limite: 14 }).filas || []);
  } catch (e) { console.log('F1 vencimientos: ' + e.message); }

  // Propiedades: última liquidación de cada edificio.
  const ult = {};
  try {
    (obtenerPropiedades_().liquidaciones || []).forEach(x => {
      const k = claveTexto(x.edificio);
      if (!ult[k] || String(x.orden) > String(ult[k].orden)) ult[k] = x;
    });
  } catch (e) {}
  const propiedades = Object.keys(ult).map(k => {
    const x = ult[k], dd = x.datos || {};
    const us = dd.unidades || [];
    const totales = (dd.liquidacion || []).filter(l => l.tipo === 'total');
    return {
      edificio: x.edificio, periodo: x.periodo, unidades: us.length,
      noAbono: us.filter(un => un.estado === 'no-abono').length, desocupadas: us.filter(un => un.estado === 'desocupado').length,
      cobrado: totales.length ? totales[totales.length - 1].monto : us.reduce((a, un) => a + (typeof un.total === 'number' ? un.total : 0), 0)
    };
  });

  // Banderas: lo que no cuadra (Asistente.gs) y los contratos (Contratos.gs).
  const banderas = [];
  try { if (typeof asisHallazgos_ === 'function' && asisRevisionActiva_()) asisHallazgos_().forEach(h => banderas.push({ tipo: 'amarilla', texto: h.titulo })); } catch (e) {}
  try { if (typeof avisosContratos_ === 'function') avisosContratos_(hoy).forEach(a => banderas.push({ tipo: a.grave ? 'roja' : 'azul', texto: a.texto })); } catch (e) {}

  return {
    ok: true, hoy: hoy, empresa: empresa_(),
    caja: { total: total, diferencia: comparable - totalAyer, cuentas: ctas, fci: fci, usd: usd },
    mes: { ingresos: ing, egresos: egr, movimientos: nMov },
    pilotos: pilotos, boxes: boxes, propiedades: propiedades, banderas: banderas
  };
}

function siglaCuenta_(tipo) {
  const t = claveTexto(tipo);
  return t.indexOf('corriente') >= 0 ? 'CC' : t.indexOf('caja') >= 0 ? 'CA' : 'Cta';
}
