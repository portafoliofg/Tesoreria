/**
 * Análisis (vista Análisis): configuración compartida y cotización histórica del dólar.
 *
 * La vista calcula todo en la página con los movimientos, cheques, compromisos y saldos
 * ya cargados; acá solo se guarda su configuración (reglas de clasificación, rubros fijos,
 * presupuesto, saldo a dejar en cuenta y las proyecciones semanales del flujo). Es una sola
 * para todos los usuarios y no pasa por la auditoría: no son datos de la tesorería.
 *
 * Una propiedad del script admite unos 9 KB, así que el JSON se parte en trozos:
 * ANALISIS_CFG_N dice cuántos hay y ANALISIS_CFG_0, _1… los guardan.
 */
const AN_PROP = 'ANALISIS_CFG';
const AN_TROZO = 4000;
const AN_MAX = 120000;

function leerAnalisis_() {
  const p = propiedades_();
  const n = parseInt(p.getProperty(AN_PROP + '_N') || '0', 10) || 0;
  let texto = '';
  for (let i = 0; i < n; i++) texto += p.getProperty(AN_PROP + '_' + i) || '';
  try { return JSON.parse(texto || '{}') || {}; } catch (e) { return {}; }
}

function obtenerAnalisis_(d, u) {
  return { ok: true, config: leerAnalisis_() };
}

/** d.config: objeto completo (reemplaza al anterior). */
function guardarAnalisis_(d, u) {
  const cfg = d && d.config;
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return { ok: false, error: 'Configuración inválida.' };
  const texto = JSON.stringify(cfg);
  if (texto.length > AN_MAX) return { ok: false, error: 'La configuración de Análisis es demasiado grande: quitá las reglas que no se usen.' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    olvidarPropiedades_();
    const p = propiedades_();
    const antes = parseInt(p.getProperty(AN_PROP + '_N') || '0', 10) || 0;
    const n = Math.ceil(texto.length / AN_TROZO);
    for (let i = 0; i < n; i++) p.setProperty(AN_PROP + '_' + i, texto.substring(i * AN_TROZO, (i + 1) * AN_TROZO));
    p.setProperty(AN_PROP + '_N', String(n));
    for (let i = n; i < antes; i++) p.deleteProperty(AN_PROP + '_' + i);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// ----- Cotización histórica del dólar (para el gasto en dólares) -----
// Promedio mensual de la cotización de venta del oficial, el blue y el MEP de los últimos
// 5 años, de la API pública argentinadatos.com. Se guarda 6 horas.
function dolarHistorico_() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get('dolar_hist');
  if (guardado) { try { return JSON.parse(guardado); } catch (e) {} }
  const casas = { oficial: 'oficial', blue: 'blue', mep: 'bolsa' };
  const hace = new Date();
  hace.setMonth(hace.getMonth() - 60);
  const desde = Utilities.formatDate(hace, Session.getScriptTimeZone(), 'yyyy-MM');
  const meses = {};
  Object.keys(casas).forEach(k => {
    const res = UrlFetchApp.fetch('https://api.argentinadatos.com/v1/cotizaciones/dolares/' + casas[k], { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return;
    const suma = {}, cuenta = {};
    JSON.parse(res.getContentText() || '[]').forEach(x => {
      const m = String(x.fecha || '').substring(0, 7), v = Number(x.venta);
      if (m < desde || !(v > 0)) return;
      suma[m] = (suma[m] || 0) + v;
      cuenta[m] = (cuenta[m] || 0) + 1;
    });
    Object.keys(suma).forEach(m => { (meses[m] = meses[m] || {})[k] = Math.round(suma[m] / cuenta[m] * 100) / 100; });
  });
  if (!Object.keys(meses).length) return { ok: false, error: 'No se pudo leer la cotización histórica del dólar.' };
  const r = { ok: true, meses: meses, fuente: 'argentinadatos.com' };
  try { cache.put('dolar_hist', JSON.stringify(r), 21600); } catch (e) {}
  return r;
}
