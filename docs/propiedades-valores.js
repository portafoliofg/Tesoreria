/*
 * Propiedades · valores y detalle de cada unidad (botón "i" de la pestaña Unidades).
 *
 * Valor real, precio de compra y valor de venta estimado, más el detalle: dormitorios,
 * destino y cochera. Todo se carga a mano; el rendimiento se calcula solo: alquiler
 * mensual × 12 sobre el precio de compra. El alquiler es el del contrato (Contratos) o,
 * si no hay contrato, lo que pagó la unidad en la liquidación que se está viendo.
 * Los datos viven en una planilla de Google aparte (PropiedadesValores.gs), nunca en esta página.
 *
 * PropValores.cargar(edificio) → Promise   (lo llama propiedades-vista.js al mostrar un edificio)
 * PropValores.de(u, lugar) → {valorReal, precioCompra, ventaEstimada, dormitorios, destino, cochera, estimados, ...} o null
 * PropValores.esEstimado(v, campo) → true si ese importe es el estimado de la zona
 * PropValores.configurarZona(lugar, unidades, tc) → reparte la compra total del lugar (Saavedra: USD 780.000)
 * PropValores.rendimiento(v, alquiler) → número (0,062 = 6,2 % anual) o null
 * PropValores.calculo(v, ctx) → {alquiler, gastos, neto, bruto, rendNeto} por mes (rendimientos anuales sobre la compra)
 * PropValores.botonInfo(u, ctx) → botón "i" que abre el detalle (con las cuentas de municipalidad, aguas y rentas).
 * PropValores.botonCuentas({edificio, unidades, alGuardar}) → botón para pegar el listado de cuentas de impuestos.
 *   ctx: {edificio, lugar, alquiler, fuente, adm, arreglosMes, alGuardar}
 *   adm: administración del mes y arreglosMes: promedio mensual de arreglos (los descuenta la liquidación).
 * PropValores.parametros() / guardarParametros(edificio, {costosVenta, tasaAlternativa}) → para Rentabilidad
 * PropValores.url() → enlace a la planilla de valores
 *
 * Rendimiento neto: (alquiler − administración − arreglos − gastos mensuales del dueño) × 12 / compra.
 *
 * Valores estimados: las unidades de Saavedra que todavía no tienen un importe cargado usan
 * valores genéricos de la zona (ESTIMADOS), marcados como estimados. No se guardan en la
 * planilla: en cuanto se carga el valor real en la ficha, ese reemplaza al estimado.
 * PropValores.de(u, lugar) los incluye (v.estimados = campos estimados); la ficha los muestra
 * como sugerencia.
 */
(function () {
  "use strict";
  var DESTINOS = ["Vivienda", "Comercial", "Oficina", "Cochera", "Depósito", "Otro"];
  var estado = { edificio: null, valores: [], url: "", parametros: null, cargando: null, listo: false, error: "" };
  var dialogo = null;
  // Valores genéricos para Saavedra (octubre de 2026), en dólares, por tipo de unidad:
  //   1 dormitorio: USD 40.000 a 45.000 · 2 dormitorios: USD 62.000 a 65.000 · locales: USD 35.000 a 60.000.
  // Se usa el promedio de cada rango, tanto para el valor real como para la venta estimada.
  // Se pasan a pesos con el Dólar Blue.
  // La compra NO sale de acá: es lo que se invirtió (compraTotalUSD), repartido entre las unidades.
  // Vivienda según los dormitorios (sin dato, 1 dormitorio; 0 usa el de 1 y 3 o más el de 2).
  // Gastos mensuales (en pesos): ABL, expensas a cargo del dueño y seguro.
  function promedio(r) { return (r[0] + r[1]) / 2; }
  var ESTIMADOS = {
    lugares: ["saavedra"],
    viviendaUSD: [promedio([40000, 45000]), promedio([40000, 45000]), promedio([62000, 65000]), promedio([62000, 65000])],  // 0, 1, 2 y 3 o más dormitorios
    cocheraUSD: 12000,
    comercialUSD: promedio([35000, 60000]),
    gastosVivienda: 90000, gastosCochera: 25000, gastosComercial: 120000,
    venta: 1,  // venta estimada sobre el valor real (los dos con el promedio)
    // Compra real de todo el lugar, en dólares: se reparte entre sus unidades según el valor
    // de mercado de cada una (una cochera recibe menos que un departamento).
    compraTotalUSD: { saavedra: 780000 },
    compraSinTotal: 0.88,  // lugares sin compra total: compra ≈ 88 % del valor de mercado
    dolar: 1450  // si no hay cotización del Dólar Blue
  };
  var zonas = {};  // clave(lugar) → {total en pesos, peso: suma de valores de mercado (USD) de sus unidades}
  var cotiz = ESTIMADOS.dolar;  // pesos por dólar para los estimados

  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined && txt !== null) n.textContent = txt; return n; }
  var fmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  function pesos(n) { return typeof n === "number" && !isNaN(n) ? fmt.format(n) : "—"; }
  function pct(n) { return typeof n === "number" && isFinite(n) ? (n * 100).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + " %" : "—"; }
  function clave(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim(); }
  function numero(txt) {
    var t = String(txt == null ? "" : txt).replace(/[^0-9,.\-]/g, "");
    if (!t || t === "-") return null;
    var c = t.lastIndexOf(","), p = t.lastIndexOf(".");
    // 1.234,56 · 450.000 (punto de miles) · 1234.56
    if (c > p) t = t.split(".").join("").replace(",", ".");
    else if (c < 0 && /^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.split(".").join("");
    else t = t.split(",").join("");
    var n = parseFloat(t);
    return isNaN(n) ? null : n;
  }
  function numTxt(n) { return typeof n === "number" ? n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : ""; }
  function claveDe(u) { return u.clave || u.unidad; }

  function cargar(edificio) {
    if (estado.edificio === edificio && estado.cargando) return estado.cargando;
    estado.edificio = edificio;
    estado.error = "";
    estado.listo = false;
    estado.cargando = BGPSesion.pedir("obtenerValoresPropiedades", { edificio: edificio }).then(function (r) {
      if (estado.edificio !== edificio) return;
      estado.valores = r.valores || [];
      estado.url = r.url || "";
      estado.parametros = r.parametros || null;
      estado.unidadesMapa = r.unidadesMapa || [];
      if (r.destinos && r.destinos.length) DESTINOS = r.destinos;
      estado.listo = true;
    }).catch(function (err) {
      if (err && err.sesion === false) throw err;
      estado.error = (err && err.message) || "No se pudieron cargar los valores de las unidades.";
      estado.valores = []; estado.listo = true;
    });
    return estado.cargando;
  }

  // Lo cargado en la planilla para la unidad (sin estimados).
  function cargado(u) {
    if (!estado.listo) return null;
    var k = clave(claveDe(u)), n = clave(u.unidad);
    return estado.valores.find(function (v) { return clave(v.clave) === k; }) ||
      estado.valores.find(function (v) { return clave(v.unidad) === n; }) || null;
  }

  // Valores genéricos de la zona para una unidad, o null si su lugar no tiene estimados.
  /**
   * Reparte la compra total del lugar entre sus unidades. unidades: todas las del lugar;
   * tc: pesos por dólar. Lo llama propiedades-vista.js antes de mostrar Unidades o Rentabilidad.
   */
  function configurarZona(lugar, unidades, tc) {
    var k = clave(lugar), usd = ESTIMADOS.compraTotalUSD[k];
    if (!usd) return;
    if (tc > 0) cotiz = tc;
    var peso = 0;
    (unidades || []).forEach(function (u) { peso += generico(u, cargado(u)).usd; });
    zonas[k] = { total: usd * cotiz, peso: peso };
  }

  // Valor de mercado (en dólares) y gastos de la unidad según su tipo.
  function generico(u, v) {
    var nombre = clave(u.unidad), destino = (v && v.destino) || "";
    if (destino === "Cochera" || (!destino && /coch|garage|garaje/.test(nombre))) return { usd: ESTIMADOS.cocheraUSD, gastos: ESTIMADOS.gastosCochera };
    if (destino === "Comercial" || (!destino && /local/.test(nombre))) return { usd: ESTIMADOS.comercialUSD, gastos: ESTIMADOS.gastosComercial };
    var dorm = v && typeof v.dormitorios === "number" && !isNaN(v.dormitorios) ? v.dormitorios : 1;
    return { usd: ESTIMADOS.viviendaUSD[Math.min(Math.max(dorm, 0), ESTIMADOS.viviendaUSD.length - 1)], gastos: ESTIMADOS.gastosVivienda };
  }

  // Valor real y venta: los de mercado de la zona. Compra: la parte de la inversión total que le toca.
  function estimadoPara(u, v, lugar) {
    var kz = clave(lugar || u.lugar);
    if (ESTIMADOS.lugares.indexOf(kz) < 0) return null;
    var g = generico(u, v), z = zonas[kz], real = Math.round(g.usd * cotiz);
    var compra = z && z.peso > 0 ? Math.round(z.total * g.usd / z.peso) : Math.round(real * ESTIMADOS.compraSinTotal);
    return { valorReal: real, precioCompra: compra, ventaEstimada: Math.round(real * ESTIMADOS.venta), gastosMensuales: g.gastos };
  }

  // Lo cargado, completado con los estimados de la zona en los importes que falten.
  function de(u, lugar) {
    if (!estado.listo) return null;
    var v = cargado(u), est = estimadoPara(u, v, lugar);
    if (!est) return v;
    var r = {}, estimados = [];
    Object.keys(v || {}).forEach(function (k) { r[k] = v[k]; });
    Object.keys(est).forEach(function (k) {
      if (typeof r[k] === "number" && !(k !== "gastosMensuales" && r[k] <= 0)) return;
      r[k] = est[k]; estimados.push(k);
    });
    r.estimados = estimados;
    return r;
  }
  function esEstimado(v, k) { return !!(v && v.estimados && v.estimados.indexOf(k) >= 0); }

  function rendimiento(v, alquiler) {
    return v && typeof v.precioCompra === "number" && v.precioCompra > 0 && typeof alquiler === "number" && alquiler > 0 ? alquiler * 12 / v.precioCompra : null;
  }

  function calculo(v, ctx) {
    var alq = ctx && ctx.alquiler > 0 ? ctx.alquiler : null;
    var fijos = v && typeof v.gastosMensuales === "number" ? v.gastosMensuales : 0;
    var gastos = (ctx && ctx.adm || 0) + (ctx && ctx.arreglosMes || 0) + fijos;
    var neto = alq === null ? null : alq - gastos;
    var compra = v && v.precioCompra > 0 ? v.precioCompra : null;
    return { alquiler: alq, gastos: gastos, fijos: fijos, neto: neto, bruto: alq && compra ? alq * 12 / compra : null, rendNeto: neto !== null && compra ? neto * 12 / compra : null };
  }

  function guardarParametros(edificio, p) {
    return BGPSesion.pedir("guardarValorPropiedad", { parametros: true, edificio: edificio, costosVenta: p.costosVenta, tasaAlternativa: p.tasaAlternativa })
      .then(function (r) { if (estado.edificio === edificio) estado.parametros = r.parametros || null; return r; });
  }

  // ----- Detalle de la unidad -----
  function armarDialogo() {
    if (dialogo) return dialogo;
    dialogo = el("dialog", "ficha");
    dialogo.setAttribute("aria-labelledby", "fichaTitulo");
    dialogo.addEventListener("click", function (e) { if (e.target === dialogo) dialogo.close(); });
    document.body.append(dialogo);
    return dialogo;
  }

  function campo(etiqueta, control, ayuda) {
    var lab = el("label", null, etiqueta);
    lab.append(control);
    if (ayuda) lab.append(el("small", null, ayuda));
    return lab;
  }
  function inputNum(valor, titulo, entero) {
    var i = el("input");
    i.type = "text"; i.inputMode = entero ? "numeric" : "decimal"; i.placeholder = "Sin cargar";
    i.value = numTxt(valor);
    i.setAttribute("aria-label", titulo);
    return i;
  }
  function selectDe(opciones, valor, titulo) {
    var s = el("select");
    s.setAttribute("aria-label", titulo);
    opciones.forEach(function (o) { var x = el("option", null, o[1]); x.value = o[0]; s.append(x); });
    s.value = valor || "";
    return s;
  }

  function abrir(u, ctx) {
    var dlg = armarDialogo();
    var v = cargado(u) || {};
    var est = estimadoPara(u, v, ctx.lugar);
    dlg.replaceChildren();
    var cab = el("div", "ficha-cab");
    var tit = el("div");
    var h = el("h3", null, u.unidad || "Unidad"); h.id = "fichaTitulo";
    tit.append(h, el("span", "sub", [u.inquilino || "Sin inquilino", ctx.lugar].filter(Boolean).join(" · ")));
    var cerrar = el("button", "quitar", "×");
    cerrar.type = "button"; cerrar.setAttribute("aria-label", "Cerrar");
    cerrar.addEventListener("click", function () { dlg.close(); });
    cab.append(tit, cerrar);
    dlg.append(cab);

    var form = el("form");
    form.method = "dialog";
    // Detalle
    form.append(el("h4", null, "Detalle"));
    var c1 = el("div", "campos ficha-campos");
    var iDorm = inputNum(v.dormitorios, "Dormitorios", true);
    var sDest = selectDe([["", "Sin dato"]].concat(DESTINOS.map(function (d) { return [d, d]; })), v.destino, "Destino");
    var sCoch = selectDe([["", "Sin dato"], ["Sí", "Sí"], ["No", "No"]], v.cochera, "Cochera");
    c1.append(campo("Dormitorios", iDorm), campo("Destino", sDest), campo("Cochera", sCoch));
    form.append(c1);
    // Cuentas de impuestos
    form.append(el("h4", null, "Cuentas de impuestos"));
    var c0 = el("div", "campos ficha-campos");
    function inputTxt(valor, titulo) { var i = el("input"); i.type = "text"; i.placeholder = "Sin cargar"; i.value = valor || ""; i.setAttribute("aria-label", titulo); return i; }
    var iMuni = inputTxt(v.muni, "Cuenta municipal"), iAguas = inputTxt(v.aguas, "Cuenta de aguas"), iRentas = inputTxt(v.rentas, "Cuenta de rentas");
    c0.append(campo("Municipalidad", iMuni), campo("Aguas", iAguas), campo("Rentas", iRentas));
    form.append(c0);
    // Valores
    form.append(el("h4", null, "Valores"));
    var c2 = el("div", "campos ficha-campos");
    var iReal = inputNum(v.valorReal, "Valor real de la propiedad");
    var iCompra = inputNum(v.precioCompra, "Precio de compra");
    var iVenta = inputNum(v.ventaEstimada, "Valor de venta estimado");
    var iGastos = inputNum(v.gastosMensuales, "Gastos mensuales a cargo del dueño");
    c2.append(campo("Valor real", iReal), campo("Precio de compra", iCompra), campo("Venta estimada", iVenta),
      campo("Gastos mensuales", iGastos, "Impuestos, expensas, seguro… a cargo del dueño"));
    form.append(c2);
    // Saavedra: lo que falta se muestra con el estimado de la zona (se usa en los cálculos hasta cargar el real).
    var conEst = [[iReal, "valorReal"], [iCompra, "precioCompra"], [iVenta, "ventaEstimada"], [iGastos, "gastosMensuales"]];
    if (est) {
      conEst.forEach(function (x) { x[0].placeholder = "Estimado " + numTxt(est[x[1]]); });
      form.append(el("p", "ficha-estimado", "Los importes vacíos usan valores estimados para la zona de " + (ctx.lugar || "Saavedra") +
        " (en gris). Cargá los reales y reemplazan a los estimados."));
    }
    function valorO(i, k) { var n = numero(i.value); return n === null && est && !i.value.trim() ? est[k] : n; }
    // Lo calculado: rendimientos y diferencia entre la venta estimada y la compra.
    var calc = el("div", "ficha-calc");
    var kAlq = el("div", "kpi"), kRend = el("div", "kpi"), kNeto = el("div", "kpi"), kVta = el("div", "kpi");
    calc.append(kAlq, kRend, kNeto, kVta);
    form.append(calc);
    function kpi(k, titulo, valor, pie) { k.replaceChildren(el("small", null, titulo), el("b", null, valor), el("span", null, pie)); }
    function recalcular() {
      var compra = valorO(iCompra, "precioCompra"), venta = valorO(iVenta, "ventaEstimada");
      var c = calculo({ precioCompra: compra, gastosMensuales: valorO(iGastos, "gastosMensuales") }, ctx);
      kpi(kAlq, "Alquiler mensual", pesos(ctx.alquiler), ctx.alquiler ? ctx.fuente : "Sin alquiler cargado");
      kpi(kRend, "Rendimiento bruto", pct(c.bruto), c.bruto === null ? (compra ? "Falta el alquiler" : "Cargá el precio de compra") : "Alquiler × 12 sobre la compra");
      var partes = [];
      if (ctx.adm) partes.push("adm. " + pesos(ctx.adm));
      if (ctx.arreglosMes) partes.push("arreglos " + pesos(ctx.arreglosMes));
      if (c.fijos) partes.push("gastos " + pesos(c.fijos));
      kpi(kNeto, "Rendimiento neto", pct(c.rendNeto), c.neto === null ? "Falta el alquiler" : "Neto " + pesos(c.neto) + "/mes" + (partes.length ? " (− " + partes.join(", ") + ")" : " (sin gastos)"));
      var dif = compra && venta ? venta / compra - 1 : null;
      kpi(kVta, "Venta vs. compra", dif === null ? "—" : (dif > 0 ? "+" : "") + pct(dif), dif === null ? "Cargá compra y venta estimada" : pesos(venta - compra));
      kRend.classList.toggle("ok", c.bruto !== null);
      kNeto.classList.toggle("ok", c.rendNeto !== null && c.rendNeto >= 0);
      kNeto.classList.toggle("baja", c.rendNeto !== null && c.rendNeto < 0);
      kVta.classList.toggle("baja", dif !== null && dif < 0);
      kVta.classList.toggle("ok", dif !== null && dif >= 0);
    }
    [iCompra, iVenta, iGastos].forEach(function (i) { i.addEventListener("input", recalcular); });
    recalcular();

    var msg = el("div", "alerta error");
    msg.hidden = true;
    form.append(msg);
    var pie = el("div", "ficha-pie");
    pie.append(el("span", "estado-guardado", v.actualizadoPor ? "Último cambio de " + v.actualizadoPor + (v.fecha ? " el " + v.fecha : "") : "Todavía sin cargar"));
    var botones = el("div", "barra-acciones");
    var bc = el("button", "boton secundario", "Cancelar"); bc.type = "button";
    bc.addEventListener("click", function () { dlg.close(); });
    var bg = el("button", "boton", "Guardar"); bg.type = "submit";
    botones.append(bc, bg);
    pie.append(botones);
    form.append(pie);
    dlg.append(form);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var dorm = numero(iDorm.value);
      if (iDorm.value.trim() && (dorm === null || dorm < 0 || dorm > 20 || Math.round(dorm) !== dorm)) { msg.textContent = "Dormitorios: un número entero de 0 a 20."; msg.hidden = false; iDorm.focus(); return; }
      var malos = [[iReal, "el valor real"], [iCompra, "el precio de compra"], [iVenta, "la venta estimada"], [iGastos, "los gastos mensuales"]].filter(function (x) { return x[0].value.trim() && !(numero(x[0].value) >= 0); });
      if (malos.length) { msg.textContent = "Revisá " + malos[0][1] + ": tiene que ser un importe."; msg.hidden = false; malos[0][0].focus(); return; }
      msg.hidden = true;
      bg.disabled = true; bg.textContent = "Guardando…";
      BGPSesion.pedir("guardarValorPropiedad", {
        edificio: ctx.edificio, lugar: ctx.lugar || "", unidad: u.unidad, clave: claveDe(u),
        valorReal: numero(iReal.value), precioCompra: numero(iCompra.value), ventaEstimada: numero(iVenta.value),
        gastosMensuales: numero(iGastos.value),
        muni: iMuni.value.trim(), aguas: iAguas.value.trim(), rentas: iRentas.value.trim(),
        dormitorios: dorm, destino: sDest.value, cochera: sCoch.value, alquiler: ctx.alquiler || null
      }).then(function (r) {
        var k = clave(claveDe(u));
        estado.valores = estado.valores.filter(function (x) { return clave(x.clave) !== k; });
        if (r.valor) estado.valores.push(r.valor);
        dlg.close();
        if (ctx.alGuardar) ctx.alGuardar();
      }).catch(function (err) {
        if (err && err.sesion === false) { location.replace("index.html?v=7#elegir"); return; }
        msg.textContent = "No se pudo guardar: " + ((err && err.message) || err);
        msg.hidden = false;
        bg.disabled = false; bg.textContent = "Guardar";
      });
    });
    dlg.showModal();
    iDorm.focus();
  }

  // ----- Cuentas de impuestos y dormitorios de Saavedra (listados del Excel) -----
  // [PH, MUNI, RENTAS, dormitorios (null = local comercial), otro nombre de la unidad].
  // La cochera (Sí / No) sale de la liquidación: la pasa propiedades-vista.js en cada unidad.
  // Se cargan solos una vez en las unidades de Saavedra que todavía no los tienen. Para no
  // tocar otro edificio con unidades de igual nombre, solo si coinciden al menos 20 de las 27.
  var CUENTAS_SAAVEDRA = [
    ["LOCAL 1 A", "03-1103001800001", "110144639901", null, "Local A"],
    ["LOCAL 2 B", "03-1103001800002", "110144639910", null, "Local B"],
    ["LOCAL 3 C", "03-1103001800003", "110144639928", null, "Local C"],
    ["PB A", "03-1103001800004", "110144639936", 1],
    ["PB B", "03-1103001800005", "110144639944", 1],
    ["PB C", "03-1103001800006", "110144639952", 1],
    ["PB D", "03-1103001800007", "110144639961", 2],
    ["1° A", "03-1103001800008", "110144639979", 1],
    ["1° B", "03-1103001800009", "110144639987", 1],
    ["1° C", "03-1103001800010", "110144639995", 1],
    ["1° D", "03-1103001800011", "110144640004", 2],
    ["1° E", "03-1103001800012", "110144640012", 1],
    ["1° F", "03-1103001800013", "110144640021", 1],
    ["1° G", "03-1103001800014", "110144640039", 1],
    ["1° H", "03-1103001800015", "110144640047", 1],
    ["2° A", "03-1103001800016", "110144640055", 1],
    ["2° B", "03-1103001800017", "110144640063", 1],
    ["2° C", "03-1103001800018", "110144640071", 2],
    ["2° D", "03-1103001800019", "110144640080", 2],
    ["2° E", "03-1103001800020", "110144640098", 1],
    ["2° F", "03-1103001800021", "110144640101", 1],
    ["2° G", "03-1103001800022", "110144640110", 1],
    ["2° H", "03-1103001800023", "110144640128", 1],
    ["3° A", "03-1103001800024", "110144640136", 2],
    ["3° B", "03-1103001800025", "110144640144", 1],
    ["3° C", "03-1103001800026", "110144640152", 1],
    ["3° D", "03-1103001800027", "110144640161", 1]
  ];
  var sembrando = false;
  function sembrarCuentas(edificio, unidades) {
    if (sembrando || !estado.listo || estado.edificio !== edificio) return Promise.resolve(0);
    var pares = CUENTAS_SAAVEDRA.map(function (c) { return { c: c, u: unidadDeListado(c[0], unidades) || (c[4] ? unidadDeListado(c[4], unidades) : null) }; })
      .filter(function (x) { return x.u; });
    if (pares.length < 20) return Promise.resolve(0);
    var lista = [];
    pares.forEach(function (x) {
      var v = cargado(x.u) || {}, item = { unidad: x.u.unidad, clave: claveDe(x.u), lugar: x.u.lugar || "" }, algo = false;
      if (!v.muni && !v.rentas) { item.muni = x.c[1]; item.rentas = x.c[2]; algo = true; }
      if (typeof v.dormitorios !== "number" || isNaN(v.dormitorios)) {
        if (x.c[3] !== null) { item.dormitorios = x.c[3]; algo = true; }
        else if (!v.destino) { item.destino = "Comercial"; algo = true; }
      }
      if (!v.cochera && (x.u.cochera === "Sí" || x.u.cochera === "No")) { item.cochera = x.u.cochera; algo = true; }
      if (algo) lista.push(item);
    });
    if (!lista.length) return Promise.resolve(0);
    sembrando = true;
    return BGPSesion.pedir("guardarValorPropiedad", { cuentas: lista, edificio: edificio }).then(function (r) {
      (r.valores || []).forEach(function (nv) {
        var k = clave(nv.clave);
        estado.valores = estado.valores.filter(function (x) { return clave(x.clave) !== k; });
        estado.valores.push(nv);
      });
      sembrando = false;
      return lista.length;
    }, function (err) { sembrando = false; console.log("Cuentas de Saavedra: " + ((err && err.message) || err)); return 0; });
  }

  // ----- Cuentas de impuestos de muchas unidades (pegadas del Excel) -----
  // Columnas PH (unidad), MUNI, AGUAS y RENTAS; con o sin la fila de títulos.
  function leerListadoCuentas(txt) {
    var filas = String(txt || "").replace(/\r/g, "").split("\n").map(function (l) { return l.split("\t").map(function (c) { return c.trim(); }); })
      .filter(function (f) { return f.some(Boolean); });
    var col = { unidad: 0, muni: 1, aguas: 2, rentas: 3 };
    if (filas.length && filas[0].some(function (c) { return /^(PH|MUNI|AGUAS?|RENTAS?|UNIDAD)$/i.test(c); })) {
      var cab = filas.shift().map(function (c) { return clave(c); });
      var busca = function (re, def) { var i = cab.findIndex(function (c) { return re.test(c); }); return i < 0 ? def : i; };
      col = { unidad: busca(/^(ph|unidad|depto|dpto)/, 0), muni: busca(/muni/, -1), aguas: busca(/agua/, -1), rentas: busca(/renta/, -1) };
    }
    return filas.map(function (f) {
      return { ph: f[col.unidad] || "", muni: col.muni < 0 ? "" : f[col.muni] || "", aguas: col.aguas < 0 ? "" : f[col.aguas] || "", rentas: col.rentas < 0 ? "" : f[col.rentas] || "" };
    }).filter(function (x) { return x.ph && (x.muni || x.aguas || x.rentas); });
  }

  // La unidad del listado: misma clave ("1° A" = "1A"); si no, la única que empieza igual.
  function unidadDeListado(ph, unidades) {
    var k = LectorPropiedades.claveUnidad(ph);
    var ku = function (u) { return LectorPropiedades.claveUnidad(u.unidad); };
    var igual = unidades.filter(function (u) { return ku(u) === k; });
    if (igual.length === 1) return igual[0];
    var parecida = unidades.filter(function (u) { var x = ku(u); return x && (k.indexOf(x) === 0 || x.indexOf(k) === 0); });
    return parecida.length === 1 ? parecida[0] : null;
  }

  /** Botón "Cargar cuentas de impuestos". ctx: {edificio, unidades: [{unidad, clave, lugar}], alGuardar} */
  function botonCuentas(ctx) {
    var b = el("button", "boton secundario chico", "Cargar cuentas de impuestos");
    b.type = "button";
    b.title = "Pegá el listado del Excel (PH, MUNI, AGUAS, RENTAS) y se carga en cada unidad";
    b.addEventListener("click", function () { abrirCuentas(ctx); });
    return b;
  }

  function abrirCuentas(ctx) {
    var dlg = armarDialogo();
    dlg.replaceChildren();
    var cab = el("div", "ficha-cab");
    var tit = el("div");
    var h = el("h3", null, "Cuentas de impuestos"); h.id = "fichaTitulo";
    tit.append(h, el("span", "sub", "Copiá en el Excel las columnas PH, MUNI, AGUAS y RENTAS (con los títulos) y pegalas acá."));
    var cerrar = el("button", "quitar", "×");
    cerrar.type = "button"; cerrar.setAttribute("aria-label", "Cerrar");
    cerrar.addEventListener("click", function () { dlg.close(); });
    cab.append(tit, cerrar);
    var area = el("textarea", "cuentas-pegar");
    area.rows = 6; area.placeholder = "PH\tMUNI\tAGUAS\tRENTAS\nLOCAL 1 A\t03-1103001800001\t\t110144639901\n…";
    area.setAttribute("aria-label", "Listado pegado");
    var vista = el("div", "cuentas-vista");
    var msg = el("div", "alerta error"); msg.hidden = true;
    var pie = el("div", "ficha-pie");
    var estadoTxt = el("span", "estado-guardado", "");
    var botones = el("div", "barra-acciones");
    var bc = el("button", "boton secundario", "Cancelar"); bc.type = "button";
    bc.addEventListener("click", function () { dlg.close(); });
    var bg = el("button", "boton", "Guardar"); bg.type = "button"; bg.disabled = true;
    botones.append(bc, bg);
    pie.append(estadoTxt, botones);
    dlg.append(cab, area, vista, msg, pie);

    var filas = [];
    function revisar() {
      filas = leerListadoCuentas(area.value).map(function (x) { return { x: x, u: unidadDeListado(x.ph, ctx.unidades) }; });
      vista.replaceChildren();
      if (!filas.length) { bg.disabled = true; estadoTxt.textContent = area.value.trim() ? "No se encontraron filas con unidad y cuentas." : ""; return; }
      var t = el("table"), th = el("tr");
      ["Listado", "Unidad", "Municipalidad", "Aguas", "Rentas"].forEach(function (x) { th.append(el("th", null, x)); });
      var thead = el("thead"); thead.append(th);
      var tb = el("tbody");
      filas.forEach(function (f) {
        var tr = el("tr");
        var sel = el("select");
        sel.setAttribute("aria-label", "Unidad de " + f.x.ph);
        var o0 = el("option", null, "— Elegí la unidad —"); o0.value = ""; sel.append(o0);
        ctx.unidades.forEach(function (u, i) { var o = el("option", null, u.unidad + (u.lugar ? " · " + u.lugar : "")); o.value = String(i); sel.append(o); });
        sel.value = f.u ? String(ctx.unidades.indexOf(f.u)) : "";
        sel.addEventListener("change", function () { f.u = sel.value === "" ? null : ctx.unidades[+sel.value]; contar(); });
        var tdU = el("td"); tdU.append(sel);
        tr.append(el("td", null, f.x.ph), tdU, el("td", null, f.x.muni || "—"), el("td", null, f.x.aguas || "—"), el("td", null, f.x.rentas || "—"));
        tb.append(tr);
      });
      t.append(thead, tb);
      var w = el("div", "tabla-scroll"); w.append(t);
      vista.append(w);
      contar();
    }
    function contar() {
      var ok = filas.filter(function (f) { return f.u; }).length;
      estadoTxt.textContent = ok + " de " + filas.length + " con unidad" + (ok < filas.length ? ": elegí las que faltan o se saltean" : "");
      bg.disabled = !ok;
    }
    area.addEventListener("input", revisar);

    bg.addEventListener("click", function () {
      var lista = filas.filter(function (f) { return f.u; }).map(function (f) {
        return { unidad: f.u.unidad, clave: claveDe(f.u), lugar: f.u.lugar || "", muni: f.x.muni, aguas: f.x.aguas, rentas: f.x.rentas };
      });
      msg.hidden = true;
      bg.disabled = true; bg.textContent = "Guardando…";
      BGPSesion.pedir("guardarValorPropiedad", { cuentas: lista, edificio: ctx.edificio }).then(function (r) {
        (r.valores || []).forEach(function (nv) {
          var k = clave(nv.clave);
          estado.valores = estado.valores.filter(function (x) { return clave(x.clave) !== k; });
          estado.valores.push(nv);
        });
        dlg.close();
        if (ctx.alGuardar) ctx.alGuardar();
      }).catch(function (err) {
        if (err && err.sesion === false) { location.replace("index.html?v=7#elegir"); return; }
        msg.textContent = "No se pudo guardar: " + ((err && err.message) || err);
        msg.hidden = false;
        bg.disabled = false; bg.textContent = "Guardar";
      });
    });
    dlg.showModal();
    area.focus();
  }

  function botonInfo(u, ctx) {
    var b = el("button", "info", "i");
    b.type = "button";
    b.title = "Detalle y valores de " + (u.unidad || "la unidad");
    b.setAttribute("aria-label", b.title);
    b.addEventListener("click", function (e) { e.stopPropagation(); abrir(u, ctx); });
    return b;
  }

  window.PropValores = {
    cargar: cargar, de: de, esEstimado: esEstimado, configurarZona: configurarZona, botonCuentas: botonCuentas, sembrarCuentas: sembrarCuentas, rendimiento: rendimiento, calculo: calculo, botonInfo: botonInfo,
    parametros: function () { return estado.parametros; },
    // Unidades importadas en el mapa (KML): [{lugar, nombre, unidad}]
    unidadesMapa: function () { return estado.listo && estado.edificio ? (estado.unidadesMapa || []) : []; },
    guardarParametros: guardarParametros,
    listo: function () { return estado.listo; },
    url: function () { return estado.url; }, error: function () { return estado.error; }
  };
})();
