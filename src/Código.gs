/**
 * Lector de comprobantes — Código del servidor (Google Apps Script)
 *
 * Toda la página habla con el servidor por una sola función: api(json).
 * api() valida la sesión del usuario, ejecuta la acción pedida y deja
 * registro en la hoja "Auditoría" de cada alta, cambio o baja.
 * Las funciones internas terminan en "_" para que no se puedan llamar
 * directo desde el navegador salteando el control de sesión.
 *
 * Hojas (se crean solas si no existen):
 *  - "Transferencias", "Cheques": movimientos y cheques.
 *  - "Bancos", "Cuentas": listado de la pestaña Bancos y cuentas.
 *  - "Alertas": recordatorios por WhatsApp; cada una pertenece a un usuario.
 *  - "Usuarios": usuarios de la app (la contraseña se guarda con hash y sal).
 *  - "Auditoría": quién hizo qué y cuándo, con valores antes / después.
 *  - "Conciliaciones": conciliaciones bancarias guardadas (banco vs. registros propios).
 *  - "Saldos": saldo de cada cuenta a una fecha (de los resúmenes o cargado a mano).
 *  Los archivos de comprobantes van a la carpeta de Drive "Tesorería · Comprobantes".
 *
 * Propiedades del script: EMPRESA y WA_APIKEY_<id de usuario>.
 */

const SHEET_TRANSFERENCIAS = 'Transferencias';
const HEADERS_TRANSFERENCIAS = [
  'N° Interno', 'Fecha de Carga', 'Banco', 'Tipo de Cuenta', 'N° de Cuenta', 'Archivo',
  'N° de Referencia', 'Moneda', 'Monto', 'Condición', 'Concepto',
  'Fecha del Movimiento', 'Origen', 'Entre Cuentas Propias', 'Contraparte', 'Cargado por', 'Conciliación',
  'Destinatario', 'CUIT Destino', 'Cuenta Destino', 'Banco Destino', 'Comprobante',
  // Datos de la planilla de flujo de fondos (Instrumento: Transferencia, Efectivo o FCI).
  'Instrumento', 'Persona', 'Ordenante', 'Clase', 'Factura Asociada', 'Estado', 'ID Planilla'
];
const COL_COMPROBANTE_TRANS = HEADERS_TRANSFERENCIAS.indexOf('Comprobante');
const COL_INTERNO = HEADERS_TRANSFERENCIAS.indexOf('N° Interno');
const COL_FECHA_CARGA = HEADERS_TRANSFERENCIAS.indexOf('Fecha de Carga');
const COL_BANCO_TRANS = HEADERS_TRANSFERENCIAS.indexOf('Banco');
const COL_REFERENCIA = HEADERS_TRANSFERENCIAS.indexOf('N° de Referencia');
const COL_MONEDA = HEADERS_TRANSFERENCIAS.indexOf('Moneda');
const COL_MONTO = HEADERS_TRANSFERENCIAS.indexOf('Monto');
const COL_CONDICION = HEADERS_TRANSFERENCIAS.indexOf('Condición');
const COL_TIPO_CUENTA = HEADERS_TRANSFERENCIAS.indexOf('Tipo de Cuenta');
const COL_NUMERO_CUENTA = HEADERS_TRANSFERENCIAS.indexOf('N° de Cuenta');
const COL_ARCHIVO = HEADERS_TRANSFERENCIAS.indexOf('Archivo');
const COL_ORIGEN = HEADERS_TRANSFERENCIAS.indexOf('Origen');
const COL_PROPIA = HEADERS_TRANSFERENCIAS.indexOf('Entre Cuentas Propias');
const COL_CARGADO_TRANS = HEADERS_TRANSFERENCIAS.indexOf('Cargado por');
const COL_CONC_TRANS = HEADERS_TRANSFERENCIAS.indexOf('Conciliación');

const SHEET_CHEQUES = 'Cheques';
const HEADERS_CHEQUES = [
  'Archivo', 'Banco', 'Tipo', 'N° de Cheque', 'Titular', 'CUIT',
  'Fecha de Emisión', 'Fecha de Pago', 'Importe', 'Concepto', 'N° de Cuenta', 'Tipo de Cuenta', 'Cargado por', 'Conciliación', 'Comprobante',
  // Datos de la planilla de flujo de fondos. Estado: Pendiente, Pagado, Endosado, Depositado, En cartera, etc.
  // Canal "Bolsa": cheques y pagarés negociados por una ALYC.
  'Persona', 'Estado', 'Fecha de Débito', 'Destino', 'Chequera', 'Banco Emisor', 'Canal', 'ALYC', 'SGR / Emisor', 'Moneda', 'ID Planilla'
];
const COL_COMPROBANTE_CHEQUE = HEADERS_CHEQUES.indexOf('Comprobante');
const COL_BANCO_CHEQUE = HEADERS_CHEQUES.indexOf('Banco');
const COL_NUMERO_CHEQUE = HEADERS_CHEQUES.indexOf('N° de Cheque');
const COL_CARGADO_CHEQUE = HEADERS_CHEQUES.indexOf('Cargado por');
const COL_CONC_CHEQUE = HEADERS_CHEQUES.indexOf('Conciliación');

const SHEET_SALDOS = 'Saldos';
// Tipo: 'Cuenta' (saldo de una cuenta) o 'FCI' (fondos comunes de un banco; Cuenta ID = FCI|Banco|Moneda).
const HEADERS_SALDOS = ['Fecha', 'Banco', 'N° de Cuenta', 'Cuenta ID', 'Saldo', 'Moneda', 'Origen', 'Cargado por', 'Fecha de Carga', 'Tipo'];

const SHEET_CONCILIACIONES = 'Conciliaciones';
const HEADERS_CONCILIACIONES = [
  'ID', 'Fecha', 'Usuario', 'Banco', 'N° de Cuenta', 'Desde', 'Hasta', 'Saldo según Banco', 'Saldo según Libros',
  'Conciliados', 'Pendientes en Banco', 'Pendientes en Libros', 'Estado', 'Detalle',
  // Claves de los movimientos de un extracto leído desde archivo (no se guardan en Movimientos):
  // sirven para no volver a mostrarlos como pendientes si se carga el mismo archivo.
  'Extracto'
];

// FCI y Bolsa: pestaña propia, con las mismas columnas que las hojas FCI y Bolsa de la planilla de flujo de fondos.
const SHEET_FCI = 'Inversiones FCI';
const HEADERS_FCI = ['Persona', 'Fecha', 'Banco', 'Fondo', 'Movimiento', 'Solicitud o rendimiento', 'Moneda', 'Monto', 'ID Planilla', 'Importado por', 'Fecha de Importación'];
const SHEET_BOLSA = 'Inversiones Bolsa';
// 'Importe recibido': lo que entró a la cuenta al negociar el cheque (se carga en la app; la importación no lo pisa).
const HEADERS_BOLSA = ['Fecha de carga', 'Fecha de pago', 'Numero de cheque', 'ID', 'ALYC', 'SGR/Emisor', 'Moneda', 'Monto', 'Condicion', 'Fecha de debito', 'Destino', 'Concepto', 'ID Planilla', 'Importado por', 'Fecha de Importación', 'Importe recibido', 'Origen del recibido'];

const SHEET_COMPROMISOS = 'Compromisos';
// Categoría: Plan de pago, Pago mensual, Tarjeta u Otro. Monto Estimado: el último importe conocido, para los pendientes sin monto.
const HEADERS_COMPROMISOS = [
  'ID', 'Fecha de Vencimiento', 'Categoría', 'Concepto', 'Detalle', 'Cuenta', 'Moneda', 'Monto', 'Monto Estimado',
  'Estado', 'Modo de Pago', 'ID Planilla', 'Cargado por', 'Fecha de Carga'
];

const SHEET_FACTURAS = 'Facturas';
// Pagos: JSON con los pagos vinculados [{tipo: 'mov'|'cheque', id, importe, fecha, desc}]. Pagado: suma aplicada.
const HEADERS_FACTURAS = [
  'ID', 'Fecha', 'Tipo', 'Punto de Venta', 'Número', 'Proveedor', 'CUIT', 'Neto', 'IVA', 'Total', 'Moneda', 'Vencimiento',
  'Estado', 'Pagado', 'Pagos', 'Notas', 'Archivo', 'Origen', 'Cargado por', 'Fecha de Carga', 'Concepto'
];

const SHEET_BANCOS = 'Bancos';
const HEADERS_BANCOS = ['Banco', 'Color'];
const BANCOS_INICIALES = [['BBVA', '#1f4e8c'], ['Bancor', '#1f6b52']];

const SHEET_CUENTAS = 'Cuentas';
const HEADERS_CUENTAS = ['ID', 'Banco', 'Tipo de Cuenta', 'N° de Cuenta', 'CBU', 'Alias', 'Moneda', 'Titular'];
const TIPOS_CUENTA = ['Cuenta corriente', 'Caja de ahorros'];

const SHEET_ALERTAS = 'Alertas';
const HEADERS_ALERTAS = [
  'ID', 'Activa', 'Título', 'Mensaje', 'Frecuencia', 'Fecha', 'Días de la Semana',
  'Día del Mes', 'Hora', 'Días de Anticipación', 'Último Envío', 'Usuario', 'Importe', 'Tipo de Importe'
];
const FRECUENCIAS = ['Una vez', 'Diaria', 'Días hábiles', 'Semanal', 'Mensual', 'Anual'];
const COL_ALERTA_ACTIVA = HEADERS_ALERTAS.indexOf('Activa');
const COL_ALERTA_ULTIMO = HEADERS_ALERTAS.indexOf('Último Envío');
const COL_ALERTA_USUARIO = HEADERS_ALERTAS.indexOf('Usuario');

const SHEET_USUARIOS = 'Usuarios';
const HEADERS_USUARIOS = [
  'ID', 'Usuario', 'Nombre', 'Clave', 'Sal', 'Activo', 'Teléfono WhatsApp',
  'Cheques Días', 'Cheques Hora', 'Creado', 'Último Ingreso'
];

const SHEET_AUDITORIA = 'Auditoría';
const HEADERS_AUDITORIA = ['Fecha y Hora', 'Usuario', 'Acción', 'Detalle', 'Referencia', 'Antes', 'Después'];

const EMPRESA_DEFAULT = 'SAMMARTINO';
const FUNCION_AVISOS = 'revisarAlertas';
const DURACION_SESION = 21600; // 6 horas (máximo de CacheService)
const INTENTOS_MAXIMOS = 5;
const BLOQUEO_SEGUNDOS = 600;

/**
 * Muestra la página al abrir el link /exec.
 * ALLOWALL permite mostrarla dentro de un iframe en el dominio propio
 * (ver docs/index.html y el README).
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Tesorería · Andrés Sammartino')
    .setFaviconUrl('https://bgpsammar.com/logo-as-64.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Login de bgpsammar.com (la página de GitHub Pages, ver docs/index.html).
 * Recibe {accion, datos, token} como texto (text/plain, para que el navegador no
 * haga consulta previa de CORS) y responde JSON. Solo atiende el ingreso, la
 * consulta de sesión, la salida y los datos de Propiedades (estos con sesión); el
 * resto de la app sigue yendo por api().
 */
const ACCIONES_SITIO = ['estado', 'login', 'logout', 'obtenerPropiedades', 'guardarPropiedades'];

function doPost(e) {
  let pedido = {};
  try { pedido = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  const texto = ACCIONES_SITIO.indexOf(String(pedido.accion || '')) >= 0
    ? api(JSON.stringify(pedido))
    : respuesta({ ok: false, error: 'Acción no permitida.' });
  return ContentService.createTextOutput(texto).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Ejecutala una vez desde el editor (Ejecutar ▶) para autorizar los
 * permisos de alertas: activadores y conexión con WhatsApp.
 */
function autorizarPermisos() {
  ScriptApp.getProjectTriggers();
  UrlFetchApp.fetch('https://api.callmebot.com', { muteHttpExceptions: true });
  DriveApp.getRootFolder();
  MailApp.getRemainingDailyQuota();
  Logger.log('Permisos autorizados.');
}

// ======================= Punto de entrada =======================

const ACCIONES_PUBLICAS = {
  estado: estado_,
  login: login_,
  crearPrimerUsuario: crearPrimerUsuario_
};

const ACCIONES = {
  logout: logout_,
  cambiarMiClave: cambiarMiClave_,
  obtenerTransferencias: obtenerTransferencias_,
  guardarTransferencias: guardarTransferenciasConOrdenes_,
  cambiarCondicion: cambiarCondicion_,
  marcarPropia: marcarPropia_,
  obtenerCheques: obtenerCheques_,
  guardarCheques: guardarChequesConOrdenes_,
  obtenerCatalogo: obtenerCatalogo_,
  guardarBanco: guardarBanco_,
  eliminarBanco: eliminarBanco_,
  guardarCuenta: guardarCuenta_,
  eliminarCuenta: eliminarCuenta_,
  obtenerConfig: obtenerConfig_,
  guardarConfig: guardarConfig_,
  activarAvisos: activarAvisos_,
  probarWhatsapp: probarWhatsapp_,
  obtenerAlertas: obtenerAlertas_,
  guardarAlerta: guardarAlerta_,
  eliminarAlerta: eliminarAlerta_,
  probarAlerta: probarAlerta_,
  obtenerAuditoria: obtenerAuditoria_,
  obtenerUsuarios: obtenerUsuarios_,
  guardarUsuario: guardarUsuario_,
  cambiarEstadoUsuario: cambiarEstadoUsuario_,
  restablecerClave: restablecerClave_,
  cambiarCuenta: cambiarCuenta_,
  historialRegistro: historialRegistro_,
  obtenerConciliaciones: obtenerConciliaciones_,
  guardarConciliacion: guardarConciliacion_,
  anularConciliacion: anularConciliacion_,
  subirComprobante: subirComprobante_,
  verComprobante: verComprobante_,
  obtenerSaldos: obtenerSaldos_,
  guardarSaldo: guardarSaldo_,
  obtenerFlujo: obtenerFlujo_,
  guardarSaldos: guardarSaldos_,
  obtenerConciliacion: obtenerConciliacion_,
  importarPlanilla: importarPlanilla_,
  obtenerCompromisos: obtenerCompromisos_,
  guardarCompromiso: guardarCompromiso_,
  eliminarCompromiso: eliminarCompromiso_,
  obtenerFacturas: obtenerFacturas_,
  guardarFacturas: guardarFacturas_,
  actualizarFacturas: actualizarFacturas_,
  eliminarFactura: eliminarFactura_,
  obtenerAccesoFacturas: obtenerAccesoFacturas_,
  guardarAccesoFacturas: guardarAccesoFacturas_,
  normalizarCuentas: normalizarCuentas_,
  obtenerFci: obtenerFci_,
  obtenerBolsa: obtenerBolsa_,
  guardarRecibidoBolsa: guardarRecibidoBolsa_,
  guardarMovimientosFci: guardarMovimientosFci_,
  eliminarMovimientoFci: eliminarMovimientoFci_,
  registrarSalidaCheques: registrarSalidaCheques_,
  obtenerReporteConfig: obtenerReporteConfig_,
  guardarReporteConfig: guardarReporteConfig_,
  enviarReporteAhora: enviarReporteAhora_,
  vistaPreviaReporte: vistaPreviaReporte_,
  pdfDeHtml: pdfDeHtml_,
  obtenerOrdenesPago: obtenerOrdenesPago_,
  configurarOrdenesPago: configurarOrdenesPago_,
  actualizarOrdenPago: actualizarOrdenPago_,
  obtenerPropiedades: obtenerPropiedades_,
  guardarPropiedades: guardarPropiedades_
};

/** json: {token, accion, datos}. Devuelve siempre JSON como texto. */
function api(json) {
  try {
    const pedido = JSON.parse(json || '{}');
    const accion = String(pedido.accion || '');
    const datos = pedido.datos || {};
    if (ACCIONES_PUBLICAS[accion]) return respuesta(ACCIONES_PUBLICAS[accion](datos, pedido.token));
    const fn = ACCIONES[accion];
    if (!fn) return respuesta({ ok: false, error: 'Acción desconocida: ' + accion });
    const usuario = usuarioDeSesion_(pedido.token);
    if (!usuario) return respuesta({ ok: false, sesion: false, error: 'Tu sesión venció. Volvé a ingresar.' });
    return respuesta(fn(datos, usuario));
  } catch (e) {
    return respuesta({ ok: false, error: e.message });
  }
}

function respuesta(obj) {
  return JSON.stringify(obj);
}

/** Ejecuta fn con el lock del script tomado. */
function conLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const res = fn();
    marcarCambioDatos_();
    return res;
  } finally {
    lock.releaseLock();
  }
}

// ======================= Caché de lectura =======================
// Movimientos y cheques son hojas grandes: leerlas y mandarlas enteras a la
// página es lo más lento. Se mandan comprimidas (gzip, la página las
// descomprime) y se guardan en la caché del script hasta que algo cambie:
// toda escritura pasa por conLock_, que cambia la "versión de datos".
// Si alguien edita la hoja a mano, la caché vence sola a los 15 minutos
// (o se fuerza con el botón Actualizar).
const PROP_VERSION_DATOS = 'VERSION_DATOS';
const CACHE_SEGUNDOS = 900;
const CACHE_TROZO = 90000;

function marcarCambioDatos_() {
  try { propiedades_().setProperty(PROP_VERSION_DATOS, String(new Date().getTime())); } catch (e) {}
}

/** Filas de una hoja como {gz: base64 de gzip(JSON {h: títulos, v: valores})}. */
function filasComprimidas_(nombreHoja, headers, forzar) {
  const cache = CacheService.getScriptCache();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombreHoja);
  const ultima = sheet ? sheet.getLastRow() : 0;
  const clave = 'gz_' + nombreHoja + '_' + (propiedades_().getProperty(PROP_VERSION_DATOS) || '0') + '_' + ultima;
  if (!forzar) {
    const n = parseInt(cache.get(clave + '_n') || '0', 10);
    if (n > 0) {
      const claves = [];
      for (let i = 0; i < n; i++) claves.push(clave + '_' + i);
      const partes = cache.getAll(claves);
      if (claves.every(k => partes[k] !== undefined && partes[k] !== null)) {
        return { ok: true, gz: claves.map(k => partes[k]).join(''), cache: true };
      }
    }
  }
  let valores = [];
  if (sheet && ultima > 1) {
    const cols = Math.min(headers.length, sheet.getMaxColumns());
    valores = sheet.getRange(2, 1, ultima - 1, cols).getDisplayValues().map(f => {
      let fin = f.length;
      while (fin > 0 && f[fin - 1] === '') fin--;
      return fin === f.length ? f : f.slice(0, fin);
    });
  }
  const json = JSON.stringify({ h: headers, v: valores });
  const gz = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(json, 'application/json')).getBytes());
  try {
    const trozos = {};
    let n = 0;
    for (let i = 0; i < gz.length; i += CACHE_TROZO) { trozos[clave + '_' + n] = gz.substring(i, i + CACHE_TROZO); n++; }
    trozos[clave + '_n'] = String(n);
    if (n <= 80) cache.putAll(trozos, CACHE_SEGUNDOS);
  } catch (e) {}
  return { ok: true, gz: gz };
}

// ======================= Usuarios y sesiones =======================

// Los usuarios se leen en cada pedido (para validar la sesión): se guardan en la caché
// del script hasta que cambie cualquier dato (la versión de datos la cambia conLock_).
function leerUsuarios_() {
  const cache = CacheService.getScriptCache();
  const clave = 'usr_' + (propiedades_().getProperty(PROP_VERSION_DATOS) || '0');
  const guardado = cache.get(clave);
  if (guardado) { try { return JSON.parse(guardado); } catch (e) {} }
  obtenerHoja_(SHEET_USUARIOS, HEADERS_USUARIOS);
  const lista = leerFilas_(SHEET_USUARIOS, HEADERS_USUARIOS).filter(u => u['ID']);
  try { cache.put(clave, JSON.stringify(lista), 300); } catch (e) {}
  return lista;
}

function usuarioPublico_(u) {
  return {
    id: u['ID'], usuario: u['Usuario'], nombre: u['Nombre'], activo: u['Activo'] === 'Sí',
    telefono: u['Teléfono WhatsApp'], creado: u['Creado'], ultimoIngreso: u['Último Ingreso'],
    facturas: tieneAccesoFacturas_(u)
  };
}

function nombreDe_(u) {
  return u ? (u['Nombre'] || u['Usuario']) + ' (' + u['Usuario'] + ')' : 'Sistema';
}

/** usuario: 3 a 30 caracteres, letras minúsculas, números, punto, guion o guion bajo. */
function usuarioValido_(s) {
  if (s.length < 3 || s.length > 30) return false;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    const ok = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '.' || ch === '-' || ch === '_';
    if (!ok) return false;
  }
  return true;
}

function claveValida_(c) {
  return String(c || '').length >= 8;
}

function hashClave_(clave, sal) {
  let texto = sal + '|' + clave;
  let bytes = null;
  for (let i = 0; i < 300; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
    texto = Utilities.base64Encode(bytes) + sal;
  }
  return Utilities.base64Encode(bytes);
}

function ahoraTexto_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
}

function crearSesion_(u) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('ses_' + token, u['ID'], DURACION_SESION);
  return token;
}

/** Usuario activo de la sesión, o null. Renueva la duración de la sesión. */
function usuarioDeSesion_(token) {
  if (!token) return null;
  const cache = CacheService.getScriptCache();
  const id = cache.get('ses_' + token);
  if (!id) return null;
  const u = leerUsuarios_().find(x => x['ID'] === id && x['Activo'] === 'Sí');
  if (!u) { cache.remove('ses_' + token); return null; }
  cache.put('ses_' + token, id, DURACION_SESION);
  return u;
}

/** Al abrir la página: ¿hay usuarios? ¿la sesión guardada sigue vigente? */
function estado_(d, token) {
  const usuarios = leerUsuarios_();
  const u = usuarioDeSesion_(token);
  return { ok: true, inicializado: usuarios.length > 0, usuario: u ? usuarioPublico_(u) : null, empresa: empresa_() };
}

function login_(d) {
  const nombreUsuario = String(d.usuario || '').trim().toLowerCase();
  const clave = String(d.clave || '');
  const cache = CacheService.getScriptCache();
  const claveIntentos = 'int_' + nombreUsuario;
  const intentos = parseInt(cache.get(claveIntentos) || '0', 10);
  if (intentos >= INTENTOS_MAXIMOS) {
    return { ok: false, error: 'Demasiados intentos fallidos. Esperá 10 minutos y volvé a probar.' };
  }
  const u = leerUsuarios_().find(x => x['Usuario'] === nombreUsuario);
  if (!u || u['Activo'] !== 'Sí' || hashClave_(clave, u['Sal']) !== u['Clave']) {
    cache.put(claveIntentos, String(intentos + 1), BLOQUEO_SEGUNDOS);
    registrar_(null, 'Ingreso fallido', 'Usuario: ' + (nombreUsuario || '(vacío)') + (u && u['Activo'] !== 'Sí' ? ' · usuario desactivado' : ''), '', '', '');
    return { ok: false, error: 'Usuario o contraseña incorrectos.' };
  }
  cache.remove(claveIntentos);
  actualizarCampoUsuario_(u['ID'], 'Último Ingreso', ahoraTexto_());
  try { cache.remove('usr_' + (propiedades_().getProperty(PROP_VERSION_DATOS) || '0')); } catch (e) {}
  registrar_(u, 'Ingreso', 'Inició sesión', '', '', '');
  return { ok: true, token: crearSesion_(u), usuario: usuarioPublico_(u) };
}

function logout_(d, u) {
  if (d.token) CacheService.getScriptCache().remove('ses_' + d.token);
  registrar_(u, 'Salida', 'Cerró la sesión', '', '', '');
  return { ok: true };
}

/**
 * Configuración inicial: crea el primer usuario. Solo funciona mientras no
 * haya ninguno. Le asigna las alertas y el WhatsApp que ya existían.
 */
function crearPrimerUsuario_(d) {
  return conLock_(() => {
    if (leerUsuarios_().length) return { ok: false, error: 'Ya hay usuarios creados. Ingresá con tu usuario.' };
    const u = altaUsuario_(d, null);
    const p = propiedades_();
    const id = u['ID'];
    if (p.getProperty('WA_APIKEY')) p.setProperty('WA_APIKEY_' + id, p.getProperty('WA_APIKEY'));
    if (p.getProperty('WA_TELEFONO')) actualizarCampoUsuario_(id, 'Teléfono WhatsApp', p.getProperty('WA_TELEFONO'));
    if (p.getProperty('CHEQUES_DIAS')) actualizarCampoUsuario_(id, 'Cheques Días', p.getProperty('CHEQUES_DIAS'));
    if (p.getProperty('CHEQUES_HORA')) actualizarCampoUsuario_(id, 'Cheques Hora', p.getProperty('CHEQUES_HORA'));
    const hoja = obtenerHoja_(SHEET_ALERTAS, HEADERS_ALERTAS);
    leerAlertas_().forEach((a, i) => {
      if (a['ID'] && !a['Usuario']) hoja.getRange(i + 2, COL_ALERTA_USUARIO + 1).setNumberFormat('@').setValue(id);
    });
    const actual = leerUsuarios_().find(x => x['ID'] === id);
    registrar_(actual, 'Configuración inicial', 'Creó el primer usuario', id, '', '');
    return { ok: true, token: crearSesion_(actual), usuario: usuarioPublico_(actual) };
  });
}

/** Valida y agrega un usuario. Devuelve la fila como objeto. Se llama con el lock tomado. */
function altaUsuario_(d, autor) {
  const nombreUsuario = String(d.usuario || '').trim().toLowerCase();
  const nombre = String(d.nombre || '').trim();
  const clave = String(d.clave || '');
  if (!nombre) throw new Error('Falta el nombre.');
  if (!usuarioValido_(nombreUsuario)) throw new Error('El usuario va de 3 a 30 caracteres: letras minúsculas, números, punto o guion, sin espacios.');
  if (!claveValida_(clave)) throw new Error('La contraseña tiene que tener al menos 8 caracteres.');
  if (leerUsuarios_().some(x => x['Usuario'] === nombreUsuario)) throw new Error('Ya existe el usuario ' + nombreUsuario + '.');
  const sal = Utilities.getUuid();
  const fila = {
    'ID': Utilities.getUuid(), 'Usuario': nombreUsuario, 'Nombre': nombre, 'Clave': hashClave_(clave, sal), 'Sal': sal,
    'Activo': 'Sí', 'Teléfono WhatsApp': '', 'Cheques Días': '0', 'Cheques Hora': '9', 'Creado': ahoraTexto_(), 'Último Ingreso': ''
  };
  const hoja = obtenerHoja_(SHEET_USUARIOS, HEADERS_USUARIOS);
  hoja.getRange(hoja.getLastRow() + 1, 1, 1, HEADERS_USUARIOS.length).setNumberFormat('@')
    .setValues([HEADERS_USUARIOS.map(h => fila[h])]);
  if (autor) registrar_(autor, 'Alta de usuario', 'Creó el usuario ' + nombreUsuario + ' (' + nombre + ')', fila['ID'], '', '');
  return fila;
}

function actualizarCampoUsuario_(id, campo, valor) {
  const hoja = obtenerHoja_(SHEET_USUARIOS, HEADERS_USUARIOS);
  const fila = buscarFila_(hoja, 0, v => v === id);
  if (!fila) throw new Error('No se encontró el usuario.');
  hoja.getRange(fila, HEADERS_USUARIOS.indexOf(campo) + 1).setNumberFormat('@').setValue(valor);
}

function obtenerUsuarios_(d, u) {
  return { ok: true, usuarios: leerUsuarios_().map(usuarioPublico_), yo: u['ID'] };
}

function guardarUsuario_(d, u) {
  return conLock_(() => {
    const nuevo = altaUsuario_(d, u);
    return { ok: true, id: nuevo['ID'] };
  });
}

function cambiarEstadoUsuario_(d, u) {
  return conLock_(() => {
    const id = String(d.id || '');
    if (id === u['ID']) return { ok: false, error: 'No podés desactivar tu propio usuario.' };
    const otro = leerUsuarios_().find(x => x['ID'] === id);
    if (!otro) return { ok: false, error: 'No se encontró el usuario.' };
    const activo = d.activo ? 'Sí' : 'No';
    if (activo === 'No' && leerUsuarios_().filter(x => x['Activo'] === 'Sí').length <= 1) {
      return { ok: false, error: 'Tiene que quedar al menos un usuario activo.' };
    }
    actualizarCampoUsuario_(id, 'Activo', activo);
    registrar_(u, activo === 'Sí' ? 'Activación de usuario' : 'Desactivación de usuario', 'Usuario ' + otro['Usuario'], id, otro['Activo'], activo);
    return { ok: true };
  });
}

function restablecerClave_(d, u) {
  return conLock_(() => {
    const otro = leerUsuarios_().find(x => x['ID'] === String(d.id || ''));
    if (!otro) return { ok: false, error: 'No se encontró el usuario.' };
    if (!claveValida_(d.clave)) return { ok: false, error: 'La contraseña tiene que tener al menos 8 caracteres.' };
    const sal = Utilities.getUuid();
    actualizarCampoUsuario_(otro['ID'], 'Sal', sal);
    actualizarCampoUsuario_(otro['ID'], 'Clave', hashClave_(String(d.clave), sal));
    registrar_(u, 'Restablecimiento de contraseña', 'Usuario ' + otro['Usuario'], otro['ID'], '', '');
    return { ok: true };
  });
}

function cambiarMiClave_(d, u) {
  return conLock_(() => {
    if (hashClave_(String(d.actual || ''), u['Sal']) !== u['Clave']) return { ok: false, error: 'La contraseña actual no es correcta.' };
    if (!claveValida_(d.nueva)) return { ok: false, error: 'La contraseña nueva tiene que tener al menos 8 caracteres.' };
    const sal = Utilities.getUuid();
    actualizarCampoUsuario_(u['ID'], 'Sal', sal);
    actualizarCampoUsuario_(u['ID'], 'Clave', hashClave_(String(d.nueva), sal));
    registrar_(u, 'Cambio de contraseña', 'Cambió su propia contraseña', u['ID'], '', '');
    return { ok: true };
  });
}

// ======================= Auditoría =======================

function textoCorto_(v) {
  if (v === '' || v == null) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 45000 ? s.substring(0, 45000) + '…' : s;
}

/** Agrega una fila a la hoja Auditoría. antes / despues pueden ser texto u objetos. */
function registrar_(u, accion, detalle, referencia, antes, despues) {
  try {
    const hoja = obtenerHoja_(SHEET_AUDITORIA, HEADERS_AUDITORIA);
    hoja.getRange(hoja.getLastRow() + 1, 1, 1, HEADERS_AUDITORIA.length).setNumberFormat('@')
      .setValues([[ahoraTexto_(), nombreDe_(u), accion, textoCorto_(detalle), textoCorto_(referencia), textoCorto_(antes), textoCorto_(despues)]]);
  } catch (e) {
    console.error('No se pudo registrar en Auditoría: ' + e.message);
  }
}

/**
 * Historial de un movimiento o cheque, para el panel de detalle.
 * d: {tipo: 'mov'|'cheque', id: N° interno o N° de cheque}
 * Busca en la Auditoría las acciones cuya referencia lo nombra: el N°
 * suelto, "movimiento N° x" / "cheque N° x", la clave banco|número o un
 * rango "N° a a b" (altas en lote). Del más nuevo al más viejo.
 */
function historialRegistro_(d) {
  const esCheque = d.tipo === 'cheque';
  const id = String(d.id || '').trim();
  if (!id) return { ok: false, error: 'Falta el registro.' };
  const hoja = obtenerHoja_(SHEET_AUDITORIA, HEADERS_AUDITORIA);
  const ult = hoja.getLastRow();
  if (ult < 2) return { ok: true, registros: [] };
  const filas = hoja.getRange(2, 1, ult - 1, HEADERS_AUDITORIA.length).getDisplayValues();
  const iAcc = HEADERS_AUDITORIA.indexOf('Acción');
  const iRef = HEADERS_AUDITORIA.indexOf('Referencia');
  const n = parseInt(id, 10);
  const coincide = f => {
    const accion = String(f[iAcc] || '').toLowerCase();
    const deCheque = accion.indexOf('cheque') >= 0;
    const ref = String(f[iRef] || '').trim();
    if (!ref) return false;
    const partes = ref.split(',').map(x => x.trim());
    if (esCheque) {
      if (!deCheque && accion.indexOf('archivo de comprobante') < 0) return false;
      return partes.indexOf(id) >= 0 || partes.indexOf('cheque N° ' + id) >= 0 || partes.some(x => x.split('|')[1] === id);
    }
    if (deCheque) return false;
    if (partes.indexOf(id) >= 0 || partes.indexOf('movimiento N° ' + id) >= 0) return true;
    if (ref.indexOf('N° ') === 0 && !isNaN(n)) {
      const r = ref.substring(3).split(' a ');
      const a = parseInt(r[0], 10);
      const b = r.length > 1 ? parseInt(r[1], 10) : a;
      return !isNaN(a) && !isNaN(b) && n >= a && n <= b;
    }
    return false;
  };
  const registros = [];
  for (let i = filas.length - 1; i >= 0 && registros.length < 60; i--) {
    if (!coincide(filas[i])) continue;
    const o = {};
    HEADERS_AUDITORIA.forEach((h, k) => { o[h] = filas[i][k]; });
    registros.push(o);
  }
  return { ok: true, registros: registros };
}

/** Últimos registros, del más nuevo al más viejo. */
function obtenerAuditoria_(d) {
  const limite = Math.min(parseInt(d.limite, 10) || 2000, 5000);
  const hoja = obtenerHoja_(SHEET_AUDITORIA, HEADERS_AUDITORIA);
  const ultima = hoja.getLastRow();
  if (ultima < 2) return { ok: true, registros: [] };
  const desde = Math.max(2, ultima - limite + 1);
  const filas = hoja.getRange(desde, 1, ultima - desde + 1, HEADERS_AUDITORIA.length).getDisplayValues();
  const registros = filas.reverse().map(f => {
    const o = {};
    HEADERS_AUDITORIA.forEach((h, i) => { o[h] = f[i]; });
    return o;
  });
  return { ok: true, registros: registros, total: ultima - 1 };
}

// ======================= Transferencias =======================

function obtenerTransferencias_(d) {
  if (d && d.formato === 'gz') return filasComprimidas_(SHEET_TRANSFERENCIAS, HEADERS_TRANSFERENCIAS, !!d.forzar);
  return { ok: true, filas: leerFilas_(SHEET_TRANSFERENCIAS, HEADERS_TRANSFERENCIAS) };
}

function filaComoObjeto_(headers, fila) {
  const o = {};
  headers.forEach((h, i) => { if (fila[i] !== '' && fila[i] != null) o[h] = fila[i]; });
  return o;
}

/**
 * d.filas: [[...], ...] en el orden de HEADERS_TRANSFERENCIAS. Asigna el
 * N° Interno correlativo, la fecha de carga y quién cargó. No repite un
 * mismo banco + N° de referencia. Agrega bancos y cuentas que falten.
 */
function guardarTransferencias_(d, u) {
  return conLock_(() => {
    const filas = d.filas || [];
    const H = HEADERS_TRANSFERENCIAS;
    const claves = [COL_BANCO_TRANS, COL_REFERENCIA];
    const sheet = obtenerHoja_(SHEET_TRANSFERENCIAS, H);
    const lastRow = sheet.getLastRow();
    const existentes = new Set();
    let ultimoInterno = 0;
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, H.length).getDisplayValues().forEach(f => {
        const n = parseInt(f[COL_INTERNO], 10);
        if (!isNaN(n) && n > ultimoInterno) ultimoInterno = n;
        const clave = claveDe_(f, claves);
        if (clave) existentes.add(clave);
      });
    }

    const hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
    const nuevas = [];
    const duplicadas = [];
    const numeros = [];
    filas.forEach(r => {
      const fila = H.map((_, i) => r[i] == null ? '' : String(r[i]).trim());
      const clave = claveDe_(fila, claves);
      if (clave && existentes.has(clave)) {
        duplicadas.push(fila[COL_REFERENCIA]);
        numeros.push('');
        return;
      }
      if (clave) existentes.add(clave);
      ultimoInterno++;
      fila[COL_INTERNO] = String(ultimoInterno);
      fila[COL_FECHA_CARGA] = hoy;
      if (fila[COL_MONEDA] !== 'USD') fila[COL_MONEDA] = 'Pesos';
      if (fila[COL_CONDICION] !== 'Ingreso' && fila[COL_CONDICION] !== 'Egreso') {
        fila[COL_CONDICION] = fila[COL_MONTO].charAt(0) === '-' ? 'Egreso' : 'Ingreso';
      }
      fila[COL_MONTO] = montoConSigno(fila[COL_MONTO], fila[COL_CONDICION]);
      if (!fila[COL_ORIGEN]) fila[COL_ORIGEN] = 'Comprobante';
      fila[COL_PROPIA] = fila[COL_PROPIA] === 'Sí' ? 'Sí' : 'No';
      fila[COL_CARGADO_TRANS] = nombreDe_(u);
      nuevas.push(fila);
      numeros.push(String(ultimoInterno));
    });
    ULTIMOS_MOVS_GUARDADOS_ = nuevas.map(f => filaComoObjeto_(H, f));

    if (nuevas.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, nuevas.length, H.length).setNumberFormat('@').setValues(nuevas);
    }
    const nuevos = asegurarCatalogo_(nuevas.map(f => ({
      banco: f[COL_BANCO_TRANS], tipo: f[COL_TIPO_CUENTA], numero: f[COL_NUMERO_CUENTA], moneda: f[COL_MONEDA]
    })), u);

    if (nuevas.length || duplicadas.length) {
      const archivos = [];
      nuevas.forEach(f => { if (f[COL_ARCHIVO] && archivos.indexOf(f[COL_ARCHIVO]) < 0) archivos.push(f[COL_ARCHIVO]); });
      const origenes = [];
      nuevas.forEach(f => { if (origenes.indexOf(f[COL_ORIGEN]) < 0) origenes.push(f[COL_ORIGEN]); });
      const rango = nuevas.length ? 'N° ' + nuevas[0][COL_INTERNO] + (nuevas.length > 1 ? ' a ' + nuevas[nuevas.length - 1][COL_INTERNO] : '') : '';
      registrar_(u, 'Alta de movimientos',
        nuevas.length + ' movimiento(s) guardado(s)' + (origenes.length ? ' · origen: ' + origenes.join(', ') : '') +
        (archivos.length ? ' · archivo(s): ' + archivos.join(', ') : '') +
        (duplicadas.length ? ' · ' + duplicadas.length + ' descartado(s) por repetidos' : ''),
        rango, '', nuevas.map(f => filaComoObjeto_(H, f)));
    }
    return { ok: true, agregadas: nuevas.length, duplicadas: duplicadas, numeros: numeros, nuevos: nuevos };
  });
}

function movimientoPorInterno_(interno) {
  const sheet = obtenerHoja_(SHEET_TRANSFERENCIAS, HEADERS_TRANSFERENCIAS);
  const fila = buscarFila_(sheet, COL_INTERNO, v => v === interno);
  if (!interno || !fila) throw new Error('No se encontró el movimiento N° ' + interno + '.');
  return { sheet: sheet, fila: fila };
}

/** Pasa un movimiento guardado de Ingreso a Egreso (o al revés). d: {interno, condicion} */
function cambiarCondicion_(d, u) {
  return conLock_(() => {
    const interno = String(d.interno || '').trim();
    const condicion = String(d.condicion || '');
    if (condicion !== 'Ingreso' && condicion !== 'Egreso') return { ok: false, error: 'Condición inválida.' };
    const m = movimientoPorInterno_(interno);
    const condicionAntes = m.sheet.getRange(m.fila, COL_CONDICION + 1).getDisplayValue();
    const montoActual = m.sheet.getRange(m.fila, COL_MONTO + 1).getDisplayValue();
    const monto = montoConSigno(montoActual, condicion);
    m.sheet.getRange(m.fila, COL_MONTO + 1).setNumberFormat('@').setValue(monto);
    m.sheet.getRange(m.fila, COL_CONDICION + 1).setValue(condicion);
    registrar_(u, 'Cambio de condición', 'Movimiento N° ' + interno, interno,
      { 'Condición': condicionAntes, 'Monto': montoActual }, { 'Condición': condicion, 'Monto': monto });
    return { ok: true, monto: monto };
  });
}

/**
 * Cambia la cuenta asignada a uno o varios movimientos o cheques.
 * d: {tipo: 'mov'|'cheque', ids: [N° interno | clave banco|número], cuentaId}
 * No toca registros conciliados (primero hay que anular la conciliación) y
 * no deja que el cambio de banco genere un duplicado.
 */
function cambiarCuenta_(d, u) {
  return conLock_(() => {
    const esCheque = d.tipo === 'cheque';
    const ids = (d.ids || []).map(String);
    if (!ids.length) return { ok: false, error: 'No hay registros seleccionados.' };
    // Cheques de terceros: no llevan banco ni cuenta propia (d.sinBanco los deja en blanco).
    const sinBanco = esCheque && !!d.sinBanco;
    const cuenta = sinBanco ? { 'Banco': '', 'Tipo de Cuenta': '', 'N° de Cuenta': '' }
      : leerFilas_(SHEET_CUENTAS, HEADERS_CUENTAS).find(c => c['ID'] === String(d.cuentaId || ''));
    if (!cuenta) return { ok: false, error: 'Elegí una cuenta del listado.' };

    const H = esCheque ? HEADERS_CHEQUES : HEADERS_TRANSFERENCIAS;
    const hoja = obtenerHoja_(esCheque ? SHEET_CHEQUES : SHEET_TRANSFERENCIAS, H);
    const ult = hoja.getLastRow();
    if (ult < 2) return { ok: false, error: 'No hay registros guardados.' };
    const filas = hoja.getRange(2, 1, ult - 1, H.length).getDisplayValues();
    const iBanco = H.indexOf('Banco'), iTipo = H.indexOf('Tipo de Cuenta'), iNum = H.indexOf('N° de Cuenta'), iConc = H.indexOf('Conciliación');
    const iClave = esCheque ? COL_NUMERO_CHEQUE : COL_REFERENCIA;
    const iIdPl = H.indexOf('ID Planilla');
    const idDe = f => esCheque ? (String(f[iIdPl] || '').trim() ? 'P:' + String(f[iIdPl]).trim() : claveCheque_(f[iBanco], f[COL_NUMERO_CHEQUE])) : String(f[COL_INTERNO]).trim();
    const nombreDe = f => esCheque ? 'cheque N° ' + f[COL_NUMERO_CHEQUE] : 'movimiento N° ' + f[COL_INTERNO];

    const elegidas = [];
    const conciliados = [];
    filas.forEach((f, i) => {
      if (ids.indexOf(idDe(f)) < 0) return;
      if (String(f[iConc] || '').trim()) conciliados.push(nombreDe(f) + ' (' + f[iConc] + ')');
      else elegidas.push(i);
    });
    if (conciliados.length) {
      return { ok: false, error: 'Estos registros están conciliados y no se pueden mover: ' + conciliados.join(', ') + '. Anulá la conciliación primero.' };
    }
    if (!elegidas.length) return { ok: false, error: 'No se encontraron los registros. Tocá Actualizar y volvé a intentar.' };
    if (esCheque) {
      const iTipoCh = H.indexOf('Tipo');
      const terceros = elegidas.filter(i => filas[i][iTipoCh] === 'De terceros');
      if (sinBanco && terceros.length < elegidas.length) return { ok: false, error: 'Solo a los cheques de terceros se les quita el banco; los emitidos lo llevan.' };
      if (!sinBanco && terceros.length) return { ok: false, error: 'Los cheques de terceros no llevan banco ni cuenta propia. Seleccioná solo cheques emitidos.' };
    }

    // Duplicados: banco + N° de referencia (movimientos) o banco + N° de cheque.
    const ocupadas = new Set();
    filas.forEach((f, i) => {
      if (elegidas.indexOf(i) >= 0) return;
      const ref = String(f[iClave] || '').trim();
      if (ref) ocupadas.add(claveTexto(f[iBanco]) + '|' + ref);
    });
    const repetidos = [];
    if (!sinBanco) elegidas.forEach(i => {
      const ref = String(filas[i][iClave] || '').trim();
      if (!ref) return;
      const k = claveTexto(cuenta['Banco']) + '|' + ref;
      if (ocupadas.has(k)) repetidos.push(nombreDe(filas[i]));
      ocupadas.add(k);
    });
    if (repetidos.length) {
      return { ok: false, error: 'En ' + cuenta['Banco'] + ' ya existe un registro con el mismo número que: ' + repetidos.join(', ') + '.' };
    }

    const nuevo = { 'Banco': cuenta['Banco'], 'Tipo de Cuenta': cuenta['Tipo de Cuenta'], 'N° de Cuenta': cuenta['N° de Cuenta'] };
    const antes = [];
    elegidas.forEach(i => {
      const f = filas[i];
      if (f[iBanco] === nuevo['Banco'] && f[iTipo] === nuevo['Tipo de Cuenta'] && f[iNum] === nuevo['N° de Cuenta']) return;
      antes.push({ 'Registro': nombreDe(f), 'Banco': f[iBanco], 'Tipo de Cuenta': f[iTipo], 'N° de Cuenta': f[iNum] });
      hoja.getRange(i + 2, iBanco + 1).setNumberFormat('@').setValue(nuevo['Banco']);
      hoja.getRange(i + 2, iTipo + 1).setNumberFormat('@').setValue(nuevo['Tipo de Cuenta']);
      hoja.getRange(i + 2, iNum + 1).setNumberFormat('@').setValue(nuevo['N° de Cuenta']);
    });
    if (antes.length) {
      registrar_(u, sinBanco ? 'Cheques de terceros sin banco' : esCheque ? 'Cambio de cuenta de cheques' : 'Cambio de cuenta de movimientos',
        sinBanco ? antes.length + ' cheque(s) de terceros quedaron sin banco ni cuenta'
          : antes.length + ' registro(s) pasado(s) a ' + nuevo['Banco'] + ' · ' + nuevo['Tipo de Cuenta'] + ' ' + nuevo['N° de Cuenta'],
        antes.map(a => a['Registro']).join(', '), antes, nuevo);
    }
    return { ok: true, cambiados: antes.length, sinCambios: elegidas.length - antes.length };
  });
}

/** Marca o desmarca un movimiento como "entre cuentas propias". d: {interno, propia} */
function marcarPropia_(d, u) {
  return conLock_(() => {
    const interno = String(d.interno || '').trim();
    const m = movimientoPorInterno_(interno);
    const antes = m.sheet.getRange(m.fila, COL_PROPIA + 1).getDisplayValue() || 'No';
    const valor = d.propia ? 'Sí' : 'No';
    m.sheet.getRange(m.fila, COL_PROPIA + 1).setValue(valor);
    registrar_(u, 'Cambio de cuentas propias', 'Movimiento N° ' + interno, interno,
      { 'Entre Cuentas Propias': antes }, { 'Entre Cuentas Propias': valor });
    return { ok: true, propia: valor };
  });
}

/** Egreso lleva "-" adelante; Ingreso, nunca. */
function montoConSigno(monto, condicion) {
  let m = String(monto || '').trim();
  while (m.charAt(0) === '-' || m.charAt(0) === '+') m = m.substring(1).trim();
  if (!m) return '';
  return condicion === 'Egreso' ? '-' + m : m;
}

// ======================= Cheques =======================

function obtenerCheques_(d) {
  if (d && d.formato === 'gz') return filasComprimidas_(SHEET_CHEQUES, HEADERS_CHEQUES, !!d.forzar);
  return { ok: true, filas: leerFilas_(SHEET_CHEQUES, HEADERS_CHEQUES) };
}

/** d.rows: filas en el orden de HEADERS_CHEQUES. */
function guardarCheques_(d, u) {
  return conLock_(() => {
    const iTipo = HEADERS_CHEQUES.indexOf('Tipo de Cuenta');
    const iNumero = HEADERS_CHEQUES.indexOf('N° de Cuenta');
    const iTipoCh = HEADERS_CHEQUES.indexOf('Tipo');
    const iCuit = HEADERS_CHEQUES.indexOf('CUIT');
    const iImporte = HEADERS_CHEQUES.indexOf('Importe');
    // Cheques de terceros: sin banco ni cuenta propia (solo los emitidos los llevan).
    const rows = (d.rows || []).map(r => {
      const f = HEADERS_CHEQUES.map((_, i) => r[i] == null ? '' : String(r[i]));
      f[COL_CARGADO_CHEQUE] = nombreDe_(u);
      if (f[iTipoCh] === 'De terceros') { f[COL_BANCO_CHEQUE] = ''; f[iTipo] = ''; f[iNumero] = ''; }
      return f;
    });
    // Repetidos de terceros: mismo N° de cheque y mismo CUIT del librador (o mismo importe si no hay CUIT).
    const claveTercero = f => {
      const num = String(f[COL_NUMERO_CHEQUE] || '').trim();
      if (!num) return '';
      const cuit = soloDigitos(f[iCuit]);
      return num + '|' + (cuit || importeANumero(f[iImporte]));
    };
    const vistos = new Set(leerFilas_(SHEET_CHEQUES, HEADERS_CHEQUES).filter(c => c['Tipo'] === 'De terceros')
      .map(c => claveTercero(HEADERS_CHEQUES.map(h => c[h]))).filter(Boolean));
    const repetidosTerceros = [];
    const aGuardar = rows.filter(f => {
      if (f[iTipoCh] !== 'De terceros') return true;
      const k = claveTercero(f);
      if (k && vistos.has(k)) { repetidosTerceros.push(f[0] + ' (cheque de terceros N° ' + f[COL_NUMERO_CHEQUE] + ')'); return false; }
      if (k) vistos.add(k);
      return true;
    });
    const res = guardarFilas_(aGuardar, SHEET_CHEQUES, HEADERS_CHEQUES, [COL_BANCO_CHEQUE, COL_NUMERO_CHEQUE]);
    res.duplicadas = repetidosTerceros.concat(res.duplicadas);
    ULTIMOS_CHEQUES_GUARDADOS_ = (res.guardadas || []).map(f => filaComoObjeto_(HEADERS_CHEQUES, f));
    res.nuevos = asegurarCatalogo_(aGuardar.filter(r => r[COL_BANCO_CHEQUE]).map(r => ({ banco: r[COL_BANCO_CHEQUE], tipo: r[iTipo], numero: r[iNumero], moneda: 'ARS' })), u);
    if (res.agregadas || res.duplicadas.length) {
      registrar_(u, 'Alta de cheques',
        res.agregadas + ' cheque(s) guardado(s)' + (res.duplicadas.length ? ' · ' + res.duplicadas.length + ' descartado(s) por repetidos' : ''),
        res.guardadas.map(f => f[COL_NUMERO_CHEQUE]).join(', '), '', res.guardadas.map(f => filaComoObjeto_(HEADERS_CHEQUES, f)));
    }
    delete res.guardadas;
    res.ok = true;
    return res;
  });
}

// ======================= Salida de cheques =======================
// La página lee la foto con la numeración de los cheques que salieron (o los
// números escritos) y el usuario elige la fecha del pago. Los cheques cargados
// con esos números pasan a "Pagado" y la fecha queda como fecha de débito.
// Las imágenes pueden quedar como comprobante de cada cheque que no tenía uno:
// a cada cheque se le vincula la imagen donde apareció su número.
const CARPETA_SALIDA_CHEQUES = 'Salida de cheques';

/**
 * d: {fecha: dd/mm/aaaa, cheques: [{numero, banco, importe, id, archivo: índice en archivos | -1}],
 *     archivos: [{base64, nombre, mime}]}.
 * Cada cheque se busca por N° (sin ceros a la izquierda), banco, importe e ID de la planilla.
 */
function registrarSalidaCheques_(d, u) {
  const fecha = String(d.fecha || '').trim();
  const p = fecha.split('/');
  if (p.length !== 3 || p[2].length !== 4) return { ok: false, error: 'Elegí la fecha del pago.' };
  const pedidos = (d.cheques || []).filter(c => c && soloDigitos(c.numero));
  if (!pedidos.length) return { ok: false, error: 'No hay cheques marcados.' };

  const archivos = (d.archivos || []).filter(a => a && a.base64);
  const blobs = archivos.map(a => ({ a: a, bytes: Utilities.base64Decode(String(a.base64)) }));
  if (blobs.some(b => b.bytes.length > MAX_BYTES_COMPROBANTE)) return { ok: false, error: 'Una de las imágenes supera los 25 MB.' };
  const archivoIds = [];
  if (blobs.length) {
    const carpeta = subcarpeta_(carpetaRaiz_(), CARPETA_SALIDA_CHEQUES);
    blobs.forEach(b => {
      const nombre = nombreLibre_(carpeta, nombreSeguro_(p[2] + '-' + p[1] + '-' + p[0] + ' - ' + (b.a.nombre || 'salida de cheques')));
      const archivo = carpeta.createFile(Utilities.newBlob(b.bytes, String(b.a.mime || 'application/octet-stream'), nombre));
      archivo.setDescription('Salida de cheques del ' + fecha + ' · cargado por ' + nombreDe_(u) + ' el ' + ahoraTexto_());
      archivoIds.push(archivo.getId());
    });
  }

  return conLock_(() => {
    const H = HEADERS_CHEQUES;
    const hoja = obtenerHoja_(SHEET_CHEQUES, H);
    const ult = hoja.getLastRow();
    if (ult < 2) return { ok: false, error: 'No hay cheques cargados.' };
    const filas = hoja.getRange(2, 1, ult - 1, H.length).getDisplayValues();
    const iEstado = H.indexOf('Estado'), iDeb = H.indexOf('Fecha de Débito'), iImp = H.indexOf('Importe'), iId = H.indexOf('ID Planilla');
    const usadas = {};
    const cambiados = [], noEncontrados = [];
    pedidos.forEach(c => {
      const num = sinCerosIzq_(soloDigitos(c.numero));
      const imp = Math.abs(importeANumero(c.importe));
      const idx = filas.findIndex((f, i) => !usadas[i] &&
        sinCerosIzq_(soloDigitos(f[COL_NUMERO_CHEQUE])) === num &&
        claveTexto(f[COL_BANCO_CHEQUE]) === claveTexto(c.banco) &&
        String(f[iId] || '').trim() === String(c.id || '').trim() &&
        Math.abs(Math.abs(importeANumero(f[iImp])) - imp) < 0.01);
      if (idx < 0) { noEncontrados.push(String(c.numero)); return; }
      usadas[idx] = true;
      const f = filas[idx];
      const antes = { 'Estado': f[iEstado], 'Fecha de Débito': f[iDeb] };
      hoja.getRange(idx + 2, iEstado + 1).setNumberFormat('@').setValue('Pagado');
      hoja.getRange(idx + 2, iDeb + 1).setNumberFormat('@').setValue(fecha);
      const archivoId = archivoIds[parseInt(c.archivo, 10)] || '';
      if (archivoId && !String(f[COL_COMPROBANTE_CHEQUE] || '').trim()) hoja.getRange(idx + 2, COL_COMPROBANTE_CHEQUE + 1).setNumberFormat('@').setValue(archivoId);
      cambiados.push({ 'Cheque': f[COL_NUMERO_CHEQUE], 'Tipo': f[H.indexOf('Tipo')], 'Importe': f[iImp], 'Antes': antes, 'Después': { 'Estado': 'Pagado', 'Fecha de Débito': fecha } });
    });
    if (!cambiados.length) return { ok: false, error: 'No se encontró ningún cheque. Actualizá la lista y volvé a intentar.' };
    registrar_(u, 'Salida de cheques', cambiados.length + ' cheque(s) pagado(s) el ' + fecha + (noEncontrados.length ? ' · ' + noEncontrados.length + ' sin encontrar' : '') + (archivoIds.length ? ' · ' + archivoIds.length + ' imagen(es)' : ''),
      cambiados.map(c => c['Cheque']).join(', '), '', textoCorto_(cambiados));
    return { ok: true, pagados: cambiados.length, noEncontrados: noEncontrados, archivos: archivoIds };
  });
}

// ======================= Conciliación bancaria =======================
// Una conciliación cruza, para una cuenta y un período, los movimientos del
// resumen del banco (Origen = Resumen) con los registros propios
// (comprobantes, cargas manuales y cheques). Al guardarla, cada movimiento
// y cheque conciliado queda marcado con el ID en la columna "Conciliación",
// así no vuelve a aparecer como pendiente. Anularla borra esas marcas.

function obtenerConciliaciones_() {
  obtenerHoja_(SHEET_CONCILIACIONES, HEADERS_CONCILIACIONES);
  const lista = leerFilas_(SHEET_CONCILIACIONES, HEADERS_CONCILIACIONES).filter(c => c['ID']).map(c => {
    const o = Object.assign({}, c);
    delete o['Detalle'];
    return o;
  });
  return { ok: true, conciliaciones: lista.reverse() };
}

/** Clave de un cheque: banco + N° de cheque (la misma que evita duplicados). */
function claveCheque_(banco, numero) {
  return claveTexto(banco) + '|' + String(numero || '').trim();
}

/**
 * d: {banco, cuentaId, cuentaNumero, desde, hasta, saldoBanco, saldoLibros,
 *     pares: [{banco: N° interno | '', libro: {tipo: 'mov'|'cheque', id}, modo}],
 *     resumen: {...totales para el registro}}
 */
function guardarConciliacion_(d, u) {
  return conLock_(() => {
    const pares = d.pares || [];
    if (!pares.length) return { ok: false, error: 'No hay partidas conciliadas para guardar.' };
    const id = 'CONC-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');

    const hojaMov = obtenerHoja_(SHEET_TRANSFERENCIAS, HEADERS_TRANSFERENCIAS);
    const ultMov = hojaMov.getLastRow();
    const internos = ultMov > 1 ? hojaMov.getRange(2, COL_INTERNO + 1, ultMov - 1, 1).getDisplayValues().map(f => String(f[0]).trim()) : [];
    const marcasMov = ultMov > 1 ? hojaMov.getRange(2, COL_CONC_TRANS + 1, ultMov - 1, 1).getDisplayValues().map(f => String(f[0]).trim()) : [];

    const hojaCh = obtenerHoja_(SHEET_CHEQUES, HEADERS_CHEQUES);
    const ultCh = hojaCh.getLastRow();
    const filasCh = ultCh > 1 ? hojaCh.getRange(2, 1, ultCh - 1, HEADERS_CHEQUES.length).getDisplayValues() : [];
    const clavesCh = filasCh.map(f => claveCheque_(f[COL_BANCO_CHEQUE], f[COL_NUMERO_CHEQUE]));

    const filasMov = [];
    const filasCheque = [];
    const ocupadas = [];
    const marcar = (lista, idx, nombre) => {
      if (idx < 0) throw new Error('No se encontró ' + nombre + '. Actualizá la conciliación y volvé a intentar.');
      if (lista === 'mov' ? marcasMov[idx] : filasCh[idx][COL_CONC_CHEQUE]) ocupadas.push(nombre);
      if (lista === 'mov') { if (filasMov.indexOf(idx) < 0) filasMov.push(idx); }
      else if (filasCheque.indexOf(idx) < 0) filasCheque.push(idx);
    };
    pares.forEach(p => {
      // "ARCH-…": movimiento de un extracto leído desde archivo, que no está guardado en la hoja.
      if (p.banco && String(p.banco).indexOf('ARCH-') !== 0) marcar('mov', internos.indexOf(String(p.banco)), 'el movimiento N° ' + p.banco);
      if (p.libro && p.libro.tipo === 'mov') marcar('mov', internos.indexOf(String(p.libro.id)), 'el movimiento N° ' + p.libro.id);
      if (p.libro && p.libro.tipo === 'cheque') marcar('cheque', clavesCh.indexOf(String(p.libro.id)), 'el cheque ' + String(p.libro.id).split('|')[1]);
    });
    if (ocupadas.length) return { ok: false, error: 'Ya estaban conciliados en otra conciliación: ' + ocupadas.join(', ') + '. Actualizá y volvé a intentar.' };

    filasMov.forEach(i => hojaMov.getRange(i + 2, COL_CONC_TRANS + 1).setNumberFormat('@').setValue(id));
    filasCheque.forEach(i => hojaCh.getRange(i + 2, COL_CONC_CHEQUE + 1).setNumberFormat('@').setValue(id));

    const r = d.resumen || {};
    const hoja = obtenerHoja_(SHEET_CONCILIACIONES, HEADERS_CONCILIACIONES);
    const fila = {
      'ID': id, 'Fecha': ahoraTexto_(), 'Usuario': nombreDe_(u), 'Banco': String(d.banco || ''),
      'N° de Cuenta': String(d.cuentaNumero || ''), 'Desde': String(d.desde || ''), 'Hasta': String(d.hasta || ''),
      'Saldo según Banco': String(d.saldoBanco || ''), 'Saldo según Libros': String(d.saldoLibros || ''),
      'Conciliados': String(pares.length), 'Pendientes en Banco': String(r.pendientesBanco || 0),
      'Pendientes en Libros': String(r.pendientesLibros || 0), 'Estado': 'Vigente',
      'Detalle': textoCorto_({ pares: pares, resumen: r }),
      'Extracto': (d.extracto || []).map(String).join(',').substring(0, 49000)
    };
    hoja.getRange(hoja.getLastRow() + 1, 1, 1, HEADERS_CONCILIACIONES.length).setNumberFormat('@')
      .setValues([HEADERS_CONCILIACIONES.map(h => fila[h])]);
    registrar_(u, 'Conciliación bancaria',
      fila['Banco'] + ' · ' + fila['N° de Cuenta'] + ' · ' + fila['Desde'] + ' al ' + fila['Hasta'] + ' · ' + pares.length +
      ' partida(s) conciliada(s), ' + fila['Pendientes en Banco'] + ' pendiente(s) en banco y ' + fila['Pendientes en Libros'] + ' en libros',
      id, '', r);
    return { ok: true, id: id };
  });
}

/** Una conciliación guardada con su detalle, para el reporte. d: {id} */
function obtenerConciliacion_(d) {
  const c = leerFilas_(SHEET_CONCILIACIONES, HEADERS_CONCILIACIONES).find(x => x['ID'] === String(d.id || ''));
  if (!c) return { ok: false, error: 'No se encontró la conciliación.' };
  let detalle = {};
  try { detalle = JSON.parse(c['Detalle'] || '{}'); } catch (e) {}
  return { ok: true, conciliacion: c, detalle: detalle };
}

/** Anula una conciliación: libera los movimientos y cheques que había marcado. d: {id} */
function anularConciliacion_(d, u) {
  return conLock_(() => {
    const id = String(d.id || '');
    const hoja = obtenerHoja_(SHEET_CONCILIACIONES, HEADERS_CONCILIACIONES);
    const fila = buscarFila_(hoja, 0, v => v === id);
    if (!id || !fila) return { ok: false, error: 'No se encontró la conciliación.' };
    const colEstado = HEADERS_CONCILIACIONES.indexOf('Estado') + 1;
    if (hoja.getRange(fila, colEstado).getDisplayValue() === 'Anulada') return { ok: false, error: 'Esa conciliación ya estaba anulada.' };
    let liberados = 0;
    [[SHEET_TRANSFERENCIAS, HEADERS_TRANSFERENCIAS, COL_CONC_TRANS], [SHEET_CHEQUES, HEADERS_CHEQUES, COL_CONC_CHEQUE]].forEach(t => {
      const h = obtenerHoja_(t[0], t[1]);
      const ult = h.getLastRow();
      if (ult < 2) return;
      const rango = h.getRange(2, t[2] + 1, ult - 1, 1);
      const vals = rango.getDisplayValues();
      let cambio = false;
      vals.forEach(v => { if (String(v[0]).trim() === id) { v[0] = ''; liberados++; cambio = true; } });
      if (cambio) rango.setNumberFormat('@').setValues(vals);
    });
    hoja.getRange(fila, colEstado).setValue('Anulada');
    registrar_(u, 'Anulación de conciliación', id + ' · ' + liberados + ' registro(s) liberado(s)', id, 'Vigente', 'Anulada');
    return { ok: true, liberados: liberados };
  });
}

// ======================= Comprobantes en Drive =======================
// Estructura: "Tesorería · Comprobantes" / <Nombre de la contraparte> / archivos.
// Los resúmenes van a "Tesorería · Comprobantes" / "Resúmenes de cuenta" / <Banco>.
// Las carpetas se buscan sin distinguir mayúsculas, tildes ni espacios de
// más, así "SENN ROCIO" y "Senn Rocío" caen en la misma carpeta.

const CARPETA_RAIZ_NOMBRE = 'Tesorería · Comprobantes';
const CARPETA_RESUMENES = 'Resúmenes de cuenta';
const MAX_BYTES_COMPROBANTE = 25 * 1024 * 1024;

function carpetaRaiz_() {
  const p = propiedades_();
  const id = p.getProperty('CARPETA_COMPROBANTES');
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (e) {}
  }
  const nueva = DriveApp.createFolder(CARPETA_RAIZ_NOMBRE);
  p.setProperty('CARPETA_COMPROBANTES', nueva.getId());
  return nueva;
}

/** Nombre prolijo para carpetas y archivos: sin barras ni espacios de más. */
function nombreSeguro_(s) {
  let r = '';
  const prohibidos = '/:*?"<>|' + String.fromCharCode(92);
  String(s || '').split('').forEach(ch => { r += prohibidos.indexOf(ch) >= 0 ? '-' : ch; });
  return r.split(' ').filter(Boolean).join(' ').trim().substring(0, 120);
}

function claveCarpeta_(s) {
  return claveTexto(nombreSeguro_(s)).split('.').join('').split(',').join('');
}

/** Subcarpeta con ese nombre (comparando sin mayúsculas ni tildes), o la crea. */
// Recorrer todas las carpetas de Drive es lento (una llamada por carpeta): el ID de
// cada carpeta ya encontrada se guarda en caché por 6 horas.
function claveCacheCarpeta_(padreId, clave) {
  return 'carp_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, padreId + '|' + clave));
}

function subcarpeta_(padre, nombre) {
  const buscado = claveCarpeta_(nombre);
  const padreId = padre.getId();
  let cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) {}
  const kBuscada = claveCacheCarpeta_(padreId, buscado);
  if (cache) {
    const id = cache.get(kBuscada);
    if (id) {
      try {
        const f = DriveApp.getFolderById(id);
        if (!f.isTrashed()) return f;
      } catch (e) {}
      cache.remove(kBuscada);
    }
  }
  const vistas = {};
  let hallada = null;
  const it = padre.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    const k = claveCarpeta_(f.getName());
    if (!vistas[claveCacheCarpeta_(padreId, k)]) vistas[claveCacheCarpeta_(padreId, k)] = f.getId();
    if (k === buscado) { hallada = f; break; }
  }
  if (!hallada) {
    hallada = padre.createFolder(nombreSeguro_(nombre));
    vistas[kBuscada] = hallada.getId();
  }
  if (cache) { try { cache.putAll(vistas, 21600); } catch (e) {} }
  return hallada;
}

/** Si ya existe un archivo con ese nombre en la carpeta, agrega " (2)", " (3)"… */
function nombreLibre_(carpeta, nombre) {
  const punto = nombre.lastIndexOf('.');
  const base = punto > 0 ? nombre.substring(0, punto) : nombre;
  const ext = punto > 0 ? nombre.substring(punto) : '';
  let candidato = nombre;
  let n = 2;
  while (carpeta.getFilesByName(candidato).hasNext()) {
    candidato = base + ' (' + n + ')' + ext;
    n++;
  }
  return candidato;
}

/**
 * d: {tipo: 'mov'|'cheque'|'resumen', internos: [N° interno], cheque: clave banco|número,
 *     carpeta, banco, nombre, base64, mime}
 * Guarda el archivo y deja su ID en la columna "Comprobante" de las filas.
 */
function subirComprobante_(d, u) {
  const base64 = String(d.base64 || '');
  if (!base64) return { ok: false, error: 'No llegó el archivo.' };
  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > MAX_BYTES_COMPROBANTE) return { ok: false, error: 'El archivo supera los 25 MB.' };
  const raiz = carpetaRaiz_();
  const carpeta = d.tipo === 'resumen'
    ? subcarpeta_(subcarpeta_(raiz, CARPETA_RESUMENES), d.banco || 'Sin banco')
    : subcarpeta_(raiz, d.carpeta || 'Sin nombre');
  const nombre = nombreLibre_(carpeta, nombreSeguro_(d.nombre || 'comprobante'));
  const archivo = carpeta.createFile(Utilities.newBlob(bytes, String(d.mime || 'application/octet-stream'), nombre));
  archivo.setDescription('Cargado por ' + nombreDe_(u) + ' el ' + ahoraTexto_());
  const id = archivo.getId();

  return conLock_(() => {
    let marcados = 0;
    if (d.tipo === 'cheque') {
      const hoja = obtenerHoja_(SHEET_CHEQUES, HEADERS_CHEQUES);
      const ult = hoja.getLastRow();
      if (ult > 1) {
        const filas = hoja.getRange(2, 1, ult - 1, HEADERS_CHEQUES.length).getDisplayValues();
        filas.forEach((f, i) => {
          if (claveCheque_(f[COL_BANCO_CHEQUE], f[COL_NUMERO_CHEQUE]) === String(d.cheque || '')) {
            hoja.getRange(i + 2, COL_COMPROBANTE_CHEQUE + 1).setNumberFormat('@').setValue(id);
            marcados++;
          }
        });
      }
    } else {
      const hoja = obtenerHoja_(SHEET_TRANSFERENCIAS, HEADERS_TRANSFERENCIAS);
      const ult = hoja.getLastRow();
      const buscados = (d.internos || []).map(String);
      if (ult > 1 && buscados.length) {
        const internos = hoja.getRange(2, COL_INTERNO + 1, ult - 1, 1).getDisplayValues();
        internos.forEach((f, i) => {
          if (buscados.indexOf(String(f[0]).trim()) >= 0) {
            hoja.getRange(i + 2, COL_COMPROBANTE_TRANS + 1).setNumberFormat('@').setValue(id);
            marcados++;
          }
        });
      }
    }
    registrar_(u, 'Archivo de comprobante', nombre + ' → ' + carpeta.getName() + ' · ' + marcados + ' registro(s) vinculado(s)',
      d.tipo === 'cheque' ? String(d.cheque || '') : (d.internos || []).join(', '), '', { 'Archivo': nombre, 'Carpeta': carpeta.getName(), 'ID': id });
    return { ok: true, id: id, nombre: nombre, carpeta: carpeta.getName(), url: archivo.getUrl() };
  });
}

/** Solo se pueden ver archivos vinculados a un movimiento o cheque de la planilla. */
function verComprobante_(d) {
  const id = String(d.id || '');
  if (!id) return { ok: false, error: 'Falta el archivo.' };
  const vinculado = leerFilas_(SHEET_TRANSFERENCIAS, HEADERS_TRANSFERENCIAS).some(f => f['Comprobante'] === id) ||
    leerFilas_(SHEET_CHEQUES, HEADERS_CHEQUES).some(f => f['Comprobante'] === id);
  if (!vinculado) return { ok: false, error: 'Ese archivo no está vinculado a ningún registro.' };
  const archivo = DriveApp.getFileById(id);
  const blob = archivo.getBlob();
  return {
    ok: true, nombre: archivo.getName(), mime: blob.getContentType(), url: archivo.getUrl(),
    carpeta: archivo.getParents().hasNext() ? archivo.getParents().next().getName() : '',
    base64: Utilities.base64Encode(blob.getBytes())
  };
}

// ======================= Saldos y flujo de fondos =======================

function obtenerSaldos_() {
  obtenerHoja_(SHEET_SALDOS, HEADERS_SALDOS);
  return { ok: true, saldos: leerFilas_(SHEET_SALDOS, HEADERS_SALDOS).filter(s => s['Cuenta ID'] || s['N° de Cuenta']) };
}

/** d: {cuentaId, banco, cuentaNumero, fecha (dd/mm/aaaa), saldo, moneda, origen}. Reemplaza el de la misma cuenta y fecha. */
function guardarSaldo_(d, u) {
  return conLock_(() => {
    const fecha = String(d.fecha || '').trim();
    const p = fecha.split('/');
    if (p.length !== 3 || p[2].length !== 4) return { ok: false, error: 'La fecha del saldo va como dd/mm/aaaa.' };
    if (!String(d.saldo || '').trim()) return { ok: false, error: 'Falta el saldo.' };
    if (!d.cuentaId) return { ok: false, error: 'Falta la cuenta.' };
    const hoja = obtenerHoja_(SHEET_SALDOS, HEADERS_SALDOS);
    const filas = leerFilas_(SHEET_SALDOS, HEADERS_SALDOS);
    const idx = filas.findIndex(s => s['Cuenta ID'] === d.cuentaId && s['Fecha'] === fecha);
    const antes = idx >= 0 ? filas[idx] : null;
    const valores = {
      'Fecha': fecha, 'Banco': String(d.banco || ''), 'N° de Cuenta': String(d.cuentaNumero || ''), 'Cuenta ID': String(d.cuentaId),
      'Saldo': String(d.saldo).trim(), 'Moneda': d.moneda === 'USD' ? 'USD' : 'Pesos', 'Origen': String(d.origen || 'Manual'),
      'Cargado por': nombreDe_(u), 'Fecha de Carga': ahoraTexto_(), 'Tipo': 'Cuenta'
    };
    const fila = idx >= 0 ? idx + 2 : hoja.getLastRow() + 1;
    hoja.getRange(fila, 1, 1, HEADERS_SALDOS.length).setNumberFormat('@').setValues([HEADERS_SALDOS.map(h => valores[h])]);
    registrar_(u, antes ? 'Actualización de saldo' : 'Registro de saldo', valores['Banco'] + ' · ' + valores['N° de Cuenta'] + ' al ' + fecha + ': ' + valores['Saldo'] + ' (' + valores['Origen'] + ')',
      valores['Cuenta ID'], antes || '', valores);
    return { ok: true };
  });
}

/**
 * Registra varios saldos de una vez (planilla de saldos leída de una imagen
 * o de texto pegado). d: {fecha: dd/mm/aaaa, origen, saldos: [{cuentaId, saldo}],
 * fci: [{banco, moneda, saldo}]}. Si ya había un saldo de esa cuenta (o el FCI
 * de ese banco) en esa fecha, lo reemplaza.
 */
function guardarSaldos_(d, u) {
  return conLock_(() => {
    const fecha = String(d.fecha || '').trim();
    const p = fecha.split('/');
    if (p.length !== 3 || p[2].length !== 4) return { ok: false, error: 'La fecha del saldo va como dd/mm/aaaa.' };
    const lista = (d.saldos || []).filter(s => s && s.cuentaId && String(s.saldo || '').trim());
    const fcis = (d.fci || []).filter(f => f && String(f.banco || '').trim() && String(f.saldo || '').trim());
    if (!lista.length && !fcis.length) return { ok: false, error: 'No hay saldos para guardar.' };
    const ids = lista.map(s => String(s.cuentaId));
    if (ids.some((id, i) => ids.indexOf(id) !== i)) return { ok: false, error: 'Hay dos filas asignadas a la misma cuenta.' };
    const cuentas = leerFilas_(SHEET_CUENTAS, HEADERS_CUENTAS);
    const hoja = obtenerHoja_(SHEET_SALDOS, HEADERS_SALDOS);
    const filas = leerFilas_(SHEET_SALDOS, HEADERS_SALDOS);
    const origen = String(d.origen || 'Planilla de saldos');
    const detalle = [];
    let reemplazados = 0;
    lista.forEach(s => {
      const c = cuentas.find(x => x['ID'] === String(s.cuentaId));
      if (!c) return;
      const valores = {
        'Fecha': fecha, 'Banco': c['Banco'], 'N° de Cuenta': c['N° de Cuenta'], 'Cuenta ID': c['ID'],
        'Saldo': String(s.saldo).trim(), 'Moneda': c['Moneda'] === 'USD' ? 'USD' : 'Pesos', 'Origen': origen,
        'Cargado por': nombreDe_(u), 'Fecha de Carga': ahoraTexto_(), 'Tipo': 'Cuenta'
      };
      const idx = filas.findIndex(x => x['Cuenta ID'] === c['ID'] && x['Fecha'] === fecha);
      let fila;
      if (idx >= 0) { fila = idx + 2; reemplazados++; filas[idx] = valores; }
      else { fila = filas.length + 2; filas.push(valores); }
      hoja.getRange(fila, 1, 1, HEADERS_SALDOS.length).setNumberFormat('@').setValues([HEADERS_SALDOS.map(h => valores[h])]);
      detalle.push({ 'Cuenta': c['Banco'] + ' · ' + c['Tipo de Cuenta'] + ' ' + c['N° de Cuenta'], 'Saldo': valores['Saldo'], 'Moneda': valores['Moneda'] });
    });
    // FCI: un saldo por banco y moneda.
    fcis.forEach(f => {
      const banco = String(f.banco).trim();
      const moneda = f.moneda === 'USD' ? 'USD' : 'Pesos';
      const id = 'FCI|' + banco + '|' + moneda;
      const valores = {
        'Fecha': fecha, 'Banco': banco, 'N° de Cuenta': 'FCI', 'Cuenta ID': id, 'Saldo': String(f.saldo).trim(), 'Moneda': moneda,
        'Origen': origen, 'Cargado por': nombreDe_(u), 'Fecha de Carga': ahoraTexto_(), 'Tipo': 'FCI'
      };
      const idx = filas.findIndex(x => x['Cuenta ID'] === id && x['Fecha'] === fecha);
      let fila;
      if (idx >= 0) { fila = idx + 2; reemplazados++; filas[idx] = valores; }
      else { fila = filas.length + 2; filas.push(valores); }
      hoja.getRange(fila, 1, 1, HEADERS_SALDOS.length).setNumberFormat('@').setValues([HEADERS_SALDOS.map(h => valores[h])]);
      detalle.push({ 'Cuenta': 'FCI · ' + banco, 'Saldo': valores['Saldo'], 'Moneda': moneda });
    });
    registrar_(u, 'Registro de saldos (planilla)', detalle.length + ' saldo(s) al ' + fecha + ' · ' + origen + (reemplazados ? ' · ' + reemplazados + ' reemplazado(s)' : ''), fecha, '', detalle);
    return { ok: true, guardados: detalle.length, reemplazados: reemplazados };
  });
}

/**
 * Compromisos para el flujo de fondos: las alertas con importe (de todos los
 * usuarios) que vencen entre hoy y hoy + dias. Cheques y movimientos los
 * suma la página con lo que ya tiene.
 */
function obtenerFlujo_(d) {
  const dias = Math.max(1, Math.min(parseInt(d.dias, 10) || 30, 180));
  const ahora = ahoraLocal();
  const usuarios = {};
  leerUsuarios_().forEach(x => { usuarios[x['ID']] = x['Nombre'] || x['Usuario']; });
  const compromisos = [];
  leerAlertas_().forEach(a => {
    if (!a['ID'] || a['Activa'] !== 'Sí' || !String(a['Importe'] || '').trim()) return;
    const imp = Math.abs(importeANumero(a['Importe']));
    if (!imp) return;
    for (let i = 0; i <= dias; i++) {
      const iso = sumarDias(ahora.hoy, i);
      if (!coincideAlerta(a, iso)) continue;
      compromisos.push({
        iso: iso, titulo: a['Título'], importe: a['Tipo de Importe'] === 'Ingreso' ? imp : -imp,
        usuario: usuarios[a['Usuario']] || '', frecuencia: a['Frecuencia']
      });
      if (a['Frecuencia'] === 'Una vez') break;
    }
  });
  return { ok: true, hoy: ahora.hoy, dias: dias, compromisos: compromisos, saldos: obtenerSaldos_().saldos };
}

// ======================= Bancos y cuentas =======================

function soloDigitos(s) {
  let r = '';
  String(s || '').split('').forEach(ch => { if (ch >= '0' && ch <= '9') r += ch; });
  return r;
}

/** Minúsculas y sin tildes, para comparar nombres de bancos. */
function claveTexto(s) {
  const base = String(s || '').trim().toLowerCase().normalize('NFD');
  let r = '';
  for (let i = 0; i < base.length; i++) {
    const code = base.charCodeAt(i);
    if (code < 0x300 || code > 0x36f) r += base.charAt(i);
  }
  return r;
}

/**
 * Agrega al listado los bancos y cuentas que todavía no existen.
 * items: [{banco, tipo, numero, moneda}]. Se llama con el lock tomado.
 */
function asegurarCatalogo_(items, u) {
  sembrarBancosSiHaceFalta_();
  const hojaBancos = obtenerHoja_(SHEET_BANCOS, HEADERS_BANCOS);
  const hojaCuentas = obtenerHoja_(SHEET_CUENTAS, HEADERS_CUENTAS);
  const bancos = leerFilas_(SHEET_BANCOS, HEADERS_BANCOS).filter(b => b['Banco']);
  const cuentas = leerFilas_(SHEET_CUENTAS, HEADERS_CUENTAS).filter(c => c['ID']);
  const coloresNuevos = ['#1f4e8c', '#1f6b52', '#7a2836', '#4a5568', '#8a6a2f', '#2c5f7c', '#5b4a7a', '#3d5a3a'];
  let nuevosBancos = 0;
  let nuevasCuentas = 0;

  (items || []).forEach(it => {
    const banco = String(it.banco || '').trim();
    if (!banco) return;
    const clave = claveTexto(banco);
    let existente = bancos.find(b => claveTexto(b['Banco']) === clave);
    if (!existente) {
      const color = coloresNuevos[bancos.length % coloresNuevos.length];
      hojaBancos.appendRow([banco, color]);
      existente = { 'Banco': banco, 'Color': color };
      bancos.push(existente);
      nuevosBancos++;
      registrar_(u, 'Alta de banco (automática)', 'Banco ' + banco + ' agregado al guardar un movimiento', banco, '', '');
    }

    const numero = String(it.numero || '').trim();
    const dig = soloDigitos(numero);
    if (dig.length < 6) return;
    const yaEsta = cuentas.some(c => {
      if (claveTexto(c['Banco']) !== clave) return false;
      const n = soloDigitos(c['N° de Cuenta']);
      const cbu = soloDigitos(c['CBU']);
      if (n === dig || cbu === dig) return true;
      const corto = n.length > dig.length ? dig : n;
      const largo = n.length > dig.length ? n : dig;
      return corto.length >= 6 && largo.slice(-corto.length) === corto;
    });
    if (yaEsta) return;
    const tipo = TIPOS_CUENTA.indexOf(it.tipo) >= 0 ? it.tipo : '';
    const fila = [Utilities.getUuid(), existente['Banco'], tipo, numero, dig.length === 22 ? dig : '', '', it.moneda === 'USD' ? 'USD' : 'ARS', ''];
    hojaCuentas.getRange(hojaCuentas.getLastRow() + 1, 1, 1, HEADERS_CUENTAS.length).setNumberFormat('@').setValues([fila]);
    cuentas.push({ 'ID': fila[0], 'Banco': fila[1], 'Tipo de Cuenta': tipo, 'N° de Cuenta': numero, 'CBU': fila[4] });
    nuevasCuentas++;
    registrar_(u, 'Alta de cuenta (automática)', existente['Banco'] + ' · ' + numero + ' agregada al guardar un movimiento', fila[0], '', filaComoObjeto_(HEADERS_CUENTAS, fila));
  });
  return { bancos: nuevosBancos, cuentas: nuevasCuentas };
}

function obtenerCatalogo_() {
  sembrarBancosSiHaceFalta_();
  const bancos = leerFilas_(SHEET_BANCOS, HEADERS_BANCOS).filter(b => b['Banco']);
  const cuentas = leerFilas_(SHEET_CUENTAS, HEADERS_CUENTAS).filter(c => c['ID']);
  return { ok: true, bancos: bancos, cuentas: cuentas };
}

/** La primera vez, carga BBVA y Bancor para que la app siga andando como antes. */
function sembrarBancosSiHaceFalta_() {
  const props = propiedades_();
  if (props.getProperty('BANCOS_SEMBRADOS') === 'si') return;
  const sheet = obtenerHoja_(SHEET_BANCOS, HEADERS_BANCOS);
  if (sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, BANCOS_INICIALES.length, HEADERS_BANCOS.length).setValues(BANCOS_INICIALES);
  }
  props.setProperty('BANCOS_SEMBRADOS', 'si');
}

/** Alta de banco, o cambio de color si ya existe. d: {banco, color} */
function guardarBanco_(d, u) {
  return conLock_(() => {
    const nombre = String(d.banco || '').trim();
    const color = String(d.color || '').trim();
    if (!nombre) return { ok: false, error: 'Falta el nombre del banco.' };
    const sheet = obtenerHoja_(SHEET_BANCOS, HEADERS_BANCOS);
    const fila = buscarFila_(sheet, 0, v => v.toLowerCase() === nombre.toLowerCase());
    if (fila) {
      const antes = sheet.getRange(fila, 2).getDisplayValue();
      sheet.getRange(fila, 2).setValue(color);
      registrar_(u, 'Edición de banco', 'Banco ' + nombre, nombre, { 'Color': antes }, { 'Color': color });
    } else {
      sheet.appendRow([nombre, color]);
      registrar_(u, 'Alta de banco', 'Banco ' + nombre, nombre, '', { 'Banco': nombre, 'Color': color });
    }
    return { ok: true };
  });
}

/** Baja de banco (solo si no tiene cuentas). d: {banco} */
function eliminarBanco_(d, u) {
  return conLock_(() => {
    const nombre = String(d.banco || '').trim();
    const tieneCuentas = leerFilas_(SHEET_CUENTAS, HEADERS_CUENTAS).some(c => c['Banco'] === nombre);
    if (tieneCuentas) return { ok: false, error: 'Primero eliminá las cuentas de ' + nombre + '.' };
    const sheet = obtenerHoja_(SHEET_BANCOS, HEADERS_BANCOS);
    const fila = buscarFila_(sheet, 0, v => v === nombre);
    if (!fila) return { ok: false, error: 'No se encontró el banco.' };
    sheet.deleteRow(fila);
    registrar_(u, 'Baja de banco', 'Banco ' + nombre, nombre, { 'Banco': nombre }, '');
    return { ok: true };
  });
}

/** Alta o edición de cuenta. d: {id, banco, tipo, numero, cbu, alias, moneda, titular} */
function guardarCuenta_(d, u) {
  return conLock_(() => {
    const banco = String(d.banco || '').trim();
    const tipo = String(d.tipo || '').trim();
    const numero = String(d.numero || '').trim();
    if (!banco) return { ok: false, error: 'Falta el banco.' };
    if (TIPOS_CUENTA.indexOf(tipo) < 0) return { ok: false, error: 'Tipo de cuenta inválido.' };
    if (!numero) return { ok: false, error: 'Falta el N° de cuenta.' };
    sembrarBancosSiHaceFalta_();
    if (!leerFilas_(SHEET_BANCOS, HEADERS_BANCOS).some(b => b['Banco'] === banco)) return { ok: false, error: 'El banco ' + banco + ' no está cargado.' };

    const cuentas = leerFilas_(SHEET_CUENTAS, HEADERS_CUENTAS);
    const numeroLimpio = soloDigitos(numero) || numero;
    const repetida = cuentas.some(c =>
      c['ID'] !== d.id && c['Banco'] === banco && (soloDigitos(c['N° de Cuenta']) || c['N° de Cuenta']) === numeroLimpio
    );
    if (repetida) return { ok: false, error: 'Ya existe esa cuenta en ' + banco + '.' };

    const sheet = obtenerHoja_(SHEET_CUENTAS, HEADERS_CUENTAS);
    const id = d.id || Utilities.getUuid();
    const valores = [id, banco, tipo, numero, String(d.cbu || ''), String(d.alias || ''), String(d.moneda || 'ARS'), String(d.titular || '')];
    const antes = d.id ? cuentas.find(c => c['ID'] === d.id) : null;
    let fila = d.id ? buscarFila_(sheet, 0, v => v === d.id) : 0;
    if (!fila) fila = sheet.getLastRow() + 1;
    sheet.getRange(fila, 1, 1, HEADERS_CUENTAS.length).setNumberFormat('@').setValues([valores]);
    registrar_(u, antes ? 'Edición de cuenta' : 'Alta de cuenta', banco + ' · ' + numero, id, antes || '', filaComoObjeto_(HEADERS_CUENTAS, valores));
    return { ok: true, id: id };
  });
}

/** Baja de cuenta. d: {id} */
function eliminarCuenta_(d, u) {
  return conLock_(() => {
    const id = String(d.id || '');
    const sheet = obtenerHoja_(SHEET_CUENTAS, HEADERS_CUENTAS);
    const fila = buscarFila_(sheet, 0, v => v === id);
    if (!id || !fila) return { ok: false, error: 'No se encontró la cuenta.' };
    const antes = leerFilas_(SHEET_CUENTAS, HEADERS_CUENTAS).find(c => c['ID'] === id);
    sheet.deleteRow(fila);
    registrar_(u, 'Baja de cuenta', antes ? antes['Banco'] + ' · ' + antes['N° de Cuenta'] : id, id, antes || '', '');
    return { ok: true };
  });
}

// ======================= Configuración =======================

function propiedades_() {
  return PropertiesService.getScriptProperties();
}

function empresa_() {
  return propiedades_().getProperty('EMPRESA') || EMPRESA_DEFAULT;
}

function avisosActivos() {
  try {
    return ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === FUNCION_AVISOS);
  } catch (e) {
    return false;
  }
}

function limpiarTelefono(t) {
  const s = String(t || '').trim();
  return s ? '+' + soloDigitos(s) : '';
}

/** Configuración general + la del usuario. La clave de WhatsApp nunca vuelve al navegador. */
function obtenerConfig_(d, u) {
  return {
    ok: true,
    config: {
      empresa: empresa_(),
      telefono: u['Teléfono WhatsApp'] || '',
      tieneApikey: !!propiedades_().getProperty('WA_APIKEY_' + u['ID']),
      chequesDias: u['Cheques Días'] || '0',
      chequesHora: u['Cheques Hora'] || '9',
      automatico: avisosActivos(),
      zonaHoraria: Session.getScriptTimeZone()
    }
  };
}

/** d: {empresa, telefono, apikey, chequesDias, chequesHora}. apikey vacía = no se cambia. */
function guardarConfig_(d, u) {
  return conLock_(() => {
    const empresa = String(d.empresa || '').trim().toUpperCase();
    if (empresa.length < 3) return { ok: false, error: 'El nombre de la empresa tiene que tener al menos 3 letras.' };
    const telefono = limpiarTelefono(d.telefono);
    if (telefono && soloDigitos(telefono).length < 10) {
      return { ok: false, error: 'El teléfono va con código de país y de área, por ejemplo +5493511234567.' };
    }
    const dias = parseInt(d.chequesDias, 10);
    const hora = parseInt(d.chequesHora, 10);
    const p = propiedades_();
    const antes = { 'Empresa': empresa_(), 'Teléfono': u['Teléfono WhatsApp'], 'Cheques Días': u['Cheques Días'], 'Cheques Hora': u['Cheques Hora'] };
    const despues = {
      'Empresa': empresa, 'Teléfono': telefono,
      'Cheques Días': String(isNaN(dias) || dias < 0 ? 0 : Math.min(dias, 60)),
      'Cheques Hora': String(isNaN(hora) || hora < 0 || hora > 23 ? 9 : hora)
    };
    p.setProperty('EMPRESA', empresa);
    actualizarCampoUsuario_(u['ID'], 'Teléfono WhatsApp', telefono);
    actualizarCampoUsuario_(u['ID'], 'Cheques Días', despues['Cheques Días']);
    actualizarCampoUsuario_(u['ID'], 'Cheques Hora', despues['Cheques Hora']);
    const cambioClave = !!String(d.apikey || '').trim();
    if (cambioClave) p.setProperty('WA_APIKEY_' + u['ID'], String(d.apikey).trim());
    if (cambioClave) despues['Clave de WhatsApp'] = 'actualizada';
    registrar_(u, 'Cambio de configuración', 'Configuración de WhatsApp y opciones', u['ID'], antes, despues);
    const actual = leerUsuarios_().find(x => x['ID'] === u['ID']);
    return obtenerConfig_(d, actual);
  });
}

/** Prende o apaga la revisión automática (una vez por hora, para todos los usuarios). d: {activar} */
function activarAvisos_(d, u) {
  const activar = !!d.activar;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === FUNCION_AVISOS) ScriptApp.deleteTrigger(t);
  });
  if (activar) ScriptApp.newTrigger(FUNCION_AVISOS).timeBased().everyHours(1).create();
  registrar_(u, activar ? 'Activación de envío automático' : 'Desactivación de envío automático', 'Alertas por WhatsApp', '', '', '');
  return { ok: true, automatico: activar };
}

function probarWhatsapp_(d, u) {
  enviarWhatsapp_(u, '*Tesorería · Mensaje de prueba*\nHola ' + (u['Nombre'] || u['Usuario']) + ', la conexión con WhatsApp funciona correctamente.');
  return { ok: true };
}

// ======================= WhatsApp (CallMeBot) =======================

function enviarWhatsapp_(u, texto) {
  const tel = u['Teléfono WhatsApp'];
  const key = propiedades_().getProperty('WA_APIKEY_' + u['ID']);
  if (!tel || !key) throw new Error('Falta configurar tu teléfono o tu clave (apikey) de WhatsApp.');
  const url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(tel) +
    '&text=' + encodeURIComponent(texto) + '&apikey=' + encodeURIComponent(key);
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  const code = res.getResponseCode();
  const cuerpo = textoPlano(res.getContentText() || '');
  const may = cuerpo.toUpperCase();
  if (code !== 200) throw new Error('WhatsApp respondió con error ' + code + ': ' + cuerpo.substring(0, 160));
  if (may.indexOf('QUEUED') < 0 && may.indexOf('SENT') < 0 && (may.indexOf('ERROR') >= 0 || may.indexOf('INVALID') >= 0)) {
    throw new Error('WhatsApp rechazó el envío: ' + cuerpo.substring(0, 160));
  }
  return true;
}

/** Saca las etiquetas HTML de una respuesta, para mostrar el error en limpio. */
function textoPlano(html) {
  let r = '';
  let dentro = false;
  for (let i = 0; i < html.length; i++) {
    const ch = html.charAt(i);
    if (ch === '<') { dentro = true; r += ' '; continue; }
    if (ch === '>') { dentro = false; continue; }
    if (!dentro) r += ch;
  }
  return r.split('\n').map(l => l.trim()).filter(Boolean).join(' ').split('  ').join(' ').trim();
}

// ======================= Alertas =======================

function ahoraLocal() {
  const tz = Session.getScriptTimeZone();
  const d = new Date();
  return { hoy: Utilities.formatDate(d, tz, 'yyyy-MM-dd'), hora: parseInt(Utilities.formatDate(d, tz, 'H'), 10) };
}

function partesIso(iso) {
  const p = String(iso || '').split('-');
  return { y: parseInt(p[0], 10), m: parseInt(p[1], 10), d: parseInt(p[2], 10) };
}

function fechaUtc(iso) {
  const p = partesIso(iso);
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
}

function sumarDias(iso, n) {
  const p = partesIso(iso);
  return Utilities.formatDate(new Date(Date.UTC(p.y, p.m - 1, p.d + n)), 'UTC', 'yyyy-MM-dd');
}

function isoAMostrar(iso) {
  const p = String(iso || '').split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '';
}

function esIsoValida(iso) {
  const s = String(iso || '');
  if (s.length !== 10 || s.charAt(4) !== '-' || s.charAt(7) !== '-') return false;
  const p = partesIso(s);
  return !isNaN(p.y) && p.m >= 1 && p.m <= 12 && p.d >= 1 && p.d <= 31;
}

/** 1 = lunes … 7 = domingo */
function diaSemana(iso) {
  return parseInt(Utilities.formatDate(fechaUtc(iso), 'UTC', 'u'), 10);
}

function ultimoDiaDelMes(iso) {
  const p = partesIso(iso);
  return new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
}

function coincideAlerta(a, iso) {
  const f = a['Frecuencia'];
  if (f === 'Una vez') return a['Fecha'] === iso;
  if (f === 'Diaria') return true;
  if (f === 'Días hábiles') return diaSemana(iso) <= 5;
  if (f === 'Semanal') {
    const dias = String(a['Días de la Semana'] || '').split(',').map(x => parseInt(x, 10));
    return dias.indexOf(diaSemana(iso)) >= 0;
  }
  if (f === 'Mensual') {
    const ultimo = ultimoDiaDelMes(iso);
    const dia = partesIso(iso).d;
    if (a['Día del Mes'] === 'Último') return dia === ultimo;
    const n = parseInt(a['Día del Mes'], 10);
    return !isNaN(n) && dia === Math.min(n, ultimo);
  }
  if (f === 'Anual') return String(a['Fecha'] || '').substring(5) === iso.substring(5);
  return false;
}

function horaDe(a) {
  const h = parseInt(a['Hora'], 10);
  return isNaN(h) ? 9 : h;
}

function anticipacionDe(a) {
  const n = parseInt(a['Días de Anticipación'], 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

function proximoAviso(a, ahora) {
  if (a['Activa'] !== 'Sí') return null;
  const antes = anticipacionDe(a);
  for (let d = 0; d <= 400 + antes; d++) {
    const vence = sumarDias(ahora.hoy, d);
    if (!coincideAlerta(a, vence)) continue;
    const aviso = sumarDias(vence, -antes);
    if (aviso < ahora.hoy) continue;
    if (aviso === ahora.hoy && a['Último Envío'] === ahora.hoy) continue;
    return { aviso: aviso, vence: vence };
  }
  return null;
}

function textoAlerta(a, vence, antes) {
  let t = '*Tesorería · ' + (a['Título'] || 'Recordatorio') + '*';
  if (a['Mensaje']) t += '\n' + a['Mensaje'];
  if (String(a['Importe'] || '').trim()) t += '\nImporte: ' + formatoPesos(importeANumero(a['Importe'])) + (a['Tipo de Importe'] === 'Ingreso' ? ' (a cobrar)' : ' (a pagar)');
  if (vence) {
    t += '\nFecha: ' + isoAMostrar(vence);
    if (antes > 0) t += ' (faltan ' + antes + (antes === 1 ? ' día)' : ' días)');
  }
  return t;
}

function leerAlertas_() {
  obtenerHoja_(SHEET_ALERTAS, HEADERS_ALERTAS);
  return leerFilas_(SHEET_ALERTAS, HEADERS_ALERTAS);
}

/** Solo las alertas del usuario. */
function obtenerAlertas_(d, u) {
  const ahora = ahoraLocal();
  const alertas = leerAlertas_().filter(a => a['ID'] && a['Usuario'] === u['ID']).map(a => {
    const prox = proximoAviso(a, ahora);
    return Object.assign({}, a, { proximoAviso: prox ? prox.aviso : '', proximoVence: prox ? prox.vence : '' });
  });
  return { ok: true, alertas: alertas, automatico: avisosActivos(), hoy: ahora.hoy };
}

function alertaDelUsuario_(id, u) {
  const sheet = obtenerHoja_(SHEET_ALERTAS, HEADERS_ALERTAS);
  const fila = buscarFila_(sheet, 0, v => v === id);
  if (!id || !fila) throw new Error('No se encontró la alerta.');
  const a = leerAlertas_()[fila - 2];
  if (a['Usuario'] !== u['ID']) throw new Error('Esa alerta pertenece a otro usuario.');
  return { sheet: sheet, fila: fila, alerta: a };
}

/** Alta o edición. d: {id, activa, titulo, mensaje, frecuencia, fecha, dias, diaMes, hora, antes} */
function guardarAlerta_(d, u) {
  return conLock_(() => {
    const titulo = String(d.titulo || '').trim();
    const frecuencia = String(d.frecuencia || '');
    if (!titulo) return { ok: false, error: 'Falta el título.' };
    if (FRECUENCIAS.indexOf(frecuencia) < 0) return { ok: false, error: 'Frecuencia inválida.' };
    const fecha = String(d.fecha || '');
    if ((frecuencia === 'Una vez' || frecuencia === 'Anual') && !esIsoValida(fecha)) return { ok: false, error: 'Elegí la fecha de la alerta.' };
    const dias = (d.dias || []).map(x => parseInt(x, 10)).filter(x => x >= 1 && x <= 7).sort();
    if (frecuencia === 'Semanal' && !dias.length) return { ok: false, error: 'Elegí al menos un día de la semana.' };
    const diaMes = String(d.diaMes || '');
    if (frecuencia === 'Mensual' && diaMes !== 'Último' && !(parseInt(diaMes, 10) >= 1 && parseInt(diaMes, 10) <= 31)) {
      return { ok: false, error: 'Elegí el día del mes.' };
    }
    const hora = parseInt(d.hora, 10);
    const antesDias = parseInt(d.antes, 10);

    let sheet = obtenerHoja_(SHEET_ALERTAS, HEADERS_ALERTAS);
    let fila = 0;
    let previa = null;
    if (d.id) {
      const e = alertaDelUsuario_(String(d.id), u);
      sheet = e.sheet;
      fila = e.fila;
      previa = e.alerta;
    }
    if (!fila) fila = sheet.getLastRow() + 1;
    const id = d.id || Utilities.getUuid();
    const valores = [
      id, d.activa === false ? 'No' : 'Sí', titulo, String(d.mensaje || '').trim(), frecuencia,
      (frecuencia === 'Una vez' || frecuencia === 'Anual') ? fecha : '',
      frecuencia === 'Semanal' ? dias.join(',') : '',
      frecuencia === 'Mensual' ? diaMes : '',
      String(isNaN(hora) || hora < 0 || hora > 23 ? 9 : hora),
      String(isNaN(antesDias) || antesDias < 0 ? 0 : Math.min(antesDias, 60)),
      previa ? previa['Último Envío'] : '',
      u['ID'],
      String(d.importe || '').trim(),
      d.tipoImporte === 'Ingreso' ? 'Ingreso' : 'Egreso'
    ];
    sheet.getRange(fila, 1, 1, HEADERS_ALERTAS.length).setNumberFormat('@').setValues([valores]);
    registrar_(u, previa ? 'Edición de alerta' : 'Alta de alerta', titulo, id, previa || '', filaComoObjeto_(HEADERS_ALERTAS, valores));
    return { ok: true, id: id };
  });
}

function eliminarAlerta_(d, u) {
  return conLock_(() => {
    const e = alertaDelUsuario_(String(d.id || ''), u);
    e.sheet.deleteRow(e.fila);
    registrar_(u, 'Baja de alerta', e.alerta['Título'], e.alerta['ID'], e.alerta, '');
    return { ok: true };
  });
}

function probarAlerta_(d, u) {
  const a = alertaDelUsuario_(String(d.id || ''), u).alerta;
  const prox = proximoAviso(Object.assign({}, a, { 'Activa': 'Sí' }), ahoraLocal());
  enviarWhatsapp_(u, textoAlerta(a, prox ? prox.vence : '', anticipacionDe(a)));
  return { ok: true };
}

/**
 * La ejecuta el activador una vez por hora. Cada alerta activa se envía al
 * WhatsApp de su dueño, una sola vez por día, a partir de su hora. Después,
 * el resumen de cheques a vencer de cada usuario que lo tenga configurado.
 */
function revisarAlertas() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const ahora = ahoraLocal();
    const usuarios = {};
    leerUsuarios_().forEach(u => { if (u['Activo'] === 'Sí') usuarios[u['ID']] = u; });
    const sheet = obtenerHoja_(SHEET_ALERTAS, HEADERS_ALERTAS);
    leerAlertas_().forEach((a, i) => {
      const u = usuarios[a['Usuario']];
      if (!a['ID'] || a['Activa'] !== 'Sí' || !u) return;
      if (a['Último Envío'] === ahora.hoy || ahora.hora < horaDe(a)) return;
      const antes = anticipacionDe(a);
      const vence = sumarDias(ahora.hoy, antes);
      if (!coincideAlerta(a, vence)) return;
      try {
        enviarWhatsapp_(u, textoAlerta(a, vence, antes));
        sheet.getRange(i + 2, COL_ALERTA_ULTIMO + 1).setNumberFormat('@').setValue(ahora.hoy);
        if (a['Frecuencia'] === 'Una vez') sheet.getRange(i + 2, COL_ALERTA_ACTIVA + 1).setValue('No');
      } catch (e) {
        console.error('No se pudo enviar la alerta "' + a['Título'] + '" a ' + u['Usuario'] + ': ' + e.message);
      }
    });

    const p = propiedades_();
    Object.keys(usuarios).forEach(id => {
      const u = usuarios[id];
      const dias = parseInt(u['Cheques Días'] || '0', 10);
      const hora = parseInt(u['Cheques Hora'] || '9', 10);
      if (!(dias > 0) || ahora.hora < hora || p.getProperty('CHEQUES_ULTIMO_' + id) === ahora.hoy) return;
      try {
        const texto = resumenCheques_(ahora.hoy, dias);
        if (texto) enviarWhatsapp_(u, texto);
        p.setProperty('CHEQUES_ULTIMO_' + id, ahora.hoy);
      } catch (e) {
        console.error('No se pudo enviar el resumen de cheques a ' + u['Usuario'] + ': ' + e.message);
      }
    });
  } finally {
    lock.releaseLock();
  }
}

/** "1.234,56" → 1234.56 (formato argentino, sin expresiones regulares). */
function importeANumero(s) {
  let t = '';
  String(s || '').split('').forEach(ch => { if ((ch >= '0' && ch <= '9') || ch === ',' || ch === '.' || ch === '-') t += ch; });
  const coma = t.lastIndexOf(',');
  const punto = t.lastIndexOf('.');
  if (coma > punto) t = t.split('.').join('').replace(',', '.');
  else if (punto > coma) t = t.split(',').join('');
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}

function formatoPesos(n) {
  const fijo = Math.abs(n).toFixed(2).split('.');
  let entero = '';
  const e = fijo[0];
  for (let i = 0; i < e.length; i++) {
    if (i > 0 && (e.length - i) % 3 === 0) entero += '.';
    entero += e.charAt(i);
  }
  return (n < 0 ? '-' : '') + '$ ' + entero + ',' + fijo[1];
}

/** Cheques cuya fecha de pago cae entre hoy y hoy + dias. '' si no hay. */
function resumenCheques_(hoy, dias) {
  const limite = sumarDias(hoy, dias);
  const lista = leerFilas_(SHEET_CHEQUES, HEADERS_CHEQUES).map(c => {
    const p = String(c['Fecha de Pago'] || '').split('/');
    const iso = p.length === 3 ? p[2] + '-' + ('0' + p[1]).slice(-2) + '-' + ('0' + p[0]).slice(-2) : '';
    return { c: c, iso: iso };
  }).filter(x => x.iso && x.iso >= hoy && x.iso <= limite)
    .sort((a, b) => a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0);
  if (!lista.length) return '';
  let total = 0;
  lista.forEach(x => { total += importeANumero(x.c['Importe']); });
  const lineas = lista.slice(0, 15).map(x => '• ' + isoAMostrar(x.iso).substring(0, 5) + ' · ' + (x.c['Tipo'] || 'Cheque') +
    ' N° ' + x.c['N° de Cheque'] + ' · ' + (x.c['Titular'] || 's/titular') + ' · ' + formatoPesos(importeANumero(x.c['Importe'])));
  let t = '*Tesorería · Cheques a vencer*\nPróximos ' + dias + ' días: ' + lista.length + ' cheque(s) por ' + formatoPesos(total) + '\n' + lineas.join('\n');
  if (lista.length > 15) t += '\n… y ' + (lista.length - 15) + ' más.';
  return t;
}

// ======================= Utilidades de hojas =======================

/** Número de fila (1-based) cuya columna col cumple test, o 0. */
function buscarFila_(sheet, col, test) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const valores = sheet.getRange(2, col + 1, lastRow - 1, 1).getDisplayValues();
  for (let i = 0; i < valores.length; i++) {
    if (test(String(valores[i][0]).trim())) return i + 2;
  }
  return 0;
}

/**
 * Agrega filas a una hoja evitando duplicados según columnas clave. Se
 * llama con el lock tomado. Devuelve {agregadas, duplicadas, guardadas}.
 */
function guardarFilas_(rows, nombreHoja, headers, keyCols) {
  const sheet = obtenerHoja_(nombreHoja, headers);
  const lastRow = sheet.getLastRow();
  const existentes = new Set();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).getDisplayValues().forEach(fila => {
      const clave = claveDe_(fila, keyCols);
      if (clave) existentes.add(clave);
    });
  }
  const nuevas = [];
  const duplicadas = [];
  (rows || []).forEach(r => {
    const fila = headers.map((_, i) => r[i] == null ? '' : String(r[i]));
    const clave = claveDe_(fila, keyCols);
    if (clave && existentes.has(clave)) {
      duplicadas.push(fila[0] + ' (' + clave.split('|').join(' ') + ')');
    } else {
      if (clave) existentes.add(clave);
      nuevas.push(fila);
    }
  });
  if (nuevas.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, nuevas.length, headers.length).setNumberFormat('@').setValues(nuevas);
  }
  return { agregadas: nuevas.length, duplicadas: duplicadas, guardadas: nuevas };
}

function claveDe_(fila, keyCols) {
  const partes = keyCols.map(i => String(fila[i] || '').trim());
  if (partes.some(p => !p)) return '';
  return partes.join('|');
}

/**
 * Devuelve la hoja indicada; si está vacía le pone los encabezados. Si ya
 * existía con menos columnas, completa los encabezados que faltan al final.
 */
// Hojas ya revisadas en esta ejecución: evita volver a leer los encabezados en cada llamada.
const HOJAS_LISTAS_ = {};

function obtenerHoja_(nombre, headers) {
  const memo = nombre + '|' + headers.length;
  if (HOJAS_LISTAS_[memo]) return HOJAS_LISTAS_[memo];
  const sheet = obtenerHojaSinMemo_(nombre, headers);
  HOJAS_LISTAS_[memo] = sheet;
  return sheet;
}

function obtenerHojaSinMemo_(nombre, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return sheet;
  }
  const actuales = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (headers.some((h, i) => !String(actuales[i] || '').trim())) {
    const completos = headers.map((h, i) => String(actuales[i] || '').trim() || h);
    sheet.getRange(1, 1, 1, headers.length).setValues([completos]).setFontWeight('bold');
  }
  return sheet;
}

/** Lee todas las filas de datos de una hoja como objetos {Campo: valor}. */
function leerFilas_(nombreHoja, headers) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombreHoja);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const cols = Math.min(headers.length, sheet.getMaxColumns());
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, cols).getDisplayValues().map(fila => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = i < cols ? fila[i] : ''; });
    return obj;
  });
}

// ======================= Importación de la planilla de flujo de fondos =======================
// La página lee el Excel "Flujo de fondos" (pestañas TF, EFT, CH, CH T, FCI,
// Bolsa, Planes de pago, Pagos mensuales, Tarjetas y Resumen del día) y manda
// las filas por lotes, ya traducidas a los campos de cada hoja de la app.
// Cada fila trae un "ID Planilla" (por ejemplo TF-1015 o CH-2152): si ya está
// cargada, se actualiza con los datos nuevos; si no, se agrega. Así la
// planilla se puede volver a importar las veces que haga falta sin duplicar.
// Los registros conciliados no se tocan.

// Campos que la importación nunca pisa en un registro existente.
const CAMPOS_PROTEGIDOS_IMPORTACION = ['N° Interno', 'Fecha de Carga', 'Cargado por', 'Conciliación', 'Comprobante', 'Archivo', 'Origen', 'ID'];

/**
 * d: {destino: 'cuentas'|'movimientos'|'cheques'|'saldos'|'compromisos', filas: [...],
 *     archivo, lote, lotes}
 */
function importarPlanilla_(d, u) {
  return conLock_(() => {
    const destino = String(d.destino || '');
    const filas = d.filas || [];
    let res;
    if (destino === 'cuentas') res = importarCuentas_(d, u);
    else if (destino === 'movimientos') res = importarMovimientos_(filas, d, u);
    else if (destino === 'cheques') res = importarCheques_(filas, d, u);
    else if (destino === 'saldos') res = importarSaldos_(filas, d, u);
    else if (destino === 'compromisos') res = importarCompromisos_(filas, d, u);
    else if (destino === 'fci') res = importarInversiones_(SHEET_FCI, HEADERS_FCI, filas, d, u);
    else if (destino === 'bolsa') res = importarInversiones_(SHEET_BOLSA, HEADERS_BOLSA, filas, d, u);
    else return { ok: false, error: 'Destino de importación desconocido: ' + destino };
    const nombres = { cuentas: 'Bancos y cuentas', movimientos: 'Movimientos', cheques: 'Cheques', saldos: 'Saldos', compromisos: 'Compromisos', fci: 'FCI', bolsa: 'Bolsa' };
    if (res.nuevos || res.actualizados) {
      registrar_(u, 'Importación de planilla',
        nombres[destino] + (d.lotes > 1 ? ' (lote ' + d.lote + ' de ' + d.lotes + ')' : '') + ': ' + (res.nuevos || 0) + ' nuevo(s), ' +
        (res.actualizados || 0) + ' actualizado(s)' + (res.conciliados ? ', ' + res.conciliados + ' conciliado(s) sin cambios' : ''),
        String(d.archivo || ''), '', '');
    }
    res.ok = true;
    return res;
  });
}

/** Banco del listado con ese nombre (sin distinguir mayúsculas ni acentos); si no existe, lo agrega. */
function asegurarBanco_(nombre, bancos, hojaBancos, u) {
  const banco = String(nombre || '').trim();
  if (!banco) return '';
  const clave = claveTexto(banco);
  const existente = bancos.find(b => claveTexto(b['Banco']) === clave);
  if (existente) return existente['Banco'];
  const colores = ['#1f4e8c', '#1f6b52', '#7a2836', '#4a5568', '#8a6a2f', '#2c5f7c', '#5b4a7a', '#3d5a3a'];
  const color = colores[bancos.length % colores.length];
  hojaBancos.appendRow([banco, color]);
  bancos.push({ 'Banco': banco, 'Color': color });
  registrar_(u, 'Alta de banco (planilla)', 'Banco ' + banco + ' agregado al importar la planilla', banco, '', '');
  return banco;
}

/**
 * d.bancos: nombres de bancos a dar de alta si no están.
 * d.filas: [{ref, cuentaId (si ya existe), banco, tipo, numero, cbu, alias, moneda}]
 * Devuelve {ids: {ref: ID de la cuenta}}.
 */
function importarCuentas_(d, u) {
  sembrarBancosSiHaceFalta_();
  const hojaBancos = obtenerHoja_(SHEET_BANCOS, HEADERS_BANCOS);
  const hojaCuentas = obtenerHoja_(SHEET_CUENTAS, HEADERS_CUENTAS);
  const bancos = leerFilas_(SHEET_BANCOS, HEADERS_BANCOS).filter(b => b['Banco']);
  const cuentas = leerFilas_(SHEET_CUENTAS, HEADERS_CUENTAS);
  let nuevos = 0, actualizados = 0;
  const ids = {};
  (d.bancos || []).forEach(b => {
    const antes = bancos.length;
    asegurarBanco_(b, bancos, hojaBancos, u);
    if (bancos.length > antes) nuevos++;
  });
  (d.filas || []).forEach(c => {
    const banco = asegurarBanco_(c.banco, bancos, hojaBancos, u);
    if (!banco) return;
    const cbu = soloDigitos(c.cbu);
    const alias = String(c.alias || '').trim();
    let idx = c.cuentaId ? cuentas.findIndex(x => x['ID'] === String(c.cuentaId)) : -1;
    if (idx < 0 && cbu) idx = cuentas.findIndex(x => soloDigitos(x['CBU']) === cbu);
    if (idx >= 0) {
      const x = cuentas[idx];
      const cambios = {};
      if (cbu && soloDigitos(x['CBU']) !== cbu) cambios['CBU'] = cbu;
      if (alias && String(x['Alias'] || '').trim() !== alias) cambios['Alias'] = alias;
      if (Object.keys(cambios).length) {
        const antes = { 'CBU': x['CBU'], 'Alias': x['Alias'] };
        Object.keys(cambios).forEach(k => { x[k] = cambios[k]; });
        hojaCuentas.getRange(idx + 2, 1, 1, HEADERS_CUENTAS.length).setNumberFormat('@').setValues([HEADERS_CUENTAS.map(h => x[h] == null ? '' : String(x[h]))]);
        registrar_(u, 'Cambio de cuenta (planilla)', x['Banco'] + ' · ' + x['N° de Cuenta'] + ': ' + Object.keys(cambios).join(' y ') + ' desde la planilla', x['ID'], antes, cambios);
        actualizados++;
      }
      ids[c.ref] = x['ID'];
      return;
    }
    const tipo = TIPOS_CUENTA.indexOf(c.tipo) >= 0 ? c.tipo : '';
    const fila = [Utilities.getUuid(), banco, tipo, String(c.numero || cbu).trim(), cbu, alias, c.moneda === 'USD' ? 'USD' : 'ARS', String(c.titular || '').trim()];
    hojaCuentas.getRange(hojaCuentas.getLastRow() + 1, 1, 1, HEADERS_CUENTAS.length).setNumberFormat('@').setValues([fila]);
    const obj = filaComoObjeto_(HEADERS_CUENTAS, fila);
    cuentas.push(obj);
    registrar_(u, 'Alta de cuenta (planilla)', banco + ' · ' + fila[3] + ' agregada al importar la planilla', fila[0], '', obj);
    ids[c.ref] = fila[0];
    nuevos++;
  });
  return { ids: ids, nuevos: nuevos, actualizados: actualizados, catalogo: obtenerCatalogo_() };
}

/**
 * Agrega o actualiza filas por "ID Planilla".
 * opciones: {nueva(fila objeto) → completa campos de un alta, alternativa(objeto entrante, filas) → índice de
 * un registro cargado a mano o por comprobante que corresponde al mismo (para no duplicarlo), idDe}
 */
function upsertPlanilla_(nombreHoja, H, filas, opciones) {
  const hoja = obtenerHoja_(nombreHoja, H);
  const ult = hoja.getLastRow();
  const datos = ult > 1 ? hoja.getRange(2, 1, ult - 1, H.length).getDisplayValues() : [];
  const iId = H.indexOf('ID Planilla');
  const iConc = H.indexOf('Conciliación');
  const porId = {};
  datos.forEach((f, i) => { const id = String(f[iId] || '').trim(); if (id) porId[id] = i; });
  const nuevas = [];
  let nuevos = 0, actualizados = 0, conciliados = 0, sinCambios = 0;
  filas.forEach(obj => {
    const id = String(obj['ID Planilla'] || '').trim();
    if (!id) return;
    let idx = porId[id];
    if (idx === undefined && opciones.alternativa) {
      const alt = opciones.alternativa(obj, datos);
      if (alt >= 0 && !String(datos[alt][iId] || '').trim()) idx = alt;
    }
    if (idx !== undefined && idx >= datos.length) return;
    if (idx !== undefined) {
      const f = datos[idx];
      if (iConc >= 0 && String(f[iConc] || '').trim()) { conciliados++; return; }
      let cambia = false;
      const nueva = f.slice();
      H.forEach((h, i) => {
        if (CAMPOS_PROTEGIDOS_IMPORTACION.indexOf(h) >= 0 || !(h in obj)) return;
        const v = obj[h] == null ? '' : String(obj[h]).trim();
        if (String(nueva[i]) !== v) { nueva[i] = v; cambia = true; }
      });
      if (!cambia) { sinCambios++; return; }
      hoja.getRange(idx + 2, 1, 1, H.length).setNumberFormat('@').setValues([nueva]);
      datos[idx] = nueva;
      porId[id] = idx;
      actualizados++;
      return;
    }
    const fila = H.map(h => obj[h] == null ? '' : String(obj[h]).trim());
    if (opciones.nueva) opciones.nueva(fila);
    nuevas.push(fila);
    porId[id] = datos.length + nuevas.length - 1;
    nuevos++;
  });
  if (nuevas.length) hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, H.length).setNumberFormat('@').setValues(nuevas);
  return { nuevos: nuevos, actualizados: actualizados, conciliados: conciliados, sinCambios: sinCambios };
}

function importarMovimientos_(filas, d, u) {
  const H = HEADERS_TRANSFERENCIAS;
  const hoja = obtenerHoja_(SHEET_TRANSFERENCIAS, H);
  const ult = hoja.getLastRow();
  let ultimoInterno = 0;
  if (ult > 1) {
    hoja.getRange(2, COL_INTERNO + 1, ult - 1, 1).getDisplayValues().forEach(f => {
      const n = parseInt(f[0], 10);
      if (!isNaN(n) && n > ultimoInterno) ultimoInterno = n;
    });
  }
  const hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const iId = H.indexOf('ID Planilla');
  filas.forEach(o => {
    o['Moneda'] = o['Moneda'] === 'USD' ? 'USD' : 'Pesos';
    if (o['Condición'] !== 'Ingreso' && o['Condición'] !== 'Egreso') o['Condición'] = String(o['Monto'] || '').trim().charAt(0) === '-' ? 'Egreso' : 'Ingreso';
    o['Monto'] = montoConSigno(o['Monto'], o['Condición']);
    o['Entre Cuentas Propias'] = o['Entre Cuentas Propias'] === 'Sí' ? 'Sí' : 'No';
  });
  return upsertPlanilla_(SHEET_TRANSFERENCIAS, H, filas, {
    nueva: fila => {
      ultimoInterno++;
      fila[COL_INTERNO] = String(ultimoInterno);
      fila[COL_FECHA_CARGA] = hoy;
      fila[COL_ORIGEN] = 'Planilla';
      fila[COL_ARCHIVO] = String(d.archivo || 'Planilla de flujo de fondos');
      fila[COL_CARGADO_TRANS] = nombreDe_(u);
    },
    // Un movimiento cargado antes por comprobante: mismo banco, mismo N° de referencia y mismo importe.
    alternativa: (o, datos) => {
      const ref = String(o['N° de Referencia'] || '').trim();
      if (soloDigitos(ref).length < 4) return -1;
      const banco = claveTexto(o['Banco']);
      const imp = Math.abs(importeANumero(o['Monto']));
      return datos.findIndex(f => !String(f[iId] || '').trim() && claveTexto(f[COL_BANCO_TRANS]) === banco &&
        String(f[COL_REFERENCIA]).trim() === ref && Math.abs(Math.abs(importeANumero(f[COL_MONTO])) - imp) < 0.01);
    }
  });
}

function importarCheques_(filas, d, u) {
  const H = HEADERS_CHEQUES;
  const iId = H.indexOf('ID Planilla');
  const iTipo = H.indexOf('Tipo');
  const iImporte = H.indexOf('Importe');
  // Un cheque que ya figura como pagado (por ejemplo, desde Salida de cheques) no
  // vuelve a pendiente si la planilla todavía no lo tiene actualizado.
  const pagados = {};
  leerFilas_(SHEET_CHEQUES, H).forEach(f => {
    if (String(f['ID Planilla'] || '').trim() && claveTexto(f['Estado']) === 'pagado') pagados[String(f['ID Planilla']).trim()] = f;
  });
  filas.forEach(o => {
    if (o['Tipo'] === 'De terceros') { o['Banco'] = ''; o['N° de Cuenta'] = ''; o['Tipo de Cuenta'] = ''; }
    o['Moneda'] = o['Moneda'] === 'USD' ? 'USD' : 'Pesos';
    const pagado = pagados[String(o['ID Planilla'] || '').trim()];
    if (pagado && ESTADOS_ABIERTOS_SRV.indexOf(claveTexto(o['Estado'])) >= 0) {
      o['Estado'] = pagado['Estado'];
      if (!String(o['Fecha de Débito'] || '').trim()) o['Fecha de Débito'] = pagado['Fecha de Débito'];
    }
  });
  return upsertPlanilla_(SHEET_CHEQUES, H, filas, {
    nueva: fila => {
      fila[H.indexOf('Archivo')] = String(d.archivo || 'Planilla de flujo de fondos');
      fila[COL_CARGADO_CHEQUE] = nombreDe_(u);
    },
    // Un cheque cargado antes a mano o por imagen: emitidos por banco + N°; de terceros por N° + importe.
    alternativa: (o, datos) => {
      const num = String(o['N° de Cheque'] || '').trim();
      if (!num) return -1;
      if (o['Tipo'] === 'Emitido') {
        const k = claveCheque_(o['Banco'], num);
        return datos.findIndex(f => !String(f[iId] || '').trim() && f[iTipo] === 'Emitido' && claveCheque_(f[COL_BANCO_CHEQUE], f[COL_NUMERO_CHEQUE]) === k);
      }
      const imp = Math.abs(importeANumero(o['Importe']));
      return datos.findIndex(f => !String(f[iId] || '').trim() && f[iTipo] === 'De terceros' && String(f[COL_NUMERO_CHEQUE]).trim() === num &&
        Math.abs(Math.abs(importeANumero(f[iImporte])) - imp) < 0.01);
    }
  });
}

/** filas: [{fecha, cuentaId, banco, numero, moneda, saldo, tipo: 'Cuenta'|'FCI'}]. Reemplaza el de la misma cuenta y fecha. */
function importarSaldos_(filas, d, u) {
  const H = HEADERS_SALDOS;
  const hoja = obtenerHoja_(SHEET_SALDOS, H);
  const existentes = leerFilas_(SHEET_SALDOS, H);
  const indice = {};
  existentes.forEach((s, i) => { indice[s['Cuenta ID'] + '|' + s['Fecha']] = i; });
  const cuentas = leerFilas_(SHEET_CUENTAS, HEADERS_CUENTAS);
  const nuevas = [];
  let nuevos = 0, actualizados = 0, sinCambios = 0;
  filas.forEach(s => {
    const fecha = String(s.fecha || '').trim();
    if (fecha.split('/').length !== 3 || !String(s.saldo || '').trim()) return;
    let valores;
    if (s.tipo === 'FCI') {
      const banco = String(s.banco || '').trim();
      if (!banco) return;
      const moneda = s.moneda === 'USD' ? 'USD' : 'Pesos';
      valores = { 'Fecha': fecha, 'Banco': banco, 'N° de Cuenta': 'FCI', 'Cuenta ID': 'FCI|' + banco + '|' + moneda, 'Saldo': String(s.saldo).trim(), 'Moneda': moneda, 'Tipo': 'FCI' };
    } else {
      const c = cuentas.find(x => x['ID'] === String(s.cuentaId || ''));
      if (!c) return;
      valores = { 'Fecha': fecha, 'Banco': c['Banco'], 'N° de Cuenta': c['N° de Cuenta'], 'Cuenta ID': c['ID'], 'Saldo': String(s.saldo).trim(), 'Moneda': c['Moneda'] === 'USD' ? 'USD' : 'Pesos', 'Tipo': 'Cuenta' };
    }
    valores['Origen'] = String(s.origen || 'Planilla de flujo de fondos');
    valores['Cargado por'] = nombreDe_(u);
    valores['Fecha de Carga'] = ahoraTexto_();
    const k = valores['Cuenta ID'] + '|' + fecha;
    const idx = indice[k];
    if (idx !== undefined && idx < existentes.length) {
      if (String(existentes[idx]['Saldo']) === valores['Saldo']) { sinCambios++; return; }
      hoja.getRange(idx + 2, 1, 1, H.length).setNumberFormat('@').setValues([H.map(h => valores[h] == null ? '' : valores[h])]);
      existentes[idx] = valores;
      actualizados++;
      return;
    }
    if (idx !== undefined) { nuevas[idx - existentes.length] = H.map(h => valores[h] == null ? '' : valores[h]); return; }
    indice[k] = existentes.length + nuevas.length;
    nuevas.push(H.map(h => valores[h] == null ? '' : valores[h]));
    nuevos++;
  });
  if (nuevas.length) hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, H.length).setNumberFormat('@').setValues(nuevas);
  return { nuevos: nuevos, actualizados: actualizados, sinCambios: sinCambios };
}

function importarCompromisos_(filas, d, u) {
  const H = HEADERS_COMPROMISOS;
  return upsertPlanilla_(SHEET_COMPROMISOS, H, filas, {
    nueva: fila => {
      fila[H.indexOf('ID')] = Utilities.getUuid();
      fila[H.indexOf('Cargado por')] = nombreDe_(u);
      fila[H.indexOf('Fecha de Carga')] = ahoraTexto_();
    }
  });
}

// ======================= Compromisos =======================
// Pagos programados: planes de pago, pagos mensuales (alquileres, honorarios,
// servicios) y vencimientos de tarjetas. Los pendientes entran en el flujo de fondos.

function obtenerCompromisos_() {
  obtenerHoja_(SHEET_COMPROMISOS, HEADERS_COMPROMISOS);
  return { ok: true, filas: leerFilas_(SHEET_COMPROMISOS, HEADERS_COMPROMISOS).filter(c => c['ID']) };
}

/** d: {id (vacío = nuevo), fecha, categoria, concepto, detalle, cuenta, moneda, monto, estado, modo} */
function guardarCompromiso_(d, u) {
  return conLock_(() => {
    const fecha = String(d.fecha || '').trim();
    if (fecha.split('/').length !== 3) return { ok: false, error: 'La fecha va como dd/mm/aaaa.' };
    if (!String(d.concepto || '').trim()) return { ok: false, error: 'Falta el concepto.' };
    const H = HEADERS_COMPROMISOS;
    const hoja = obtenerHoja_(SHEET_COMPROMISOS, H);
    const filas = leerFilas_(SHEET_COMPROMISOS, H);
    const valores = {
      'Fecha de Vencimiento': fecha, 'Categoría': String(d.categoria || 'Otro').trim(), 'Concepto': String(d.concepto).trim(),
      'Detalle': String(d.detalle || '').trim(), 'Cuenta': String(d.cuenta || '').trim(), 'Moneda': d.moneda === 'USD' ? 'USD' : 'Pesos',
      'Monto': String(d.monto || '').trim(), 'Estado': d.estado === 'Pagado' ? 'Pagado' : 'Pendiente', 'Modo de Pago': String(d.modo || '').trim()
    };
    const idx = d.id ? filas.findIndex(c => c['ID'] === String(d.id)) : -1;
    if (d.id && idx < 0) return { ok: false, error: 'No se encontró el compromiso. Tocá Actualizar.' };
    if (idx >= 0) {
      const antes = filas[idx];
      const nuevo = Object.assign({}, antes, valores);
      hoja.getRange(idx + 2, 1, 1, H.length).setNumberFormat('@').setValues([H.map(h => nuevo[h] == null ? '' : String(nuevo[h]))]);
      const cambios = {};
      Object.keys(valores).forEach(k => { if (String(antes[k] || '') !== String(valores[k])) cambios[k] = valores[k]; });
      registrar_(u, 'Cambio de compromiso', valores['Concepto'] + ' · ' + fecha + (cambios['Estado'] ? ' · ' + cambios['Estado'] : ''), antes['ID'],
        Object.keys(cambios).reduce((a, k) => { a[k] = antes[k]; return a; }, {}), cambios);
      return { ok: true, id: antes['ID'] };
    }
    const nuevo = Object.assign({ 'ID': Utilities.getUuid(), 'Cargado por': nombreDe_(u), 'Fecha de Carga': ahoraTexto_(), 'ID Planilla': '' }, valores);
    hoja.getRange(hoja.getLastRow() + 1, 1, 1, H.length).setNumberFormat('@').setValues([H.map(h => nuevo[h] == null ? '' : String(nuevo[h]))]);
    registrar_(u, 'Alta de compromiso', valores['Concepto'] + ' · ' + fecha, nuevo['ID'], '', nuevo);
    return { ok: true, id: nuevo['ID'] };
  });
}

function eliminarCompromiso_(d, u) {
  return conLock_(() => {
    const H = HEADERS_COMPROMISOS;
    const hoja = obtenerHoja_(SHEET_COMPROMISOS, H);
    const filas = leerFilas_(SHEET_COMPROMISOS, H);
    const idx = filas.findIndex(c => c['ID'] === String(d.id || ''));
    if (idx < 0) return { ok: false, error: 'No se encontró el compromiso.' };
    hoja.deleteRow(idx + 2);
    registrar_(u, 'Baja de compromiso', filas[idx]['Concepto'] + ' · ' + filas[idx]['Fecha de Vencimiento'], filas[idx]['ID'], filas[idx], '');
    return { ok: true };
  });
}

// ======================= Facturas de proveedores (acceso restringido) =======================
// Sector aparte para cargar facturas recibidas y ver con qué transferencias o
// cheques se pagaron. Solo entran los usuarios habilitados: por defecto, el
// primer usuario creado (el dueño). Él puede habilitar a otros.
const PROP_FACTURAS_ACCESO = 'FACTURAS_ACCESO';

function idsAccesoFacturas_() {
  const v = propiedades_().getProperty(PROP_FACTURAS_ACCESO);
  if (v !== null && v !== undefined && v !== '') return String(v).split(',').filter(Boolean);
  const primero = leerUsuarios_()[0];
  return primero ? [primero['ID']] : [];
}

function tieneAccesoFacturas_(u) {
  return !!u && idsAccesoFacturas_().indexOf(u['ID']) >= 0;
}

function sinAccesoFacturas_() {
  return { ok: false, error: 'No tenés acceso al sector Facturas. Pedíselo a quien lo administra.' };
}

function claveFactura_(f) {
  return soloDigitos(f['CUIT']) + '|' + claveTexto(f['Tipo']) + '|' + sinCerosIzq_(soloDigitos(f['Punto de Venta'])) + '|' + sinCerosIzq_(soloDigitos(f['Número']));
}

function sinCerosIzq_(s) {
  let r = String(s || '');
  while (r.length > 1 && r.charAt(0) === '0') r = r.substring(1);
  return r;
}

function obtenerFacturas_(d, u) {
  if (!tieneAccesoFacturas_(u)) return sinAccesoFacturas_();
  obtenerHoja_(SHEET_FACTURAS, HEADERS_FACTURAS);
  return { ok: true, filas: leerFilas_(SHEET_FACTURAS, HEADERS_FACTURAS).filter(f => f['ID']) };
}

/** d.facturas: [{campo: valor}] con los títulos de HEADERS_FACTURAS. Descarta las repetidas (CUIT + tipo + punto de venta + número). */
function guardarFacturas_(d, u) {
  if (!tieneAccesoFacturas_(u)) return sinAccesoFacturas_();
  return conLock_(() => {
    const H = HEADERS_FACTURAS;
    const hoja = obtenerHoja_(SHEET_FACTURAS, H);
    const existentes = leerFilas_(SHEET_FACTURAS, H).filter(f => f['ID']);
    const claves = {};
    existentes.forEach(f => { claves[claveFactura_(f)] = true; });
    const nuevas = [], repetidas = [];
    (d.facturas || []).forEach(o => {
      const f = Object.assign({}, o);
      if (!String(f['Total'] || '').trim()) return;
      const k = claveFactura_(f);
      if (soloDigitos(f['Número']) && claves[k]) { repetidas.push((f['Proveedor'] || '') + ' ' + (f['Punto de Venta'] || '') + '-' + (f['Número'] || '')); return; }
      claves[k] = true;
      f['ID'] = Utilities.getUuid();
      f['Estado'] = f['Estado'] || 'Pendiente';
      f['Cargado por'] = nombreDe_(u);
      f['Fecha de Carga'] = ahoraTexto_();
      nuevas.push(H.map(h => f[h] == null ? '' : String(f[h]).trim()));
    });
    if (nuevas.length) hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, H.length).setNumberFormat('@').setValues(nuevas);
    if (nuevas.length) registrar_(u, 'Alta de facturas', nuevas.length + ' factura(s) cargada(s)' + (repetidas.length ? ' · ' + repetidas.length + ' repetida(s) descartada(s)' : ''), String(d.archivo || ''), '', '');
    return { ok: true, agregadas: nuevas.length, repetidas: repetidas };
  });
}

/** d.cambios: [{id, campos: {Estado, Pagos, Pagado, Notas, ...}}]. Guarda vínculos con pagos y estados. */
function actualizarFacturas_(d, u) {
  if (!tieneAccesoFacturas_(u)) return sinAccesoFacturas_();
  return conLock_(() => {
    const H = HEADERS_FACTURAS;
    const hoja = obtenerHoja_(SHEET_FACTURAS, H);
    const filas = leerFilas_(SHEET_FACTURAS, H);
    const editables = ['Fecha', 'Tipo', 'Punto de Venta', 'Número', 'Proveedor', 'CUIT', 'Total', 'Moneda', 'Vencimiento', 'Estado', 'Pagado', 'Pagos', 'Notas', 'Concepto'];
    let cambiadas = 0;
    const detalle = [];
    (d.cambios || []).forEach(c => {
      const idx = filas.findIndex(f => f['ID'] === String(c.id || ''));
      if (idx < 0) return;
      const f = filas[idx];
      const antes = {}, despues = {};
      Object.keys(c.campos || {}).forEach(k => {
        if (editables.indexOf(k) < 0) return;
        const v = String(c.campos[k] == null ? '' : c.campos[k]);
        if (String(f[k] || '') === v) return;
        antes[k] = f[k]; despues[k] = v; f[k] = v;
      });
      if (!Object.keys(despues).length) return;
      hoja.getRange(idx + 2, 1, 1, H.length).setNumberFormat('@').setValues([H.map(h => f[h] == null ? '' : String(f[h]))]);
      cambiadas++;
      delete antes['Pagos']; delete despues['Pagos'];
      detalle.push({ 'Factura': f['Proveedor'] + ' ' + f['Punto de Venta'] + '-' + f['Número'], 'Antes': antes, 'Después': despues });
    });
    if (cambiadas) registrar_(u, 'Facturas: pagos y estados', cambiadas + ' factura(s) actualizada(s)', '', '', textoCorto_(detalle));
    return { ok: true, cambiadas: cambiadas };
  });
}

function eliminarFactura_(d, u) {
  if (!tieneAccesoFacturas_(u)) return sinAccesoFacturas_();
  return conLock_(() => {
    const hoja = obtenerHoja_(SHEET_FACTURAS, HEADERS_FACTURAS);
    const filas = leerFilas_(SHEET_FACTURAS, HEADERS_FACTURAS);
    const idx = filas.findIndex(f => f['ID'] === String(d.id || ''));
    if (idx < 0) return { ok: false, error: 'No se encontró la factura.' };
    hoja.deleteRow(idx + 2);
    const f = filas[idx];
    registrar_(u, 'Baja de factura', f['Proveedor'] + ' ' + f['Punto de Venta'] + '-' + f['Número'] + ' · ' + f['Total'], f['ID'], f, '');
    return { ok: true };
  });
}

/** Quiénes entran a Facturas. d.ids: IDs de usuario (el que guarda siempre queda). */
function guardarAccesoFacturas_(d, u) {
  if (!tieneAccesoFacturas_(u)) return sinAccesoFacturas_();
  const ids = (d.ids || []).map(String).filter(Boolean);
  if (ids.indexOf(u['ID']) < 0) ids.push(u['ID']);
  const antes = idsAccesoFacturas_();
  propiedades_().setProperty(PROP_FACTURAS_ACCESO, ids.join(','));
  const nombres = {};
  leerUsuarios_().forEach(x => { nombres[x['ID']] = x['Nombre'] || x['Usuario']; });
  registrar_(u, 'Acceso a Facturas', 'Con acceso: ' + ids.map(i => nombres[i] || i).join(', '), '', antes.map(i => nombres[i] || i).join(', '), ids.map(i => nombres[i] || i).join(', '));
  return { ok: true, ids: ids };
}

function obtenerAccesoFacturas_(d, u) {
  if (!tieneAccesoFacturas_(u)) return sinAccesoFacturas_();
  return { ok: true, ids: idsAccesoFacturas_(), usuarios: leerUsuarios_().map(x => ({ id: x['ID'], nombre: x['Nombre'] || x['Usuario'], usuario: x['Usuario'], activo: x['Activo'] === 'Sí' })) };
}
// ======================= Unificación de cuentas y operaciones =======================
// Junta las cuentas cargadas dos veces con distinto formato (por ejemplo "1/6"
// leída de un comprobante y "166" o el CBU de la planilla) y deja todas las
// operaciones (movimientos, cheques y saldos) con el banco, tipo y N° de cuenta
// de la cuenta que queda. Desde el editor: revisarCuentasDuplicadas() solo
// informa; unificarCuentasDuplicadas() aplica los cambios.

/** 'dd/MM/yyyy HH:mm:ss' → 'yyyyMMddHHmmss', para comparar fechas de carga. */
function ordenFechaCarga_(s) {
  const t = String(s || '').trim();
  const p = t.split(' ');
  const f = (p[0] || '').split('/');
  if (f.length !== 3) return '';
  return f[2] + ('0' + f[1]).slice(-2) + ('0' + f[0]).slice(-2) + soloDigitos(p[1] || '');
}

/** Banco sin variantes de nombre: "BBVA Francés" = "BBVA", "Bco. de Córdoba" = "Bancor". */
function bancoCanon_(s) {
  const k = claveTexto(s);
  const mapa = [['bancor', 'bancor'], ['cordoba', 'bancor'], ['bbva', 'bbva'], ['frances', 'bbva'], ['nacion', 'nacion'],
    ['superv', 'supervielle'], ['galicia', 'galicia'], ['macro', 'macro'], ['santander', 'santander'], ['ciudad', 'ciudad'],
    ['hipotecario', 'hipotecario'], ['credicoop', 'credicoop'], ['patagonia', 'patagonia'], ['icbc', 'icbc'], ['hsbc', 'hsbc'],
    ['brubank', 'brubank'], ['mercado pago', 'mercadopago'], ['mercadopago', 'mercadopago'], ['provincia', 'provincia']];
  for (let i = 0; i < mapa.length; i++) if (k.indexOf(mapa[i][0]) >= 0) return mapa[i][1];
  return k.split(' ').filter(w => w && w !== 'banco' && w !== 'bco' && w !== 'bco.' && w !== 'de').join(' ');
}

function sinCerosIzqCta_(s) {
  let r = String(s || '');
  while (r.length > 1 && r.charAt(0) === '0') r = r.substring(1);
  return r;
}

function esDigito_(ch) {
  return ch >= '0' && ch <= '9';
}

/** "1/6" contra "166": mismo largo y un solo carácter distinto, que no es un número (error de lectura). */
function errorDeLectura_(texto, digitosOtra) {
  let r = String(texto || '').toUpperCase().split(' ').join('');
  let k = 0;
  while (k < r.length && !esDigito_(r.charAt(k))) k++;
  r = r.substring(k);
  while (r && !esDigito_(r.charAt(r.length - 1))) r = r.substring(0, r.length - 1);
  if (r.length < 3 || digitosOtra.length < r.length) return false;
  // Se compara con el final y el principio del número, con y sin el dígito verificador.
  const sinDv = digitosOtra.substring(0, digitosOtra.length - 1);
  const partes = [digitosOtra.slice(-r.length), digitosOtra.substring(0, r.length)];
  if (sinDv.length >= r.length) partes.push(sinDv.slice(-r.length));
  return partes.some(p => {
    let difs = 0, noNumero = false;
    for (let i = 0; i < r.length; i++) {
      if (r.charAt(i) === p.charAt(i)) continue;
      difs++;
      if (!esDigito_(r.charAt(i))) noNumero = true;
    }
    return difs === 1 && noNumero;
  });
}

/** Motivo por el que dos números de cuenta son la misma cuenta, o '' si no. */
function mismaCuentaMotivo_(textoA, cbuA, textoB, cbuB) {
  const ca = soloDigitos(cbuA), cb = soloDigitos(cbuB);
  const na = soloDigitos(textoA), nb = soloDigitos(textoB);
  if (ca.length === 22 && cb.length === 22) return ca === cb ? 'Mismo CBU' : '';
  if (na && na === nb) return 'Mismo número';
  const enCbu = (n, cbu) => {
    if (cbu.length !== 22 || n.length < 3) return false;
    if (n === cbu) return true;
    const bloque = sinCerosIzqCta_(cbu.substring(8, 21));
    return sinCerosIzqCta_(cbu.substring(8)) === sinCerosIzqCta_(n) || bloque === sinCerosIzqCta_(n) ||
      bloque.slice(-n.length) === n || bloque.indexOf(n) === 0;
  };
  if (enCbu(na, cb) || enCbu(nb, ca)) return 'El número está en el CBU';
  const corto = na.length <= nb.length ? na : nb, largo = na.length <= nb.length ? nb : na;
  const largoSinDv = largo.substring(0, largo.length - 1);
  if (corto.length >= 3 && corto !== largo && (largo.slice(-corto.length) === corto || largo.indexOf(corto) === 0 ||
    (largoSinDv.length > corto.length && largoSinDv.slice(-corto.length) === corto))) return 'Número abreviado';
  if (errorDeLectura_(textoA, nb || sinCerosIzqCta_(cb.substring(8))) || errorDeLectura_(textoB, na || sinCerosIzqCta_(ca.substring(8)))) return 'Error de lectura';
  return '';
}

function monedaCta_(v) {
  return String(v || '').toUpperCase().indexOf('USD') >= 0 ? 'USD' : 'ARS';
}

function usuarioEditor_() {
  let mail = '';
  try { mail = Session.getEffectiveUser().getEmail(); } catch (e) {}
  return { 'ID': '', 'Nombre': 'Editor de Apps Script', 'Usuario': mail || 'editor' };
}

/**
 * d.aplicar: false = solo informa qué haría; true = lo hace.
 * Devuelve {grupos, cambios, ambiguas, sinCuenta, totales}.
 */
function normalizarCuentas_(d, u) {
  const aplicar = !!(d && d.aplicar);
  const correr = () => {
    const cuentas = leerFilas_(SHEET_CUENTAS, HEADERS_CUENTAS).filter(c => c['ID']);
    const hojas = [
      { nombre: SHEET_TRANSFERENCIAS, H: HEADERS_TRANSFERENCIAS, etiqueta: 'Movimientos' },
      { nombre: SHEET_CHEQUES, H: HEADERS_CHEQUES, etiqueta: 'Cheques' }
    ];
    hojas.forEach(h => {
      const hoja = obtenerHoja_(h.nombre, h.H);
      const ult = hoja.getLastRow();
      h.hoja = hoja;
      h.iB = h.H.indexOf('Banco'); h.iT = h.H.indexOf('Tipo de Cuenta'); h.iN = h.H.indexOf('N° de Cuenta');
      h.iM = h.H.indexOf('Moneda'); h.iTipo = h.H.indexOf('Tipo');
      h.filas = ult > 1 ? hoja.getRange(2, 1, ult - 1, h.H.length).getDisplayValues() : [];
      h.cambiadas = {};
    });

    // Uso de cada cuenta (para elegir cuál queda).
    const usos = {};
    hojas.forEach(h => h.filas.forEach(f => {
      const k = bancoCanon_(f[h.iB]) + '|' + soloDigitos(f[h.iN]);
      usos[k] = (usos[k] || 0) + 1;
    }));
    const usoDe = c => usos[bancoCanon_(c['Banco']) + '|' + soloDigitos(c['N° de Cuenta'])] || 0;

    // 1. Cuentas duplicadas en el listado.
    const padre = cuentas.map((_, i) => i);
    const raiz = i => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; };
    const motivos = {};
    for (let i = 0; i < cuentas.length; i++) {
      for (let j = i + 1; j < cuentas.length; j++) {
        const a = cuentas[i], b = cuentas[j];
        if (bancoCanon_(a['Banco']) !== bancoCanon_(b['Banco']) || monedaCta_(a['Moneda']) !== monedaCta_(b['Moneda'])) continue;
        if (a['Tipo de Cuenta'] && b['Tipo de Cuenta'] && a['Tipo de Cuenta'] !== b['Tipo de Cuenta']) continue;
        const m = mismaCuentaMotivo_(a['N° de Cuenta'], a['CBU'], b['N° de Cuenta'], b['CBU']);
        if (!m) continue;
        const ra = raiz(i), rb = raiz(j);
        if (ra !== rb) padre[rb] = ra;
        motivos[i + '|' + j] = m;
      }
    }
    const porRaiz = {};
    cuentas.forEach((c, i) => { const r = raiz(i); (porRaiz[r] = porRaiz[r] || []).push(i); });
    const reemplazo = {};
    const grupos = [];
    Object.keys(porRaiz).forEach(r => {
      const idx = porRaiz[r];
      if (idx.length < 2) return;
      const puntaje = c => (soloDigitos(c['CBU']).length === 22 ? 100000 : 0) + usoDe(c) * 10 + (c['Alias'] ? 5 : 0) + (c['Titular'] ? 3 : 0) + soloDigitos(c['N° de Cuenta']).length;
      let queda = cuentas[idx[0]];
      idx.forEach(i => { if (puntaje(cuentas[i]) > puntaje(queda)) queda = cuentas[i]; });
      const sale = idx.map(i => cuentas[i]).filter(c => c !== queda);
      const razones = [];
      idx.forEach(i => idx.forEach(j => { const m = motivos[i + '|' + j]; if (m && razones.indexOf(m) < 0) razones.push(m); }));
      ['CBU', 'Alias', 'Titular', 'Tipo de Cuenta'].forEach(k => {
        if (String(queda[k] || '').trim()) return;
        const otra = sale.find(c => String(c[k] || '').trim());
        if (otra) queda[k] = otra[k];
      });
      sale.forEach(c => { reemplazo[c['ID']] = queda; });
      grupos.push({ queda: queda, sale: sale, motivos: razones });
    });
    const vigentes = cuentas.filter(c => !reemplazo[c['ID']]);

    // 2. Cada operación pasa al formato de su cuenta.
    const cambios = {}, ambiguas = {}, sinCuenta = {};
    const sumar = (obj, k, extra) => { if (!obj[k]) obj[k] = Object.assign({ cantidad: 0 }, extra); obj[k].cantidad++; };
    hojas.forEach(h => h.filas.forEach((f, i) => {
      const numero = String(f[h.iN] || '').trim();
      if (!numero || !String(f[h.iB] || '').trim()) return;
      const canon = bancoCanon_(f[h.iB]);
      const moneda = h.iM >= 0 && String(f[h.iM] || '').toUpperCase().indexOf('USD') >= 0 ? 'USD' : 'ARS';
      const tipo = String(f[h.iT] || '').trim();
      let cands = vigentes.filter(c => bancoCanon_(c['Banco']) === canon && monedaCta_(c['Moneda']) === moneda)
        .map(c => ({ c: c, m: mismaCuentaMotivo_(numero, '', c['N° de Cuenta'], c['CBU']) })).filter(x => x.m);
      if (tipo && cands.length > 1) {
        const mismoTipo = cands.filter(x => !x.c['Tipo de Cuenta'] || x.c['Tipo de Cuenta'] === tipo);
        if (mismoTipo.length) cands = mismoTipo;
      }
      if (cands.length > 1) {
        const exactos = cands.filter(x => x.m === 'Mismo número' || x.m === 'Mismo CBU');
        if (exactos.length === 1) cands = exactos;
      }
      const clave = f[h.iB] + '|' + numero;
      if (!cands.length) { sumar(sinCuenta, clave, { banco: f[h.iB], numero: numero }); return; }
      if (cands.length > 1) {
        sumar(ambiguas, clave, { banco: f[h.iB], numero: numero, opciones: cands.map(x => x.c['N° de Cuenta']) });
        return;
      }
      const c = cands[0].c;
      const nuevoTipo = c['Tipo de Cuenta'] || tipo;
      if (f[h.iB] === c['Banco'] && f[h.iN] === c['N° de Cuenta'] && f[h.iT] === nuevoTipo) return;
      sumar(cambios, h.etiqueta + '|' + f[h.iB] + '|' + tipo + '|' + numero, {
        hoja: h.etiqueta, antes: f[h.iB] + ' · ' + (tipo || 'sin tipo') + ' · ' + numero,
        despues: c['Banco'] + ' · ' + (nuevoTipo || 'sin tipo') + ' · ' + c['N° de Cuenta'], motivo: cands[0].m
      });
      f[h.iB] = c['Banco']; f[h.iT] = nuevoTipo; f[h.iN] = c['N° de Cuenta'];
      h.cambiadas[i] = true;
    }));

    // 3. Saldos de las cuentas eliminadas: pasan a la que queda (si coinciden el mismo día, queda el último cargado).
    const HS = HEADERS_SALDOS;
    const hojaS = obtenerHoja_(SHEET_SALDOS, HS);
    const ultS = hojaS.getLastRow();
    const saldos = ultS > 1 ? hojaS.getRange(2, 1, ultS - 1, HS.length).getDisplayValues() : [];
    const iId = HS.indexOf('Cuenta ID'), iF = HS.indexOf('Fecha'), iC = HS.indexOf('Fecha de Carga'), iSB = HS.indexOf('Banco'), iSN = HS.indexOf('N° de Cuenta');
    const saldoCambiado = {}, saldoBorrar = [];
    let saldosMovidos = 0;
    const porClave = {};
    saldos.forEach((f, i) => { if (!reemplazo[f[iId]]) porClave[f[iId] + '|' + f[iF]] = i; });
    saldos.forEach((f, i) => {
      const c = reemplazo[f[iId]];
      if (!c) return;
      saldosMovidos++;
      const k = c['ID'] + '|' + f[iF];
      const j = porClave[k];
      f[iId] = c['ID']; f[iSB] = c['Banco']; f[iSN] = c['N° de Cuenta'];
      if (j === undefined) { porClave[k] = i; saldoCambiado[i] = true; return; }
      if (ordenFechaCarga_(f[iC]) > ordenFechaCarga_(saldos[j][iC])) {
        saldos[j] = f.slice();
        saldoCambiado[j] = true;
      }
      saldoBorrar.push(i + 2);
    });

    const lista = o => Object.keys(o).map(k => o[k]).sort((a, b) => b.cantidad - a.cantidad);
    const informe = {
      grupos: grupos.map(g => ({
        banco: g.queda['Banco'], tipo: g.queda['Tipo de Cuenta'], moneda: monedaCta_(g.queda['Moneda']), motivos: g.motivos,
        queda: { numero: g.queda['N° de Cuenta'], cbu: g.queda['CBU'], usos: usoDe(g.queda) },
        sale: g.sale.map(c => ({ numero: c['N° de Cuenta'], cbu: c['CBU'], usos: usoDe(c) }))
      })),
      cambios: lista(cambios), ambiguas: lista(ambiguas), sinCuenta: lista(sinCuenta),
      totales: {
        cuentas: grupos.reduce((a, g) => a + g.sale.length, 0),
        movimientos: Object.keys(hojas[0].cambiadas).length, cheques: Object.keys(hojas[1].cambiadas).length, saldos: saldosMovidos
      },
      aplicado: aplicar
    };
    if (!aplicar) return informe;

    // Aplicar: columnas de banco, tipo y N° de cuenta de las operaciones.
    hojas.forEach(h => {
      if (!Object.keys(h.cambiadas).length) return;
      [h.iB, h.iT, h.iN].forEach(col => {
        h.hoja.getRange(2, col + 1, h.filas.length, 1).setNumberFormat('@').setValues(h.filas.map(f => [f[col]]));
      });
    });
    Object.keys(saldoCambiado).forEach(i => {
      const n = parseInt(i, 10);
      if (saldoBorrar.indexOf(n + 2) < 0) hojaS.getRange(n + 2, 1, 1, HS.length).setNumberFormat('@').setValues([saldos[n]]);
    });
    saldoBorrar.sort((a, b) => b - a).forEach(r => hojaS.deleteRow(r));
    const hojaC = obtenerHoja_(SHEET_CUENTAS, HEADERS_CUENTAS);
    grupos.forEach(g => {
      const fila = buscarFila_(hojaC, 0, v => v === g.queda['ID']);
      if (fila) hojaC.getRange(fila, 1, 1, HEADERS_CUENTAS.length).setNumberFormat('@').setValues([HEADERS_CUENTAS.map(h => g.queda[h] == null ? '' : String(g.queda[h]))]);
    });
    const filasBorrar = [];
    grupos.forEach(g => g.sale.forEach(c => { const f = buscarFila_(hojaC, 0, v => v === c['ID']); if (f) filasBorrar.push(f); }));
    filasBorrar.sort((a, b) => b - a).forEach(r => hojaC.deleteRow(r));
    const t = informe.totales;
    registrar_(u, 'Unificación de cuentas',
      t.cuentas + ' cuenta(s) duplicada(s) eliminada(s) · ' + t.movimientos + ' movimiento(s), ' + t.cheques + ' cheque(s) y ' + t.saldos + ' saldo(s) pasados al formato de su cuenta',
      '', { 'Cuentas eliminadas': grupos.map(g => ({ 'Queda': g.queda['Banco'] + ' ' + g.queda['N° de Cuenta'], 'Eliminadas': g.sale })) },
      { 'Cambios': informe.cambios.map(c => c.hoja + ': ' + c.antes + ' → ' + c.despues + ' (' + c.cantidad + ')') });
    return informe;
  };
  const res = aplicar ? conLock_(correr) : correr();
  res.ok = true;
  return res;
}

function textoInformeCuentas_(r) {
  const l = [];
  l.push(r.aplicado ? 'CAMBIOS APLICADOS' : 'REVISIÓN (no se cambió nada)');
  l.push('Cuentas duplicadas a eliminar: ' + r.totales.cuentas + ' · movimientos: ' + r.totales.movimientos + ' · cheques: ' + r.totales.cheques + ' · saldos: ' + r.totales.saldos);
  r.grupos.forEach(g => l.push('  ' + g.banco + ' ' + (g.tipo || '') + ' ' + g.moneda + ': queda ' + g.queda.numero + ' · se eliminan ' + g.sale.map(s => s.numero).join(', ') + ' (' + g.motivos.join(', ') + ')'));
  l.push('Operaciones que pasan al formato de su cuenta:');
  r.cambios.forEach(c => l.push('  ' + c.hoja + ': ' + c.antes + '  →  ' + c.despues + '  (' + c.cantidad + ', ' + c.motivo + ')'));
  if (r.ambiguas.length) {
    l.push('Sin tocar, podrían ser más de una cuenta:');
    r.ambiguas.forEach(a => l.push('  ' + a.banco + ' · ' + a.numero + ' (' + a.cantidad + ') → ' + a.opciones.join(' / ')));
  }
  if (r.sinCuenta.length) {
    l.push('Sin tocar, la cuenta no está en el listado:');
    r.sinCuenta.forEach(a => l.push('  ' + a.banco + ' · ' + a.numero + ' (' + a.cantidad + ')'));
  }
  return l.join('\n');
}

/** Ejecutala desde el editor para ver qué se unificaría (no cambia nada). */
function revisarCuentasDuplicadas() {
  Logger.log(textoInformeCuentas_(normalizarCuentas_({ aplicar: false }, usuarioEditor_())));
}

/** Ejecutala desde el editor para unificar cuentas y operaciones. */
function unificarCuentasDuplicadas() {
  Logger.log(textoInformeCuentas_(normalizarCuentas_({ aplicar: true }, usuarioEditor_())));
}

// ======================= FCI y Bolsa =======================

function obtenerFci_(d) {
  if (d && d.formato === 'gz') return filasComprimidas_(SHEET_FCI, HEADERS_FCI, !!d.forzar);
  return { ok: true, filas: leerFilas_(SHEET_FCI, HEADERS_FCI) };
}

function obtenerBolsa_(d) {
  if (d && d.formato === 'gz') return filasComprimidas_(SHEET_BOLSA, HEADERS_BOLSA, !!d.forzar);
  return { ok: true, filas: leerFilas_(SHEET_BOLSA, HEADERS_BOLSA) };
}

// ======================= Rescates y suscripciones de FCI =======================
// Se cargan en la app (a mano o traídos de Movimientos) y van a la misma hoja que
// el FCI de la planilla. El signo manda: en negativo es un rescate (sale del
// fondo) y en positivo una suscripción (entra al fondo). Con estos movimientos y
// los saldos de FCI que se cargan en Inicio, la página calcula el rendimiento.
// ID Planilla "FCIM-…": así la importación de la planilla no los pisa ni los duplica.

/** d.movs: [{fecha: dd/mm/aaaa, banco, fondo, moneda, monto, ref}] */
function guardarMovimientosFci_(d, u) {
  return conLock_(() => {
    const H = HEADERS_FCI;
    const iPor = H.indexOf('Importado por'), iFecha = H.indexOf('Fecha de Importación');
    const errores = [];
    const vistos = {};
    const filas = [];
    (d.movs || []).forEach((m, i) => {
      const fecha = String(m.fecha || '').trim();
      const p = fecha.split('/');
      const banco = String(m.banco || '').trim();
      const monto = importeANumero(m.monto);
      if (p.length !== 3 || p[2].length !== 4) { errores.push('Fila ' + (i + 1) + ': falta la fecha.'); return; }
      if (!banco) { errores.push('Fila ' + (i + 1) + ': falta el banco.'); return; }
      if (!monto) { errores.push('Fila ' + (i + 1) + ': falta el monto.'); return; }
      const moneda = m.moneda === 'USD' ? 'USD' : 'Pesos';
      const fondo = String(m.fondo || '').trim();
      const ref = String(m.ref || '').trim();
      const base = [p[2] + p[1] + p[0], claveTexto(banco), claveTexto(fondo), moneda, monto.toFixed(2), ref].join('|');
      vistos[base] = (vistos[base] || 0) + 1;
      const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, base + '|' + vistos[base])
        .slice(0, 5).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
      filas.push({
        'ID Planilla': 'FCIM-' + p[2] + p[1] + p[0] + '-' + hash, 'Persona': '', 'Fecha': fecha, 'Banco': banco, 'Fondo': fondo,
        'Movimiento': monto < 0 ? 'Rescate' : 'Suscripción', 'Solicitud o rendimiento': ref ? 'Mov. N° ' + ref : '',
        'Moneda': moneda, 'Monto': formatoPesos(monto).replace('$ ', '')
      });
    });
    if (errores.length) return { ok: false, error: errores.join(' ') };
    if (!filas.length) return { ok: false, error: 'No hay movimientos para guardar.' };
    const res = upsertPlanilla_(SHEET_FCI, H, filas, { nueva: fila => { fila[iPor] = nombreDe_(u); fila[iFecha] = ahoraTexto_(); } });
    registrar_(u, 'FCI: rescates y suscripciones', res.nuevos + ' movimiento(s) cargado(s)' + (res.sinCambios ? ' · ' + res.sinCambios + ' ya estaban' : ''),
      '', '', textoCorto_(filas.map(f => ({ 'Fecha': f['Fecha'], 'Banco': f['Banco'], 'Movimiento': f['Movimiento'], 'Monto': f['Monto'] }))));
    res.ok = true;
    return res;
  });
}

/** Borra un rescate o suscripción cargado en la app (no los de la planilla). d: {id} */
function eliminarMovimientoFci_(d, u) {
  return conLock_(() => {
    const id = String(d.id || '').trim();
    if (id.indexOf('FCIM-') !== 0) return { ok: false, error: 'Solo se pueden borrar los movimientos cargados en la app. Los de la planilla se corrigen en la planilla.' };
    const iId = HEADERS_FCI.indexOf('ID Planilla');
    const salen = eliminarFilasDonde_(SHEET_FCI, HEADERS_FCI, f => String(f[iId] || '').trim() === id);
    if (!salen.length) return { ok: false, error: 'No se encontró el movimiento.' };
    registrar_(u, 'FCI: movimiento eliminado', salen[0][HEADERS_FCI.indexOf('Movimiento')] + ' ' + salen[0][HEADERS_FCI.indexOf('Banco')] + ' del ' + salen[0][HEADERS_FCI.indexOf('Fecha')],
      id, filaComoObjeto_(HEADERS_FCI, salen[0]), '');
    return { ok: true };
  });
}

/** Borra de una hoja las filas que cumplen test(fila). Reescribe la hoja de una vez (rápido con miles de filas). */
function eliminarFilasDonde_(nombreHoja, H, test) {
  const hoja = obtenerHoja_(nombreHoja, H);
  const ult = hoja.getLastRow();
  if (ult < 2) return [];
  const rango = hoja.getRange(2, 1, ult - 1, H.length);
  const vals = rango.getDisplayValues();
  const quedan = [], salen = [];
  vals.forEach(f => (test(f) ? salen : quedan).push(f));
  if (!salen.length) return [];
  rango.clearContent();
  if (quedan.length) hoja.getRange(2, 1, quedan.length, H.length).setNumberFormat('@').setValues(quedan);
  hoja.deleteRows(quedan.length + 2, salen.length);
  return salen;
}

/**
 * Antes, el FCI iba a Movimientos (rescates y suscripciones) y a Saldos (saldos
 * históricos), y la Bolsa a Cheques. Ahora tienen su pestaña: se sacan esas
 * copias para que nada quede duplicado.
 */
function quitarCopiasViejas_(tipo, u) {
  let detalle = '';
  if (tipo === 'fci') {
    const H = HEADERS_TRANSFERENCIAS, iId = H.indexOf('ID Planilla'), iIns = H.indexOf('Instrumento');
    const movs = eliminarFilasDonde_(SHEET_TRANSFERENCIAS, H, f => String(f[iId] || '').indexOf('FCI-') === 0 || f[iIns] === 'FCI');
    const iOrigen = HEADERS_SALDOS.indexOf('Origen');
    const saldos = eliminarFilasDonde_(SHEET_SALDOS, HEADERS_SALDOS, f => f[iOrigen] === 'Planilla de flujo (FCI)');
    const conc = movs.filter(f => String(f[COL_CONC_TRANS] || '').trim()).length;
    if (movs.length || saldos.length) detalle = movs.length + ' movimiento(s) de FCI quitados de Movimientos' + (conc ? ' (' + conc + ' estaban conciliados)' : '') + ' · ' + saldos.length + ' saldo(s) históricos de FCI quitados de Saldos';
  } else {
    const H = HEADERS_CHEQUES, iId = H.indexOf('ID Planilla'), iCanal = H.indexOf('Canal');
    const ch = eliminarFilasDonde_(SHEET_CHEQUES, H, f => String(f[iId] || '').indexOf('BOLSA-') === 0 || f[iCanal] === 'Bolsa');
    if (ch.length) detalle = ch.length + ' cheque(s) de Bolsa quitados de Cheques';
  }
  if (detalle) registrar_(u, 'FCI y Bolsa a su pestaña', detalle + ' · ahora están en la pestaña FCI y Bolsa', '', '', '');
  return detalle;
}

function importarInversiones_(nombreHoja, H, filas, d, u) {
  const iPor = H.indexOf('Importado por'), iFecha = H.indexOf('Fecha de Importación');
  const res = upsertPlanilla_(nombreHoja, H, filas, {
    nueva: fila => { fila[iPor] = nombreDe_(u); fila[iFecha] = ahoraTexto_(); }
  });
  if (String(d.lote || 1) === '1') res.quitados = quitarCopiasViejas_(nombreHoja === SHEET_FCI ? 'fci' : 'bolsa', u);
  return res;
}

// ======================= Importe recibido en Bolsa =======================
// El costo de financiarse en bolsa sale de comparar el valor nominal del cheque
// con lo que efectivamente entró a la cuenta. Ese dato no está en la planilla:
// se carga a mano (o se confirma una sugerencia) y la importación no lo pisa.

/** d.cambios: [{id: ID Planilla, recibido: '1.234,56' | '', origen: 'Manual' | 'Sugerido'}] */
function guardarRecibidoBolsa_(d, u) {
  return conLock_(() => {
    const H = HEADERS_BOLSA;
    const hoja = obtenerHoja_(SHEET_BOLSA, H);
    const ult = hoja.getLastRow();
    if (ult < 2) return { ok: false, error: 'No hay cheques de bolsa cargados.' };
    const iId = H.indexOf('ID Planilla'), iRec = H.indexOf('Importe recibido'), iOri = H.indexOf('Origen del recibido');
    const ids = hoja.getRange(2, iId + 1, ult - 1, 1).getDisplayValues().map(f => String(f[0]).trim());
    const rango = hoja.getRange(2, iRec + 1, ult - 1, 2);
    const vals = rango.getDisplayValues();
    const detalle = [];
    (d.cambios || []).forEach(c => {
      const i = ids.indexOf(String(c.id || ''));
      if (i < 0) return;
      const rec = String(c.recibido || '').trim();
      if (rec && !(importeANumero(rec) > 0)) return;
      const nuevoOri = rec ? (c.origen === 'Sugerido' ? 'Sugerido (confirmado)' : 'Manual') : '';
      if (vals[i][0] === rec && vals[i][1] === nuevoOri) return;
      detalle.push({ 'Cheque': c.id, 'Antes': vals[i][0] || '—', 'Después': rec || '—' });
      vals[i][0] = rec;
      vals[i][1] = nuevoOri;
    });
    if (!detalle.length) return { ok: true, cambiados: 0 };
    rango.setNumberFormat('@').setValues(vals);
    registrar_(u, 'Bolsa: importe recibido', detalle.length + ' cheque(s) con importe recibido cargado o cambiado', '', '', textoCorto_(detalle));
    return { ok: true, cambiados: detalle.length };
  });
}

// ======================= Reporte mensual automático =======================
// El primer día hábil de cada mes se arma un reporte del mes anterior (saldos,
// FCI, movimientos, vencimientos y conciliaciones pendientes) y se envía por
// mail como PDF y, si se elige, un resumen por WhatsApp.
const FUNCION_REPORTE = 'revisarReporteMensual';
const ESTADOS_ABIERTOS_SRV = ['', 'pendiente', 'en cartera', 'custodia depositante'];

function reporteConfig_() {
  const p = propiedades_();
  return {
    activo: p.getProperty('REPORTE_ACTIVO') === 'si',
    emails: p.getProperty('REPORTE_EMAILS') || '',
    whatsapp: p.getProperty('REPORTE_WHATSAPP') === 'si',
    ultimo: p.getProperty('REPORTE_ULTIMO') || '',
    programado: ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === FUNCION_REPORTE)
  };
}

function obtenerReporteConfig_() {
  return { ok: true, config: reporteConfig_() };
}

function emailsValidos_(texto) {
  return String(texto || '').split(',').map(s => s.trim()).filter(Boolean).filter(s => {
    const at = s.indexOf('@');
    return at > 0 && s.indexOf('.', at) > at + 1 && s.indexOf(' ') < 0;
  });
}

/** d: {activo, emails, whatsapp} */
function guardarReporteConfig_(d, u) {
  const emails = emailsValidos_(d.emails);
  if (d.activo && !emails.length && !d.whatsapp) return { ok: false, error: 'Cargá al menos un mail o activá el resumen por WhatsApp.' };
  const p = propiedades_();
  const antes = reporteConfig_();
  p.setProperty('REPORTE_ACTIVO', d.activo ? 'si' : 'no');
  p.setProperty('REPORTE_EMAILS', emails.join(', '));
  p.setProperty('REPORTE_WHATSAPP', d.whatsapp ? 'si' : 'no');
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === FUNCION_REPORTE) ScriptApp.deleteTrigger(t); });
  if (d.activo) ScriptApp.newTrigger(FUNCION_REPORTE).timeBased().everyDays(1).atHour(8).create();
  registrar_(u, 'Reporte mensual', d.activo ? 'Activado · ' + (emails.join(', ') || 'sin mails') + (d.whatsapp ? ' · con WhatsApp' : '') : 'Desactivado', '',
    { 'Activo': antes.activo ? 'Sí' : 'No', 'Mails': antes.emails }, { 'Activo': d.activo ? 'Sí' : 'No', 'Mails': emails.join(', ') });
  return { ok: true, config: reporteConfig_() };
}

/** Primer día hábil (lunes a viernes) del mes de la fecha iso. */
function primerDiaHabil_(iso) {
  let dia = iso.substring(0, 8) + '01';
  while (diaSemana(dia) > 5) dia = sumarDias(dia, 1);
  return dia;
}

/** La ejecuta el activador todos los días a las 8; envía solo el primer día hábil del mes. */
function revisarReporteMensual() {
  const p = propiedades_();
  if (p.getProperty('REPORTE_ACTIVO') !== 'si') return;
  const hoy = ahoraLocal().hoy;
  if (hoy !== primerDiaHabil_(hoy) || p.getProperty('REPORTE_ULTIMO') === hoy.substring(0, 7)) return;
  try {
    enviarReporte_(null, hoy);
    p.setProperty('REPORTE_ULTIMO', hoy.substring(0, 7));
  } catch (e) {
    console.error('No se pudo enviar el reporte mensual: ' + e.message);
  }
}

function enviarReporteAhora_(d, u) {
  const r = enviarReporte_(u, ahoraLocal().hoy);
  return { ok: true, enviados: r };
}

function vistaPreviaReporte_() {
  const datos = datosReporte_(ahoraLocal().hoy);
  return { ok: true, html: htmlReporte_(datos), periodo: datos.periodo };
}

function dmaAIso_(s) {
  const p = String(s || '').trim().split('/');
  return p.length === 3 && p[2].length === 4 ? p[2] + '-' + ('0' + p[1]).slice(-2) + '-' + ('0' + p[0]).slice(-2) : '';
}

/** Datos del reporte: el mes anterior a la fecha y los próximos 30 días. */
function datosReporte_(hoy) {
  const finMes = sumarDias(hoy.substring(0, 8) + '01', -1);
  const iniMes = finMes.substring(0, 8) + '01';
  const limite = sumarDias(hoy, 30);
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const periodo = MESES[parseInt(finMes.substring(5, 7), 10) - 1] + ' ' + finMes.substring(0, 4);

  // Saldos: el último informado de cada cuenta y de cada FCI.
  const saldos = leerFilas_(SHEET_SALDOS, HEADERS_SALDOS);
  const ult = {};
  saldos.forEach(s => {
    const k = s['Cuenta ID'];
    if (!k) return;
    const iso = dmaAIso_(s['Fecha']);
    if (!ult[k] || iso > ult[k].iso || (iso === ult[k].iso && ordenFechaCarga_(s['Fecha de Carga']) > ordenFechaCarga_(ult[k].s['Fecha de Carga']))) ult[k] = { iso: iso, s: s };
  });
  const cuentas = [], fci = [];
  Object.keys(ult).forEach(k => {
    const s = ult[k].s;
    const fila = { banco: s['Banco'], cuenta: s['N° de Cuenta'], fecha: s['Fecha'], saldo: importeANumero(s['Saldo']), moneda: s['Moneda'] === 'USD' ? 'USD' : 'Pesos' };
    if (s['Tipo'] === 'FCI' || String(k).indexOf('FCI|') === 0) fci.push(fila); else cuentas.push(fila);
  });
  cuentas.sort((a, b) => (a.moneda + a.banco + a.cuenta).localeCompare(b.moneda + b.banco + b.cuenta));
  fci.sort((a, b) => b.saldo - a.saldo);

  // Movimientos del mes (en pesos, sin cuentas propias ni resúmenes ya conciliados).
  const movs = leerFilas_(SHEET_TRANSFERENCIAS, HEADERS_TRANSFERENCIAS);
  let ingresos = 0, egresos = 0, nMes = 0;
  const porDestino = {};
  movs.forEach(f => {
    const iso = dmaAIso_(f['Fecha del Movimiento'] || f['Fecha de Carga']);
    if (iso < iniMes || iso > finMes || f['Entre Cuentas Propias'] === 'Sí' || f['Moneda'] === 'USD') return;
    if (f['Origen'] === 'Resumen' && f['Conciliación']) return;
    const m = importeANumero(f['Monto']);
    nMes++;
    if (m >= 0) ingresos += m;
    else {
      egresos += m;
      const k = String(f['Destinatario'] || f['Concepto'] || 'Sin destinatario').trim();
      porDestino[k] = (porDestino[k] || 0) + m;
    }
  });
  const topEgresos = Object.keys(porDestino).map(k => ({ destino: k, monto: porDestino[k] })).sort((a, b) => a.monto - b.monto).slice(0, 5);

  // Vencimientos de los próximos 30 días.
  const abierto = (estado, conc) => !conc && ESTADOS_ABIERTOS_SRV.indexOf(claveTexto(estado)) >= 0;
  let chEmit = 0, chEmitN = 0, chTer = 0, chTerN = 0, bolsa = 0, bolsaN = 0, comp = 0, compN = 0;
  leerFilas_(SHEET_CHEQUES, HEADERS_CHEQUES).forEach(c => {
    if (!abierto(c['Estado'], c['Conciliación']) || c['Moneda'] === 'USD') return;
    const iso = dmaAIso_(c['Fecha de Pago'] || c['Fecha de Emisión']);
    if (!iso || iso > limite) return;
    const imp = Math.abs(importeANumero(c['Importe']));
    if (c['Tipo'] === 'Emitido') { chEmit += imp; chEmitN++; } else if (iso >= hoy) { chTer += imp; chTerN++; }
  });
  leerFilas_(SHEET_BOLSA, HEADERS_BOLSA).forEach(b => {
    if (!abierto(b['Condicion'], '')) return;
    const iso = dmaAIso_(b['Fecha de pago']);
    const m = importeANumero(b['Monto']);
    if (!iso || iso > limite || m >= 0) return;
    bolsa += -m; bolsaN++;
  });
  leerFilas_(SHEET_COMPROMISOS, HEADERS_COMPROMISOS).forEach(c => {
    if (!c['ID'] || c['Estado'] === 'Pagado' || c['Moneda'] === 'USD') return;
    const iso = dmaAIso_(c['Fecha de Vencimiento']);
    if (!iso || iso > limite) return;
    const m = Math.abs(importeANumero(c['Monto'])) || Math.abs(importeANumero(c['Monto Estimado']));
    comp += m; compN++;
  });

  // Conciliación pendiente: movimientos del resumen sin conciliar, por cuenta.
  const pend = {};
  movs.forEach(f => {
    if (f['Origen'] !== 'Resumen' || f['Conciliación']) return;
    const k = f['Banco'] + ' · ' + f['N° de Cuenta'];
    const iso = dmaAIso_(f['Fecha del Movimiento']);
    if (!pend[k]) pend[k] = { cuenta: k, n: 0, desde: iso };
    pend[k].n++;
    if (iso && iso < pend[k].desde) pend[k].desde = iso;
  });

  // FCI del mes: suscripciones y rescates.
  let susc = 0, resc = 0;
  leerFilas_(SHEET_FCI, HEADERS_FCI).forEach(f => {
    const iso = dmaAIso_(f['Fecha']);
    if (iso < iniMes || iso > finMes) return;
    const mov = claveTexto(f['Movimiento']);
    const m = importeANumero(f['Monto']);
    if (mov.indexOf('suscrip') === 0) susc += Math.abs(m);
    else if (mov.indexOf('rescate') === 0) resc += Math.abs(m);
  });

  return {
    empresa: empresa_(), periodo: periodo, hoy: hoy, cuentas: cuentas, fci: fci,
    mes: { ingresos: ingresos, egresos: egresos, n: nMes, topEgresos: topEgresos, susc: susc, resc: resc },
    proximos: { chEmit: chEmit, chEmitN: chEmitN, chTer: chTer, chTerN: chTerN, bolsa: bolsa, bolsaN: bolsaN, comp: comp, compN: compN },
    pendientes: Object.keys(pend).map(k => pend[k]).sort((a, b) => b.n - a.n)
  };
}

function escHtml_(s) {
  return String(s == null ? '' : s).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;');
}

function htmlReporte_(d) {
  const fmt = (n, usd) => (n < 0 ? '-' : '') + (usd ? 'U$S ' : '$ ') + formatoPesos(Math.abs(n)).substring(2);
  const td = (v, num) => '<td style="padding:6px 8px;border-bottom:1px solid #e3e8ef;' + (num ? 'text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;' : '') + '">' + v + '</td>';
  const th = (v, num) => '<th style="padding:6px 8px;background:#eef2f7;color:#3a4555;font-size:11px;text-align:' + (num ? 'right' : 'left') + ';">' + v + '</th>';
  const tabla = (cab, filas) => '<table style="width:100%;border-collapse:collapse;font-size:12px;margin:6px 0 14px;">' +
    '<tr>' + cab.map((c, i) => th(c, i > 0)).join('') + '</tr>' + filas.map(f => '<tr>' + f.map((v, i) => td(v, i > 0)).join('') + '</tr>').join('') + '</table>';
  const h2 = t => '<h2 style="font-size:14px;color:#0b1f3a;margin:18px 0 4px;">' + t + '</h2>';
  const totPesos = d.cuentas.filter(c => c.moneda === 'Pesos').reduce((a, c) => a + c.saldo, 0);
  const totFci = d.fci.filter(c => c.moneda === 'Pesos').reduce((a, c) => a + c.saldo, 0);
  const p = d.proximos;
  let html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#0f1b2d;max-width:760px;">' +
    '<div style="border-bottom:2px solid #0b1f3a;padding-bottom:8px;margin-bottom:10px;">' +
    '<div style="font-size:11px;letter-spacing:.08em;color:#8a6a2f;font-weight:bold;">TESORERÍA · ' + escHtml_(d.empresa) + '</div>' +
    '<div style="font-size:20px;font-weight:bold;color:#0b1f3a;">Reporte mensual · ' + escHtml_(d.periodo) + '</div>' +
    '<div style="font-size:11px;color:#5a6577;">Generado el ' + escHtml_(isoAMostrar(d.hoy)) + '. Saldos al último informado; vencimientos de los próximos 30 días.</div></div>';
  html += tabla(['Resumen', 'Importe'], [
    ['Saldo en cuentas (pesos)', fmt(totPesos)], ['Saldo en FCI (pesos)', fmt(totFci)], ['<b>Total de fondos</b>', '<b>' + fmt(totPesos + totFci) + '</b>'],
    ['Ingresos de ' + escHtml_(d.periodo), fmt(d.mes.ingresos)], ['Egresos de ' + escHtml_(d.periodo), fmt(d.mes.egresos)],
    ['<b>Resultado del mes</b>', '<b>' + fmt(d.mes.ingresos + d.mes.egresos) + '</b>']
  ]);
  html += h2('Saldos por cuenta') + tabla(['Cuenta', 'Fecha', 'Saldo'], d.cuentas.map(c => [escHtml_(c.banco + ' · ' + c.cuenta), escHtml_(c.fecha), fmt(c.saldo, c.moneda === 'USD')]));
  if (d.fci.length) html += h2('FCI por banco') + tabla(['Banco', 'Fecha', 'Saldo'], d.fci.map(c => [escHtml_(c.banco), escHtml_(c.fecha), fmt(c.saldo, c.moneda === 'USD')]));
  html += h2('Próximos 30 días') + tabla(['Concepto', 'Cantidad', 'Importe'], [
    ['Cheques emitidos a debitar', String(p.chEmitN), fmt(-p.chEmit)], ['Cheques de terceros a cobrar', String(p.chTerN), fmt(p.chTer)],
    ['Bolsa a pagar', String(p.bolsaN), fmt(-p.bolsa)], ['Compromisos (planes, pagos mensuales, tarjetas)', String(p.compN), fmt(-p.comp)],
    ['<b>Neto previsto</b>', '', '<b>' + fmt(p.chTer - p.chEmit - p.bolsa - p.comp) + '</b>']
  ]);
  if (d.mes.topEgresos.length) html += h2('Mayores egresos de ' + escHtml_(d.periodo)) + tabla(['Destinatario', 'Importe'], d.mes.topEgresos.map(e => [escHtml_(e.destino), fmt(e.monto)]));
  if (d.mes.susc || d.mes.resc) html += h2('FCI en ' + escHtml_(d.periodo)) + tabla(['Movimiento', 'Importe'], [['Suscripciones (entraron al fondo)', fmt(d.mes.susc)], ['Rescates (salieron del fondo)', fmt(-d.mes.resc)]]);
  html += h2('Conciliación bancaria pendiente') + (d.pendientes.length
    ? tabla(['Cuenta', 'Movimientos sin conciliar', 'Desde'], d.pendientes.map(x => [escHtml_(x.cuenta), String(x.n), escHtml_(isoAMostrar(x.desde))]))
    : '<p style="font-size:12px;">No hay movimientos del banco pendientes de conciliar.</p>');
  html += '<p style="font-size:10px;color:#8994a6;margin-top:18px;">Reporte automático de la app de Tesorería. Los datos salen de lo registrado en la app; no reemplaza la revisión de los extractos.</p></div>';
  return html;
}

/** Envía el reporte. Devuelve a quién se envió. */
function enviarReporte_(u, hoy) {
  const cfg = reporteConfig_();
  const d = datosReporte_(hoy);
  const html = htmlReporte_(d);
  const enviados = [];
  const emails = emailsValidos_(cfg.emails);
  if (emails.length) {
    const pdf = Utilities.newBlob('<html><body>' + html + '</body></html>', 'text/html', 'reporte.html').getAs('application/pdf').setName('Reporte tesorería ' + d.periodo + '.pdf');
    MailApp.sendEmail({ to: emails.join(','), subject: 'Tesorería ' + d.empresa + ' · Reporte de ' + d.periodo, htmlBody: html, attachments: [pdf], name: 'Tesorería ' + d.empresa });
    emails.forEach(e => enviados.push(e));
  }
  if (cfg.whatsapp) {
    const totPesos = d.cuentas.filter(c => c.moneda === 'Pesos').reduce((a, c) => a + c.saldo, 0) + d.fci.filter(c => c.moneda === 'Pesos').reduce((a, c) => a + c.saldo, 0);
    const p = d.proximos;
    const texto = '*Tesorería · Reporte de ' + d.periodo + '*\nFondos (cuentas + FCI): ' + formatoPesos(totPesos) +
      '\nResultado del mes: ' + formatoPesos(d.mes.ingresos + d.mes.egresos) +
      '\nPróximos 30 días: pagos ' + formatoPesos(-(p.chEmit + p.bolsa + p.comp)) + ' · cobros ' + formatoPesos(p.chTer) +
      (d.pendientes.length ? '\nSin conciliar: ' + d.pendientes.reduce((a, x) => a + x.n, 0) + ' movimiento(s)' : '') +
      (emails.length ? '\nEl detalle completo llegó por mail.' : '');
    leerUsuarios_().filter(x => x['Activo'] === 'Sí' && x['Teléfono WhatsApp'] && propiedades_().getProperty('WA_APIKEY_' + x['ID'])).forEach(x => {
      try { enviarWhatsapp_(x, texto); enviados.push('WhatsApp ' + (x['Nombre'] || x['Usuario'])); } catch (e) { console.error(e.message); }
    });
  }
  if (!enviados.length) throw new Error('No hay a quién enviar el reporte: cargá un mail o activá WhatsApp (y configurá tu WhatsApp en Alertas).');
  registrar_(u, 'Reporte mensual enviado', 'Reporte de ' + d.periodo + ' → ' + enviados.join(', '), '', '', '');
  return enviados;
}

/**
 * Convierte en PDF una hoja armada en el navegador (por ejemplo, el parte diario)
 * y la devuelve en base64 para descargarla. No lee ni cambia datos de la planilla.
 */
function pdfDeHtml_(d) {
  const html = String(d.html || '');
  if (!html) return { ok: false, error: 'No hay contenido para el PDF.' };
  if (html.length > 1500000) return { ok: false, error: 'El contenido es demasiado grande para el PDF.' };
  let nombre = String(d.nombre || 'documento').split('/').join('-').split('\\').join('-').trim().substring(0, 120) || 'documento';
  if (nombre.toLowerCase().slice(-4) !== '.pdf') nombre += '.pdf';
  const pdf = Utilities.newBlob(html, 'text/html', 'documento.html').getAs('application/pdf');
  return { ok: true, nombre: nombre, base64: Utilities.base64Encode(pdf.getBytes()) };
}

// ======================= Órdenes de pago (dentro de Facturas, acceso restringido) =======================
// Se generan solas, sin avisarle a quien carga el pago:
//  1. Si el concepto del pago (o "Factura Asociada") tiene un número de factura
//     (por ejemplo "FC A 0003-00012345"), se relaciona con esa factura.
//  2. Si no tiene número, se compara el concepto del pago con el "Concepto" que
//     se escribe a mano en la factura.
// Los pagos al mismo proveedor en el mismo día van en una sola orden. Solo se
// consideran los pagos desde la fecha configurada (OP_DESDE). Solo las ven los
// usuarios con acceso a Facturas.
const SHEET_ORDENES = 'Órdenes de Pago';
const HEADERS_ORDENES = ['N° OP', 'Fecha', 'Proveedor', 'CUIT', 'Moneda', 'Vínculo', 'Facturas', 'Pagos', 'Total facturas', 'Total pagado', 'Diferencia',
  'Estado', 'Observaciones', 'Generada', 'Actualizada', 'Clave'];
const PROP_OP_DESDE = 'OP_DESDE';
const PROP_OP_ULTIMO = 'OP_ULTIMO';
const ESTADOS_CHEQUE_SIN_PAGO_SRV = ['anulado', 'caducado', 'rechazado', 'devolucion'];
// Filas recién guardadas por guardarTransferencias_ / guardarCheques_ en esta ejecución.
let ULTIMOS_MOVS_GUARDADOS_ = [];
let ULTIMOS_CHEQUES_GUARDADOS_ = [];

function isoDeTexto_(s) {
  return dmaAIso_(String(s || '').trim().split(' ')[0]);
}

function textoComparable_(s) {
  const base = claveTexto(s);
  let r = '';
  for (let i = 0; i < base.length; i++) {
    const ch = base.charAt(i);
    r += (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') ? ch : ' ';
  }
  return r.split(' ').filter(Boolean).join(' ');
}

function numeroOrden_(n) {
  return 'OP-' + ('00000' + n).slice(-5);
}

function pagoDeMovimiento_(f) {
  if (!f || !f['N° Interno']) return null;
  if (f['Entre Cuentas Propias'] === 'Sí' || f['Origen'] === 'Resumen') return null;
  const m = importeANumero(f['Monto']);
  if (!(m < 0)) return null;
  const fecha = f['Fecha del Movimiento'] || String(f['Fecha de Carga'] || '').split(' ')[0];
  const efectivo = f['Instrumento'] === 'Efectivo';
  return {
    clave: 'mov:' + f['N° Interno'], tipo: 'mov', id: String(f['N° Interno']), fecha: fecha, iso: isoDeTexto_(fecha), importe: Math.round(-m * 100) / 100,
    moneda: f['Moneda'] === 'USD' ? 'USD' : 'Pesos', nombre: f['Destinatario'] || f['Contraparte'] || '', cuit: soloDigitos(f['CUIT Destino']),
    concepto: f['Concepto'] || '', texto: (f['Concepto'] || '') + ' ' + (f['Factura Asociada'] || ''),
    medio: efectivo ? 'Efectivo' : 'Transferencia',
    detalle: efectivo ? 'Efectivo' : [f['Banco'], [f['Tipo de Cuenta'], f['N° de Cuenta']].filter(Boolean).join(' '), f['N° de Referencia'] ? 'ref. ' + f['N° de Referencia'] : ''].filter(Boolean).join(' · '),
    destino: [f['Banco Destino'], f['Cuenta Destino']].filter(Boolean).join(' · ')
  };
}

function pagoDeCheque_(c) {
  if (!c) return null;
  const est = claveTexto(c['Estado']);
  if (ESTADOS_CHEQUE_SIN_PAGO_SRV.indexOf(est) >= 0) return null;
  if (c['Canal'] === 'Bolsa') return null;
  const imp = Math.abs(importeANumero(c['Importe']));
  if (!imp) return null;
  const id = c['ID Planilla'] ? 'P:' + c['ID Planilla'] : claveCheque_(c['Banco'], c['N° de Cheque']);
  const base = { clave: 'cheque:' + id, tipo: 'cheque', id: id, importe: Math.round(imp * 100) / 100, moneda: c['Moneda'] === 'USD' ? 'USD' : 'Pesos',
    concepto: c['Concepto'] || '', texto: c['Concepto'] || '', cheque: String(c['N° de Cheque'] || ''), fechaPago: c['Fecha de Pago'] || '' };
  if (c['Tipo'] === 'Emitido') {
    const fecha = c['Fecha de Emisión'] || c['Fecha de Pago'];
    return Object.assign(base, { fecha: fecha, iso: isoDeTexto_(fecha), nombre: c['Titular'] || c['Destino'] || '', cuit: soloDigitos(c['CUIT']), medio: 'Cheque',
      detalle: [c['Banco'], 'N° ' + c['N° de Cheque'], c['Fecha de Pago'] ? 'pago ' + c['Fecha de Pago'] : ''].filter(Boolean).join(' · '), destino: '' });
  }
  if (claveTexto(c['Estado']) === 'endosado' && c['Destino']) {
    const fecha = c['Fecha de Débito'] || c['Fecha de Pago'];
    return Object.assign(base, { fecha: fecha, iso: isoDeTexto_(fecha), nombre: c['Destino'], cuit: '', medio: 'Cheque de terceros endosado',
      detalle: ['N° ' + c['N° de Cheque'], c['Titular'] ? 'de ' + c['Titular'] : '', c['Fecha de Pago'] ? 'pago ' + c['Fecha de Pago'] : ''].filter(Boolean).join(' · '), destino: '' });
  }
  return null;
}

/**
 * Números de factura escritos en un texto: "FC A 0003-00012345", "Fact 3-12345 y 3-12346",
 * "NC 0001-00000123" o "0003-00012345" solo. Devuelve [{pv, num, nc, texto}].
 */
function refsFactura_(texto) {
  const crudo = claveTexto(texto);
  let limpio = '';
  for (let i = 0; i < crudo.length; i++) {
    const ch = crudo.charAt(i);
    limpio += (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '-' ? ch : ' ';
  }
  const toks = limpio.split(' ').filter(Boolean);
  const CLAVES = ['fc', 'fac', 'fact', 'factura', 'facturas', 'fca', 'fcb', 'fcc', 'fcm', 'ft', 'nc', 'ncr', 'nd'];
  const LETRAS = ['a', 'b', 'c', 'm', 'e'];
  const UNION = ['y', 'e', 'nro', 'nros', 'n', 'no', 'num', 'numero', 'numeros', 'n0'];
  const out = [];
  const vistos = {};
  const agregar = (pv, num, nc) => {
    const p = sinCerosIzq_(soloDigitos(pv)), n = sinCerosIzq_(soloDigitos(num));
    if (!n || n === '0') return;
    const k = p + '-' + n;
    if (vistos[k]) return;
    vistos[k] = true;
    out.push({ pv: p, num: n, nc: !!nc, texto: (p ? p + '-' : '') + n });
  };
  const esNumero = t => soloDigitos(t) === t && t.length > 0;
  const partirGuion = t => {
    const p = t.split('-').filter(x => x !== '');
    if (p.length === 2 && esNumero(p[0]) && esNumero(p[1]) && p[0].length <= 5 && p[1].length >= 1) return p;
    return null;
  };
  let modo = false, nc = false;
  for (let i = 0; i < toks.length; i++) {
    let t = toks[i];
    // "fc0003-00012345" o "fca3-123": clave pegada al número
    let pegada = '';
    CLAVES.forEach(k => { if (!pegada && t.length > k.length && t.indexOf(k) === 0 && (esNumero(t.charAt(k.length)) || (LETRAS.indexOf(t.charAt(k.length)) >= 0 && esNumero(t.charAt(k.length + 1) || '')))) pegada = k; });
    if (CLAVES.indexOf(t) >= 0 || pegada) {
      modo = true;
      nc = (pegada || t).indexOf('nc') === 0;
      if (!pegada) continue;
      t = t.substring(pegada.length);
      if (LETRAS.indexOf(t.charAt(0)) >= 0) t = t.substring(1);
    }
    const g = partirGuion(t);
    if (g && g[1].length >= 4) { agregar(g[0], g[1], nc); modo = true; continue; }
    if (modo) {
      if (LETRAS.indexOf(t) >= 0 || UNION.indexOf(t) >= 0) continue;
      if (g) { agregar(g[0], g[1], nc); continue; }
      if (esNumero(t)) { agregar('', t, nc); continue; }
      modo = false;
      nc = false;
    }
  }
  return out;
}

function proveedorParecido_(a, b) {
  const pa = textoComparable_(a).split(' ').filter(w => w.length >= 3 && ['srl', 'sas', 'sac', 'sociedad', 'anonima'].indexOf(w) < 0);
  const pb = ' ' + textoComparable_(b) + ' ';
  if (!pa.length) return false;
  return pa.filter(w => pb.indexOf(' ' + w + ' ') >= 0).length >= Math.min(2, pa.length);
}

/** Factura para un número escrito en el pago. null si no está cargada; {ambigua} si hay varias posibles. */
function facturaDeRef_(ref, pago, facturas) {
  let c = facturas.filter(f => sinCerosIzq_(soloDigitos(f['Número'])) === ref.num && (!ref.pv || sinCerosIzq_(soloDigitos(f['Punto de Venta'])) === ref.pv));
  if (c.length <= 1) return c[0] || null;
  const porCuit = pago.cuit ? c.filter(f => soloDigitos(f['CUIT']) === pago.cuit) : [];
  if (porCuit.length === 1) return porCuit[0];
  if (porCuit.length > 1) c = porCuit;
  const porNombre = c.filter(f => proveedorParecido_(f['Proveedor'], pago.nombre));
  if (porNombre.length === 1) return porNombre[0];
  return { ambigua: true, cantidad: c.length };
}

/** Sin número: el concepto del pago contra el "Concepto" escrito en la factura. */
function facturaPorConcepto_(pago, facturas) {
  const pc = textoComparable_(pago.concepto);
  if (pc.length < 3) return null;
  const c = facturas.filter(f => {
    const fc = textoComparable_(f['Concepto']);
    if (fc.length < 3 || f['Estado'] === 'Anulada') return false;
    return pc === fc || (' ' + pc + ' ').indexOf(' ' + fc + ' ') >= 0 || (pc.length >= 4 && (' ' + fc + ' ').indexOf(' ' + pc + ' ') >= 0);
  });
  if (!c.length) return null;
  const puntaje = f => (pago.cuit && soloDigitos(f['CUIT']) === pago.cuit ? 4 : 0) + (proveedorParecido_(f['Proveedor'], pago.nombre) ? 2 : 0) +
    (Math.abs(importeANumero(f['Total']) - pago.importe) <= Math.max(1, pago.importe * 0.001) ? 3 : 0) + (f['Estado'] !== 'Pagada' ? 1 : 0);
  c.sort((a, b) => puntaje(b) - puntaje(a) || isoDeTexto_(a['Fecha']).localeCompare(isoDeTexto_(b['Fecha'])));
  return c[0];
}

function itemFactura_(f, ref) {
  const pv = soloDigitos(f['Punto de Venta']), n = soloDigitos(f['Número']);
  const nc = claveTexto(f['Tipo']).indexOf('credito') >= 0;
  const total = importeANumero(f['Total']);
  return { id: f['ID'], comprobante: (f['Tipo'] || 'Factura') + ' ' + (pv ? ('00000' + pv).slice(-5) + '-' : '') + ('00000000' + n).slice(-8),
    fecha: f['Fecha'] || '', proveedor: f['Proveedor'] || '', cuit: f['CUIT'] || '', total: nc ? -Math.abs(total) : total, concepto: f['Concepto'] || '',
    ref: ref ? ref.texto : '', encontrada: true };
}

/** Facturas relacionadas con un pago: [{item}], y cómo se relacionó. */
function facturasDelPago_(pago, facturas) {
  const refs = refsFactura_(pago.texto);
  if (refs.length) {
    return { vinculo: 'Número de factura', items: refs.map(r => {
      const f = facturaDeRef_(r, pago, facturas);
      if (f && !f.ambigua) return itemFactura_(f, r);
      return { id: '', comprobante: (r.nc ? 'Nota de crédito ' : 'Factura ') + r.texto, fecha: '', proveedor: '', cuit: '', total: 0, ref: r.texto, nc: r.nc,
        encontrada: false, nota: f && f.ambigua ? 'Hay ' + f.cantidad + ' facturas con ese número: revisá cuál es.' : 'Todavía no está cargada en Facturas.' };
    }) };
  }
  const f = facturaPorConcepto_(pago, facturas);
  if (f) return { vinculo: 'Concepto', items: [itemFactura_(f, null)] };
  return null;
}

function leerOrdenes_() {
  obtenerHoja_(SHEET_ORDENES, HEADERS_ORDENES);
  return leerFilas_(SHEET_ORDENES, HEADERS_ORDENES).map((o, i) => Object.assign(o, { __fila: i + 2 })).filter(o => o['N° OP']);
}

function jsonSeguro_(s, defecto) {
  try { const v = JSON.parse(s || ''); return v == null ? defecto : v; } catch (e) { return defecto; }
}

function totalesOrden_(o, facturasItems, pagos) {
  const tf = facturasItems.reduce((a, x) => a + (Number(x.total) || 0), 0);
  const tp = pagos.reduce((a, x) => a + (Number(x.importe) || 0), 0);
  o['Facturas'] = JSON.stringify(facturasItems);
  o['Pagos'] = JSON.stringify(pagos);
  o['Total facturas'] = numeroATexto_(tf);
  o['Total pagado'] = numeroATexto_(tp);
  o['Diferencia'] = facturasItems.some(x => x.encontrada) ? numeroATexto_(tf - tp) : '';
  if (o['Estado'] !== 'Anulada') o['Estado'] = facturasItems.some(x => !x.encontrada) ? 'Falta factura' : 'Completa';
  o['Clave'] = pagos.map(p => p.clave).sort().join(';');
}

function numeroATexto_(n) {
  const neg = n < 0;
  const partes = Math.abs(Math.round(n * 100) / 100).toFixed(2).split('.');
  let ent = partes[0], r = '';
  while (ent.length > 3) { r = '.' + ent.slice(-3) + r; ent = ent.slice(0, -3); }
  return (neg ? '-' : '') + ent + r + ',' + partes[1];
}

function pagoParaOrden_(p) {
  return { clave: p.clave, tipo: p.tipo, id: p.id, medio: p.medio, fecha: p.fecha, importe: p.importe, detalle: p.detalle, destino: p.destino || '',
    concepto: p.concepto, cheque: p.cheque || '', fechaPago: p.fechaPago || '' };
}

/**
 * Agrega a órdenes de pago los pagos dados que todavía no están en ninguna.
 * Se llama con el lock tomado. Devuelve cuántas órdenes se crearon o actualizaron.
 */
function generarOrdenes_(pagos) {
  const desde = propiedades_().getProperty(PROP_OP_DESDE);
  if (!desde) return 0;
  const candidatos = pagos.filter(p => p && p.iso && p.iso >= desde);
  if (!candidatos.length) return 0;
  const H = HEADERS_ORDENES;
  const hoja = obtenerHoja_(SHEET_ORDENES, H);
  const ordenes = leerOrdenes_();
  const usados = {};
  ordenes.forEach(o => String(o['Clave'] || '').split(';').forEach(k => { if (k) usados[k] = true; }));
  const nuevos = candidatos.filter(p => !usados[p.clave]);
  if (!nuevos.length) return 0;
  obtenerHoja_(SHEET_FACTURAS, HEADERS_FACTURAS);
  const facturas = leerFilas_(SHEET_FACTURAS, HEADERS_FACTURAS).filter(f => f['ID']);
  const grupos = {};
  nuevos.forEach(p => {
    const rel = facturasDelPago_(p, facturas);
    if (!rel) return;
    const primera = rel.items.find(x => x.encontrada);
    const proveedor = primera ? primera.proveedor : p.nombre;
    const cuit = soloDigitos(primera ? primera.cuit : p.cuit);
    const k = p.iso + '|' + (cuit || textoComparable_(proveedor)) + '|' + p.moneda;
    const g = grupos[k] || (grupos[k] = { iso: p.iso, fecha: p.fecha, proveedor: proveedor, cuit: cuit, moneda: p.moneda, vinculos: {}, items: [], pagos: [] });
    g.vinculos[rel.vinculo] = true;
    rel.items.forEach(x => { if (!g.items.some(y => (x.id && y.id === x.id) || (!x.id && !y.id && y.ref === x.ref))) g.items.push(x); });
    g.pagos.push(pagoParaOrden_(p));
  });
  const p = propiedades_();
  let ultimo = parseInt(p.getProperty(PROP_OP_ULTIMO) || '0', 10) || 0;
  const ahora = ahoraTexto_();
  let cambios = 0;
  Object.keys(grupos).sort().forEach(k => {
    const g = grupos[k];
    // Mismo proveedor y mismo día: se suma a la orden que ya existe.
    const existente = ordenes.find(o => o['Estado'] !== 'Anulada' && isoDeTexto_(o['Fecha']) === g.iso && o['Moneda'] === g.moneda &&
      ((g.cuit && soloDigitos(o['CUIT']) === g.cuit) || (!g.cuit && textoComparable_(o['Proveedor']) === textoComparable_(g.proveedor))));
    if (existente) {
      const items = jsonSeguro_(existente['Facturas'], []);
      g.items.forEach(x => { if (!items.some(y => (x.id && y.id === x.id) || (!x.id && !y.id && y.ref === x.ref))) items.push(x); });
      const pagosO = jsonSeguro_(existente['Pagos'], []).concat(g.pagos);
      const vinc = {};
      String(existente['Vínculo'] || '').split(' y ').forEach(v => { if (v) vinc[v] = true; });
      Object.keys(g.vinculos).forEach(v => { vinc[v] = true; });
      existente['Vínculo'] = Object.keys(vinc).join(' y ');
      totalesOrden_(existente, items, pagosO);
      existente['Actualizada'] = ahora;
      hoja.getRange(existente.__fila, 1, 1, H.length).setNumberFormat('@').setValues([H.map(h => existente[h] == null ? '' : String(existente[h]))]);
    } else {
      ultimo++;
      const o = { 'N° OP': numeroOrden_(ultimo), 'Fecha': g.fecha, 'Proveedor': g.proveedor, 'CUIT': g.cuit, 'Moneda': g.moneda, 'Vínculo': Object.keys(g.vinculos).join(' y '),
        'Estado': '', 'Observaciones': '', 'Generada': ahora, 'Actualizada': '' };
      totalesOrden_(o, g.items, g.pagos);
      hoja.getRange(hoja.getLastRow() + 1, 1, 1, H.length).setNumberFormat('@').setValues([H.map(h => o[h] == null ? '' : String(o[h]))]);
      o.__fila = hoja.getLastRow();
      ordenes.push(o);
    }
    cambios++;
  });
  p.setProperty(PROP_OP_ULTIMO, String(ultimo));
  return cambios;
}

/** Vuelve a buscar las facturas que faltaban (por ejemplo, cargadas después del pago). */
function completarOrdenes_() {
  const H = HEADERS_ORDENES;
  const ordenes = leerOrdenes_().filter(o => o['Estado'] === 'Falta factura');
  if (!ordenes.length) return 0;
  const hoja = obtenerHoja_(SHEET_ORDENES, H);
  const facturas = leerFilas_(SHEET_FACTURAS, HEADERS_FACTURAS).filter(f => f['ID']);
  let cambios = 0;
  ordenes.forEach(o => {
    const pagos = jsonSeguro_(o['Pagos'], []);
    const pagoRef = { cuit: soloDigitos(o['CUIT']), nombre: o['Proveedor'] };
    let tocada = false;
    const items = jsonSeguro_(o['Facturas'], []).map(x => {
      if (x.encontrada || !x.ref) return x;
      const partes = x.ref.split('-');
      const ref = partes.length === 2 ? { pv: partes[0], num: partes[1], texto: x.ref } : { pv: '', num: x.ref, texto: x.ref };
      const f = facturaDeRef_(ref, pagoRef, facturas);
      if (f && !f.ambigua) { tocada = true; return itemFactura_(f, ref); }
      return x;
    });
    if (!tocada) return;
    const primera = items.find(x => x.encontrada);
    if (primera && !soloDigitos(o['CUIT'])) { o['Proveedor'] = primera.proveedor; o['CUIT'] = soloDigitos(primera.cuit); }
    totalesOrden_(o, items, pagos);
    o['Actualizada'] = ahoraTexto_();
    hoja.getRange(o.__fila, 1, 1, H.length).setNumberFormat('@').setValues([H.map(h => o[h] == null ? '' : String(o[h]))]);
    cambios++;
  });
  return cambios;
}

/** Todos los pagos del período (desde OP_DESDE). */
function pagosDelPeriodo_() {
  const desde = propiedades_().getProperty(PROP_OP_DESDE) || '';
  const lista = [];
  leerFilas_(SHEET_TRANSFERENCIAS, HEADERS_TRANSFERENCIAS).forEach(f => { const p = pagoDeMovimiento_(f); if (p && p.iso >= desde) lista.push(p); });
  leerFilas_(SHEET_CHEQUES, HEADERS_CHEQUES).forEach(c => { const p = pagoDeCheque_(c); if (p && p.iso >= desde) lista.push(p); });
  return lista;
}

/** Se llama al guardar movimientos o cheques. Nunca corta ni cambia la respuesta del guardado. */
function ordenesEnSilencio_(pagos) {
  try {
    if (!propiedades_().getProperty(PROP_OP_DESDE) || !pagos.length) return;
    conLock_(() => generarOrdenes_(pagos));
  } catch (e) {
    Logger.log('Órdenes de pago: ' + e.message);
  }
}

function guardarTransferenciasConOrdenes_(d, u) {
  ULTIMOS_MOVS_GUARDADOS_ = [];
  const r = guardarTransferencias_(d, u);
  ordenesEnSilencio_(ULTIMOS_MOVS_GUARDADOS_.map(pagoDeMovimiento_).filter(Boolean));
  return r;
}

function guardarChequesConOrdenes_(d, u) {
  ULTIMOS_CHEQUES_GUARDADOS_ = [];
  const r = guardarCheques_(d, u);
  ordenesEnSilencio_(ULTIMOS_CHEQUES_GUARDADOS_.map(pagoDeCheque_).filter(Boolean));
  return r;
}

function respuestaOrdenes_() {
  const ordenes = leerOrdenes_().map(o => { const x = Object.assign({}, o); delete x.__fila; return x; });
  const usados = {};
  ordenes.forEach(o => String(o['Clave'] || '').split(';').forEach(k => { if (k) usados[k] = true; }));
  const sinRelacionar = pagosDelPeriodo_().filter(p => !usados[p.clave]).sort((a, b) => b.iso.localeCompare(a.iso)).slice(0, 300)
    .map(p => ({ clave: p.clave, medio: p.medio, fecha: p.fecha, importe: p.importe, moneda: p.moneda, nombre: p.nombre, concepto: p.concepto, detalle: p.detalle }));
  return { ok: true, desde: propiedades_().getProperty(PROP_OP_DESDE) || '', ordenes: ordenes.reverse(), sinRelacionar: sinRelacionar };
}

/** Trae las órdenes. La primera vez activa la generación desde hoy. Antes de responder, completa lo pendiente. */
function obtenerOrdenesPago_(d, u) {
  if (!tieneAccesoFacturas_(u)) return sinAccesoFacturas_();
  const p = propiedades_();
  if (!p.getProperty(PROP_OP_DESDE)) p.setProperty(PROP_OP_DESDE, ahoraLocal().hoy);
  conLock_(() => {
    generarOrdenes_(pagosDelPeriodo_());
    completarOrdenes_();
  });
  return respuestaOrdenes_();
}

/** d.desde: aaaa-mm-dd. Cambia desde qué fecha se generan órdenes (las ya generadas no se borran). */
function configurarOrdenesPago_(d, u) {
  if (!tieneAccesoFacturas_(u)) return sinAccesoFacturas_();
  const desde = String(d.desde || '');
  if (desde.length !== 10 || desde.charAt(4) !== '-' || desde.charAt(7) !== '-') return { ok: false, error: 'Elegí una fecha válida.' };
  const antes = propiedades_().getProperty(PROP_OP_DESDE) || '';
  propiedades_().setProperty(PROP_OP_DESDE, desde);
  registrar_(u, 'Órdenes de pago', 'Se generan desde el ' + isoAMostrar(desde), '', antes ? isoAMostrar(antes) : '', isoAMostrar(desde));
  return obtenerOrdenesPago_(d, u);
}

/** d: {numero, observaciones?, anular?: bool, motivo?} */
function actualizarOrdenPago_(d, u) {
  if (!tieneAccesoFacturas_(u)) return sinAccesoFacturas_();
  return conLock_(() => {
    const H = HEADERS_ORDENES;
    const hoja = obtenerHoja_(SHEET_ORDENES, H);
    const o = leerOrdenes_().find(x => x['N° OP'] === String(d.numero || ''));
    if (!o) return { ok: false, error: 'No se encontró la orden.' };
    const antes = { 'Estado': o['Estado'], 'Observaciones': o['Observaciones'] };
    if (d.observaciones !== undefined) o['Observaciones'] = String(d.observaciones || '').trim();
    if (d.anular) {
      o['Estado'] = 'Anulada';
      o['Observaciones'] = (o['Observaciones'] ? o['Observaciones'] + ' · ' : '') + 'Anulada el ' + ahoraTexto_() + ' por ' + nombreDe_(u) + (d.motivo ? ': ' + String(d.motivo).trim() : '');
    }
    o['Actualizada'] = ahoraTexto_();
    hoja.getRange(o.__fila, 1, 1, H.length).setNumberFormat('@').setValues([H.map(h => o[h] == null ? '' : String(o[h]))]);
    registrar_(u, d.anular ? 'Orden de pago anulada' : 'Orden de pago editada', o['N° OP'] + ' · ' + o['Proveedor'], o['N° OP'], antes, { 'Estado': o['Estado'], 'Observaciones': o['Observaciones'] });
    const x = Object.assign({}, o);
    delete x.__fila;
    return { ok: true, orden: x };
  });
}

// ======================= Propiedades =======================
// Liquidaciones mensuales de alquileres de cada edificio (por ejemplo "Calle
// Ejemplo 123 · Octubre/26"). La página bgpsammar.com/propiedades.html lee la
// planilla de Excel del mes y manda lo leído; acá se guarda como JSON, una fila por
// edificio y período. Los datos (inquilinos, montos, patentes) viven solo en esta
// planilla: el repositorio y la página son públicos, así que nunca van ahí.
const SHEET_PROPIEDADES = 'Propiedades';
const HEADERS_PROPIEDADES = ['Edificio', 'Período', 'Orden', 'Datos', 'Archivo', 'Cargado por', 'Fecha de Carga'];
const MAX_DATOS_PROPIEDAD = 48000;

function obtenerPropiedades_() {
  obtenerHoja_(SHEET_PROPIEDADES, HEADERS_PROPIEDADES);
  const lista = leerFilas_(SHEET_PROPIEDADES, HEADERS_PROPIEDADES).filter(f => f['Edificio'] && f['Datos']).map(f => {
    let datos = null;
    try { datos = JSON.parse(f['Datos']); } catch (e) {}
    return { edificio: f['Edificio'], periodo: f['Período'], orden: f['Orden'], datos: datos, archivo: f['Archivo'], cargadoPor: f['Cargado por'], fechaCarga: f['Fecha de Carga'] };
  }).filter(x => x.datos);
  return { ok: true, liquidaciones: lista };
}

/** d.datos: la liquidación leída del Excel {edificio, periodo, orden, ...}; d.archivo: nombre del archivo. */
function guardarPropiedades_(d, u) {
  const datos = d && d.datos;
  if (!datos || typeof datos !== 'object') return { ok: false, error: 'No llegaron los datos de la planilla.' };
  const edificio = String(datos.edificio || '').trim(), periodo = String(datos.periodo || '').trim();
  if (!edificio || !periodo) return { ok: false, error: 'La planilla no tiene el edificio y el período en el título (por ejemplo "CALLE EJEMPLO NRO. 123 : Octubre/26").' };
  const texto = JSON.stringify(datos);
  if (texto.length > MAX_DATOS_PROPIEDAD) return { ok: false, error: 'La planilla es demasiado grande para guardarla.' };
  return conLock_(() => {
    const hoja = obtenerHoja_(SHEET_PROPIEDADES, HEADERS_PROPIEDADES);
    const filas = leerFilas_(SHEET_PROPIEDADES, HEADERS_PROPIEDADES);
    const idx = filas.findIndex(f => claveTexto(f['Edificio']) === claveTexto(edificio) && claveTexto(f['Período']) === claveTexto(periodo));
    const valores = {
      'Edificio': edificio, 'Período': periodo, 'Orden': String(datos.orden || ''), 'Datos': texto,
      'Archivo': String(d.archivo || (idx >= 0 ? filas[idx]['Archivo'] : '') || ''), 'Cargado por': nombreDe_(u), 'Fecha de Carga': ahoraTexto_()
    };
    const fila = idx >= 0 ? idx + 2 : hoja.getLastRow() + 1;
    hoja.getRange(fila, 1, 1, HEADERS_PROPIEDADES.length).setNumberFormat('@').setValues([HEADERS_PROPIEDADES.map(h => valores[h])]);
    const n = (datos.unidades || []).length;
    registrar_(u, idx >= 0 ? 'Propiedades: liquidación actualizada' : 'Propiedades: liquidación cargada',
      edificio + ' · ' + periodo + ' · ' + n + ' unidad(es)' + (d.archivo ? ' · ' + d.archivo : ''), edificio + ' · ' + periodo, '', '');
    return { ok: true, reemplazada: idx >= 0 };
  });
}
