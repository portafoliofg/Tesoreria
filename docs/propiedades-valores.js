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
 * PropValores.botonInfo(u, ctx) → botón "i" que abre el detalle.
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
  // Valores genéricos para Saavedra (CABA, octubre de 2026), en pesos: departamento usado a
  // ~USD 2.400 el m², dólar ~$ 1.450. Por tipo de unidad; la vivienda según los dormitorios
  // (sin dato, 1 dormitorio · 2 ambientes, ~45 m²). Compra ≈ 88 % y venta ≈ 95 % del valor real.
  // Gastos mensuales: ABL, expensas a cargo del dueño y seguro.
  var ESTIMADOS = {
    lugares: ["saavedra"],
    vivienda: [110000000, 150000000, 205000000, 265000000],  // 0, 1, 2 y 3 o más dormitorios
    cochera: 32000000,
    comercial: 175000000,
    gastosVivienda: 90000, gastosCochera: 25000, gastosComercial: 120000,
    compra: 0.88, venta: 0.95,
    // Compra real de todo el lugar, en dólares: se reparte entre sus unidades según el valor
    // genérico de cada una (una cochera recibe menos que un departamento). Valor real y venta
    // salen de esa compra con las mismas proporciones (compra = 88 % del valor real).
    compraTotalUSD: { saavedra: 780000 },
    dolar: 1450  // si no hay cotización del Dólar Blue
  };
  var zonas = {};  // clave(lugar) → {total en pesos, peso: suma de valores genéricos de sus unidades}

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
    var peso = 0;
    (unidades || []).forEach(function (u) { peso += generico(u, cargado(u)).real; });
    zonas[k] = { total: usd * (tc > 0 ? tc : ESTIMADOS.dolar), peso: peso };
  }

  // Valor genérico de mercado y gastos de la unidad según su tipo.
  function generico(u, v) {
    var nombre = clave(u.unidad), destino = (v && v.destino) || "";
    if (destino === "Cochera" || (!destino && /coch|garage|garaje/.test(nombre))) return { real: ESTIMADOS.cochera, gastos: ESTIMADOS.gastosCochera };
    if (destino === "Comercial" || (!destino && /local/.test(nombre))) return { real: ESTIMADOS.comercial, gastos: ESTIMADOS.gastosComercial };
    var dorm = v && typeof v.dormitorios === "number" && !isNaN(v.dormitorios) ? v.dormitorios : 1;
    return { real: ESTIMADOS.vivienda[Math.min(Math.max(dorm, 0), ESTIMADOS.vivienda.length - 1)], gastos: ESTIMADOS.gastosVivienda };
  }

  function estimadoPara(u, v, lugar) {
    var kz = clave(lugar || u.lugar);
    if (ESTIMADOS.lugares.indexOf(kz) < 0) return null;
    var g = generico(u, v), z = zonas[kz];
    if (z && z.peso > 0) {
      var compra = Math.round(z.total * g.real / z.peso), realZ = Math.round(compra / ESTIMADOS.compra);
      return { valorReal: realZ, precioCompra: compra, ventaEstimada: Math.round(realZ * ESTIMADOS.venta), gastosMensuales: g.gastos };
    }
    var real = g.real, gastos = g.gastos;
    return { valorReal: real, precioCompra: Math.round(real * ESTIMADOS.compra), ventaEstimada: Math.round(real * ESTIMADOS.venta), gastosMensuales: gastos };
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

  function botonInfo(u, ctx) {
    var b = el("button", "info", "i");
    b.type = "button";
    b.title = "Detalle y valores de " + (u.unidad || "la unidad");
    b.setAttribute("aria-label", b.title);
    b.addEventListener("click", function (e) { e.stopPropagation(); abrir(u, ctx); });
    return b;
  }

  window.PropValores = {
    cargar: cargar, de: de, esEstimado: esEstimado, configurarZona: configurarZona, rendimiento: rendimiento, calculo: calculo, botonInfo: botonInfo,
    parametros: function () { return estado.parametros; },
    // Unidades importadas en el mapa (KML): [{lugar, nombre, unidad}]
    unidadesMapa: function () { return estado.listo && estado.edificio ? (estado.unidadesMapa || []) : []; },
    guardarParametros: guardarParametros,
    listo: function () { return estado.listo; },
    url: function () { return estado.url; }, error: function () { return estado.error; }
  };
})();
