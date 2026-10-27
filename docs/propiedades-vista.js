/*
 * Propiedades · liquidaciones mensuales de alquileres.
 *
 * Los datos (inquilinos, montos, patentes) no están en esta página ni en el
 * repositorio, que son públicos: se piden al servidor con la sesión iniciada
 * (BGPSesion.pedir) y se guardan en la planilla de Google, pestaña "Propiedades".
 * "Importar planilla" lee el Excel del mes con propiedades-lector.js y lo guarda.
 *
 * La liquidación se ve por pestañas (Resumen, Unidades, Expensas, Cocheras y
 * novedades, Transferencias) y se puede editar todo con "Editar": se trabaja sobre
 * una copia (borrador) que se guarda con "Guardar cambios". Al editar se recalculan
 * los totales con las mismas reglas de la planilla:
 *  - Unidad que paga en efectivo: administración = (efectivo + cochera) × 6 % y
 *    total = efectivo + cochera + muni y rentas + punitorios − administración − arreglos.
 *  - Liquidación: cada "total" es lo acumulado hasta ahí (base − descuentos + ingresos).
 *  - Rentas y municipalidad del mes se reparten por el coeficiente de cada unidad.
 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  var ADM = 0.06;
  var PESTANAS = [["tablero", "Tablero"], ["resumen", "Resumen"], ["unidades", "Unidades"], ["rentabilidad", "Rentabilidad"], ["contratos", "Contratos"], ["expensas", "Expensas"], ["cocheras", "Cocheras y novedades"], ["transferencias", "Transferencias"], ["historial", "Historial"]];
  // Ícono de cada sección en el menú lateral (trazos de un SVG de 24 × 24).
  var ICONOS = {
    tablero: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="5" rx="1.5"/><rect x="13" y="11" width="7" height="9" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/>',
    resumen: '<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    rentabilidad: '<path d="M4 19h16"/><path d="M6 15l4-4 3 3 6-7"/><path d="M15 7h4v4"/>',
    unidades: '<path d="M4 20V6l8-3v17M12 9l8 3v8"/><path d="M3 20h18M7.5 8.5v.01M7.5 12v.01M7.5 15.5v.01M15.5 14v.01M15.5 17v.01"/>',
    contratos: '<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5"/><path d="M8.5 16.5c1-1.5 2-1.5 2.5 0s1.5 1.5 2.5 0 1.5-1 2 0"/>',
    expensas: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    cocheras: '<path d="M5 16V11l2-5h10l2 5v5"/><path d="M4 16h16v2.5H4z"/><path d="M7.5 13.5v.01M16.5 13.5v.01M5 11h14"/>',
    transferencias: '<path d="M4 8h13M14 4l4 4-4 4"/><path d="M20 16H7M10 12l-4 4 4 4"/>',
    historial: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
  };
  var lista = [];
  var actual = null;      // registro guardado {edificio, periodo, datos, ...}
  var borrador = null;    // copia de actual.datos mientras se edita
  var pestana = "tablero";
  var filtro = { texto: "", forma: "", lugar: "" };
  var hist = { texto: "", unidad: "" };  // Historial: búsqueda y unidad abierta
  // Lugares (pestañas dentro de Unidades). Las unidades sin lugar son del primero (Saavedra).
  // Cada lugar es independiente: sus unidades, su resumen y su pin en el mapa. Mismo orden que
  // LUGARES_PREDETERMINADOS_ en src/PropiedadesMapa.gs.
  var LUGARES = ["Saavedra", "Polo 52", "Dario", "Esteban Porucini", "Casa Morón", "Oficina PEA"];
  // Las liquidaciones guardan su lista de lugares: los que se agregaron después (Oficina PEA) se suman al final.
  function lugaresDe(d) {
    if (!d.lugares || !d.lugares.length) return LUGARES;
    return d.lugares.concat(LUGARES.filter(function (l) { return d.lugares.indexOf(l) < 0; }));
  }
  function lugarDe(d, u) { return u.lugar || lugaresDe(d)[0]; }
  try { pestana = sessionStorage.getItem("prop-pestana") || pestana; } catch (e) {}

  // ----- Sesión -----
  function irAlIngreso() { location.replace("index.html?v=7#elegir"); }
  var guardado = BGPSesion.usuario();
  if (!guardado) { irAlIngreso(); return; }
  $("quien").textContent = guardado.nombre || guardado.usuario || "";
  document.body.classList.remove("verificando");
  // La sesión no se consulta aparte: obtenerPropiedades la valida (si venció, vuelve al ingreso).
  $("salir").addEventListener("click", function () { BGPSesion.salir().then(irAlIngreso); });
  // Modo oscuro: el botón del menú lo prende o lo apaga y queda recordado en este navegador.
  function pintarModo() {
    var oscuro = document.documentElement.getAttribute("data-modo") === "oscuro";
    $("modo").setAttribute("aria-pressed", oscuro ? "true" : "false");
    $("modo").querySelector("span").textContent = oscuro ? "Modo claro" : "Modo oscuro";
  }
  $("modo").addEventListener("click", function () {
    var oscuro = document.documentElement.getAttribute("data-modo") !== "oscuro";
    if (oscuro) document.documentElement.setAttribute("data-modo", "oscuro"); else document.documentElement.removeAttribute("data-modo");
    try { localStorage.setItem("prop-modo", oscuro ? "oscuro" : "claro"); } catch (e) {}
    pintarModo();
  });
  pintarModo();
  pintarMenu();
  window.addEventListener("beforeunload", function (e) { if (borrador) { e.preventDefault(); e.returnValue = ""; } });

  // ----- Formatos y ayudas -----
  var fmtPesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function pesos(n) { return typeof n !== "number" || isNaN(n) ? "—" : fmtPesos.format(n); }
  // Unidades: en pesos sin signo ni centavos, para que entren todas las columnas en la pantalla.
  var fmtPesos0 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  function pesos0(n) { return typeof n !== "number" || isNaN(n) ? "—" : fmtPesos0.format(n); }
  function pct(n) { return typeof n !== "number" ? "—" : (n * 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + " %"; }
  function numTxt(n, dec) { return typeof n !== "number" ? "" : n.toLocaleString("es-AR", { minimumFractionDigits: dec === undefined ? 2 : dec, maximumFractionDigits: dec === undefined ? 2 : dec }); }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined && txt !== null) n.textContent = txt; return n; }
  function suma(arr, k) { return arr.reduce(function (a, x) { return a + (typeof x[k] === "number" ? x[k] : 0); }, 0); }
  function hay(arr, k) { return arr.some(function (x) { return typeof x[k] === "number"; }); }
  function redondo(n) { return Math.round(n * 100) / 100; }
  function copia(x) { return JSON.parse(JSON.stringify(x)); }
  function numeroDe(txt) {
    var t = String(txt == null ? "" : txt).replace(/[^0-9,.\-]/g, "");
    if (!t || t === "-") return null;
    var c = t.lastIndexOf(","), p = t.lastIndexOf(".");
    // 1.234,56 · 450.000 (punto de miles) · 1234.56 · 1,234.56
    if (c > p) t = t.replace(/\./g, "").replace(",", ".");
    else if (c < 0 && /^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
    else t = t.replace(/,/g, "");
    var n = parseFloat(t);
    return isNaN(n) ? null : n;
  }
  function errorEn(caja, err) {
    if (err && err.sesion === false) { irAlIngreso(); return; }
    caja.replaceChildren(el("div", "alerta error", (err && err.message) || String(err)));
  }
  function datos() { return borrador || (actual && actual.datos); }
  function editando() { return !!borrador; }

  // Campos de edición. alCambiar se llama con el valor nuevo; "repintar" vuelve a dibujar la pestaña.
  function campoNum(valor, alCambiar, opciones) {
    opciones = opciones || {};
    var i = el("input", "celda num" + (opciones.pct ? " pct" : "") + (opciones.cls ? " " + opciones.cls : ""));
    i.type = "text"; i.inputMode = "decimal";
    i.value = opciones.pct ? (typeof valor === "number" ? numTxt(valor * 100, 3) : "") : numTxt(valor);
    i.placeholder = opciones.placeholder || "—";
    if (opciones.titulo) i.setAttribute("aria-label", opciones.titulo);
    i.addEventListener("change", function () {
      var n = numeroDe(i.value);
      if (n !== null && opciones.pct) n = n / 100;
      alCambiar(n);
      repintarLuego();
    });
    if (!opciones.pct) return i;
    var envoltura = el("span", "con-pct");
    envoltura.append(i, el("span", null, "%"));
    return envoltura;
  }
  function campoTxt(valor, alCambiar, opciones) {
    opciones = opciones || {};
    var i = el("input", "celda" + (opciones.cls ? " " + opciones.cls : ""));
    i.type = "text"; i.value = valor || ""; i.placeholder = opciones.placeholder || "";
    if (opciones.titulo) i.setAttribute("aria-label", opciones.titulo);
    i.addEventListener("change", function () { alCambiar(i.value.trim()); if (opciones.repintar) repintarLuego(); });
    return i;
  }
  function botonQuitar(alQuitar, etiqueta) {
    var b = el("button", "quitar", "×");
    b.type = "button"; b.title = etiqueta || "Quitar"; b.setAttribute("aria-label", etiqueta || "Quitar");
    b.addEventListener("click", function () { alQuitar(); repintarPestana(); });
    return b;
  }
  function botonAgregar(texto, alAgregar) {
    var b = el("button", "boton secundario chico", "+ " + texto);
    b.type = "button";
    b.addEventListener("click", function () { alAgregar(); repintarPestana(); });
    return b;
  }

  // ----- Cálculos -----
  // Unidad que paga en efectivo: administración (6 %) y total, como en la planilla.
  function recalcularUnidad(u, tocoAdm) {
    if (u.forma !== "Efectivo") return;
    var base = (u.efectivo || 0) + (u.cochera || 0);
    if (!tocoAdm && (u.efectivo || u.cochera)) u.adm = redondo(base * ADM);
    if (u.efectivo || u.cochera || u.adm) u.total = redondo((u.efectivo || 0) + (u.cochera || 0) + (u.muniRentas || 0) + (u.punitorios || 0) - (u.adm || 0) - (u.arreglos || 0));
  }
  // Cada "total" de la liquidación es lo acumulado hasta ahí.
  function recalcularLiquidacion(d) {
    var acum = 0;
    (d.liquidacion || []).forEach(function (x) {
      if (x.tipo === "base") acum = x.monto || 0;
      else if (x.tipo === "descuento") acum -= x.monto || 0;
      else if (x.tipo === "ingreso") acum += x.monto || 0;
      else if (x.tipo === "total") x.monto = redondo(acum);
    });
  }
  function recalcularExpensas(d) {
    var imp = (d.expensas || {}).impuestos;
    if (!imp) return;
    imp.unidades.forEach(function (u) {
      if (typeof imp.rentasTotal === "number") u.rentas = redondo(imp.rentasTotal * (u.coeficiente || 0));
      if (typeof imp.muniTotal === "number") u.municipalidad = redondo(imp.muniTotal * (u.coeficiente || 0));
      u.total = redondo((u.rentas || 0) + (u.municipalidad || 0));
    });
    imp.total = redondo(suma(imp.unidades, "total"));
  }
  function recalcularTotales(d) {
    d.totalesPlanilla = d.totalesPlanilla || {};
    ["transferencia", "efectivo", "punitorios", "muniRentas", "cochera", "adm", "arreglos", "total"].forEach(function (k) {
      d.totalesPlanilla[k] = hay(d.unidades, k) ? redondo(suma(d.unidades, k)) : null;
    });
    d.cocherasTotal = (d.cocheras || []).length ? redondo(suma(d.cocheras, "monto")) : null;
    var pt = d.planillaTransferencias;
    if (pt) {
      var ult = pt.columnas.length - 1;
      pt.total = redondo(pt.filas.reduce(function (a, f) { return a + (typeof f.valores[ult] === "number" ? f.valores[ult] : 0); }, 0));
    }
    recalcularLiquidacion(d);
  }

  // ----- Datos -----
  // Al abrir la página se muestra al instante lo último guardado en este navegador y se
  // actualiza si el servidor trae algo distinto (conGuardado). Después de guardar se espera
  // al servidor. seleccion: la clave a mostrar, o una función que la elige con la lista.
  function cargar(seleccion, conGuardado) {
    var pintado = false;
    return BGPSesion.pedirConMemoria("obtenerPropiedades", {}, function (r, guardado) {
      // Lo que llega mientras se edita no cambia lo que está a la vista.
      if (pintado && borrador) return;
      lista = (r.liquidaciones || []).slice().sort(function (a, b) {
        return String(b.orden).localeCompare(String(a.orden)) || String(a.edificio).localeCompare(String(b.edificio));
      });
      // Si ya se mostró lo guardado, se mantiene lo que la persona tenga elegido.
      var elegida = pintado && actual ? clave(actual) : typeof seleccion === "function" ? seleccion(lista) : seleccion;
      armarSelector(elegida);
      mostrar();
      pintado = true;
    }, !conGuardado).then(function (r) {
      if (r.usuario) $("quien").textContent = r.usuario.nombre || r.usuario.usuario || "";
    }).catch(function (err) {
      if (pintado && !(err && err.sesion === false)) { console.error(err); return; }
      errorEn($("contenido"), err);
    });
  }
  function clave(x) { return x.edificio + "|" + x.periodo; }
  function armarSelector(seleccion) {
    var sel = $("periodo");
    sel.replaceChildren();
    lista.forEach(function (x) { var o = el("option", null, x.edificio + " · " + x.periodo); o.value = clave(x); sel.append(o); });
    sel.hidden = lista.length < 2;
    actual = lista.find(function (x) { return clave(x) === seleccion; }) || lista[0] || null;
    if (actual) sel.value = clave(actual);
  }
  $("periodo").addEventListener("change", function () {
    if (borrador && !confirm("Hay cambios sin guardar. ¿Descartarlos?")) { $("periodo").value = clave(actual); return; }
    borrador = null;
    actual = lista.find(function (x) { return clave(x) === $("periodo").value; }) || null;
    mostrar();
  });

  function guardar() {
    var d = copia(borrador);
    recalcularTotales(d);
    var b = $("btnGuardar");
    b.disabled = true; b.textContent = "Guardando…";
    return BGPSesion.pedir("guardarPropiedades", { datos: d, archivo: actual.archivo }).then(function () {
      borrador = null;
      return cargar(clave(actual));
    }).catch(function (err) {
      if (err && err.sesion === false) { irAlIngreso(); return; }
      alert("No se pudieron guardar los cambios: " + err.message);
      b.disabled = false; b.textContent = "Guardar cambios";
    });
  }

  // ----- Vista general -----
  function mostrar() {
    // Los contratos del edificio (teléfonos para "Recordarle"); al llegar se redibuja la pestaña.
    if (actual && window.PropContratos) PropContratos.cargar(actual.edificio).then(function () { if ((pestana === "unidades" || pestana === "rentabilidad") && !editando()) repintarPestana(); });
    // Valores y detalle de cada unidad (planilla aparte, propiedades-valores.js).
    if (actual && window.PropValores) PropValores.cargar(actual.edificio).then(function () { if ((pestana === "unidades" || pestana === "rentabilidad") && !editando()) repintarPestana(); }, function (err) { if (err && err.sesion === false) irAlIngreso(); });
    var caja = $("contenido");
    caja.replaceChildren();
    $("acciones").replaceChildren();
    pintarMenu();
    if (!actual) {
      $("tituloEdificio").textContent = "Propiedades";
      $("subEdificio").textContent = "";
      var v = el("section", "panel vacio-grande");
      v.append(el("h2", null, "Todavía no hay liquidaciones"),
        el("p", null, "Importá la planilla del mes (resumen de pagos con las hojas RESUMEN TOTAL, TRANSFERENCIAS y EFECTIVO). Se lee completa y queda guardada para consultarla y editarla acá."));
      var b = el("button", "boton", "Importar planilla");
      b.type = "button";
      b.addEventListener("click", function () { $("archivo").click(); });
      v.append(b);
      caja.append(v);
      return;
    }
    var d = datos();
    $("tituloEdificio").textContent = "Propiedades";
    $("subEdificio").textContent = "Período " + d.periodo + " · " + d.unidades.length + " unidades" + (editando() ? " · editando" : "");
    $("importar").hidden = editando();
    $("periodo").disabled = editando();

    // Editar / Guardar / Cancelar
    var acc = $("acciones");
    if (editando()) {
      var g = el("button", "boton", "Guardar cambios"); g.type = "button"; g.id = "btnGuardar";
      g.addEventListener("click", guardar);
      var c = el("button", "boton secundario", "Cancelar"); c.type = "button";
      c.addEventListener("click", function () { if (confirm("¿Descartar los cambios?")) { borrador = null; mostrar(); } });
      acc.append(c, g);
    } else {
      var e = el("button", "boton secundario", "Editar"); e.type = "button";
      e.addEventListener("click", function () { borrador = copia(actual.datos); mostrar(); });
      acc.append(e);
    }

    var cuerpo = el("div", null);
    cuerpo.id = "cuerpoPestana";
    caja.append(cuerpo);
    repintarPestana();
  }

  // Secciones en el menú lateral (sin liquidación cargada quedan desactivadas).
  function pintarMenu() {
    var menu = $("menu");
    menu.replaceChildren();
    PESTANAS.forEach(function (p) {
      var b = el("button", "lat-item" + (actual && pestana === p[0] ? " activa" : ""));
      b.type = "button";
      b.title = p[1];
      b.disabled = !actual;
      if (actual && pestana === p[0]) b.setAttribute("aria-current", "page");
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONOS[p[0]] + "</svg>";
      b.append(document.createTextNode(p[1]));
      b.addEventListener("click", function () {
        pestana = p[0];
        try { sessionStorage.setItem("prop-pestana", pestana); } catch (err) {}
        mostrar();
        window.scrollTo(0, 0);
      });
      menu.append(b);
      // En el celular el menú se desliza: la sección elegida queda a la vista.
      if (actual && pestana === p[0]) setTimeout(function () { try { b.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) {} }, 0);
    });
  }

  // Después de un cambio se redibuja cuando el foco ya pasó al campo siguiente (Tab),
  // y se devuelve el foco a ese mismo campo en la tabla nueva.
  function repintarLuego() { setTimeout(repintarPestana, 0); }
  function repintarPestana() {
    var cuerpo = $("cuerpoPestana");
    if (!cuerpo) return;
    var d = datos();
    if (editando()) recalcularTotales(d);
    // Unidades usa todo el ancho de la pantalla: así entran todas las columnas sin deslizar.
    document.body.classList.toggle("ancho", pestana === "unidades" || pestana === "rentabilidad" || pestana === "contratos");
    var previos = Array.prototype.slice.call(cuerpo.querySelectorAll("input, select, textarea, button"));
    var foco = previos.indexOf(document.activeElement);
    cuerpo.replaceChildren();
    if (pestana === "tablero") cuerpo.append(vistaTablero(d));
    else if (pestana === "historial") cuerpo.append(vistaHistorial(d));
    else if (pestana === "unidades") cuerpo.append(panelUnidades(d));
    else if (pestana === "rentabilidad") cuerpo.append(vistaRentabilidad(d));
    else if (pestana === "expensas") cuerpo.append(panelExpensas(d));
    else if (pestana === "cocheras") { var g = el("div", "grilla mitad"); g.append(panelCocheras(d), panelNovedades(d)); cuerpo.append(g); }
    else if (pestana === "transferencias") cuerpo.append(panelPlanillaTransferencias(d));
    else if (pestana === "contratos") cuerpo.append(PropContratos.panel(d, actual.edificio, repintarPestana));
    else cuerpo.append(vistaResumen(d));
    if (foco >= 0) { var f = cuerpo.querySelectorAll("input, select, textarea, button")[foco]; if (f) f.focus(); }
  }

  function panel(titulo, sub) {
    var p = el("section", "panel");
    p.append(el("h2", null, titulo));
    if (sub) p.append(el("p", "sub-panel", sub));
    return p;
  }

  // ----- Resumen -----
  function vistaResumen(d) {
    // Sin los avisos de controles ni las notas de la planilla (pedido): solo números y referencias.
    var box = el("div");
    box.append(kpis(d));
    var g = el("div", "grilla mitad");
    var der = el("div", "columna");
    der.append(panelReferencias(d));
    g.append(panelLiquidacion(d), der);
    box.append(g);
    return box;
  }

  function liqDe(d, re) { return (d.liquidacion || []).find(function (x) { return re.test(x.concepto.toUpperCase()); }) || null; }

  function kpis(d) {
    var box = el("section", "kpis");
    box.setAttribute("aria-label", "Resumen");
    var totales = (d.liquidacion || []).filter(function (x) { return x.tipo === "total"; });
    var cobrado = totales[totales.length - 1] || liqDe(d, /^TOTAL COBRADO/);
    var transf = (d.liquidacion || []).filter(function (x) { return x.tipo === "ingreso"; });
    var efectivo = totales.length > 1 ? totales[0] : liqDe(d, /^TOTAL EFECTIVO/);
    var nT = d.unidades.filter(function (u) { return u.forma === "Transfiere"; }).length;
    var nE = d.unidades.filter(function (u) { return u.forma === "Efectivo"; }).length;
    [
      ["Total cobrado", pesos(cobrado && cobrado.monto), "Efectivo + transferencias"],
      ["Transferencias", pesos(transf.length ? suma(transf, "monto") : null), nT + " unidad(es) transfieren"],
      ["Efectivo", pesos(efectivo && efectivo.monto), nE + " unidad(es) · neto de descuentos"],
      ["Unidades", String(d.unidades.length), nT + " transfieren · " + nE + " en efectivo"],
      ["Cocheras", pesos(typeof d.cocherasTotal === "number" ? d.cocherasTotal : suma(d.cocheras || [], "monto")), (d.cocheras || []).length + " cochera(s)"]
    ].forEach(function (x) { var k = el("div", "kpi"); k.append(el("small", null, x[0]), el("b", null, x[1]), el("span", null, x[2])); box.append(k); });
    return box;
  }

  function panelLiquidacion(d) {
    var p = panel("Liquidación del mes", editando() ? "Los totales se calculan solos: base − descuentos + ingresos." : "");
    var ul = el("ul", "liq");
    var totales = (d.liquidacion || []).filter(function (x) { return x.tipo === "total"; });
    (d.liquidacion || []).forEach(function (x, i) {
      var li = el("li", x.tipo + (x === totales[totales.length - 1] ? " final" : ""));
      if (editando() && x.tipo !== "total") {
        li.append(campoTxt(x.concepto, function (v) { x.concepto = v; }, { titulo: "Concepto", cls: "ancho" }));
        var lado = el("span", "lado");
        lado.append(campoNum(x.monto, function (v) { x.monto = v; }, { titulo: "Monto de " + x.concepto }));
        if (x.tipo !== "base") lado.append(botonQuitar(function () { d.liquidacion.splice(i, 1); }, "Quitar " + x.concepto));
        li.append(lado);
      } else {
        li.append(el("span", null, x.concepto), el("span", "m", pesos(x.monto)));
      }
      ul.append(li);
    });
    p.append(ul);
    if (editando()) {
      var acc = el("div", "agregar");
      var base = (d.liquidacion || []).find(function (x) { return x.tipo === "base"; });
      var sumaU = d.totalesPlanilla && d.totalesPlanilla.total;
      // Nuevo descuento: después del último descuento (o de la base); nuevo ingreso: antes del último total.
      acc.append(botonAgregar("Descuento", function () {
        var idx = -1;
        d.liquidacion.forEach(function (x, i) { if (x.tipo === "base" || x.tipo === "descuento") idx = i; });
        d.liquidacion.splice(idx + 1, 0, { concepto: "Nuevo descuento", monto: 0, tipo: "descuento", formula: "" });
      }));
      acc.append(botonAgregar("Ingreso", function () {
        var idx = d.liquidacion.length - 1;
        d.liquidacion.splice(idx, 0, { concepto: "Nuevo ingreso", monto: 0, tipo: "ingreso", formula: "" });
      }));
      if (base && typeof sumaU === "number" && Math.abs((base.monto || 0) - sumaU) >= 0.01) {
        var usar = el("button", "boton secundario chico", "Usar la suma de las unidades (" + pesos(sumaU) + ")");
        usar.type = "button";
        usar.addEventListener("click", function () { base.monto = redondo(sumaU); repintarPestana(); });
        acc.append(usar);
      }
      p.append(acc);
    }
    // El recibo ("Recibí la suma TOTAL de…" y la firma) ya no se muestra; el dato queda guardado.
    return p;
  }

  function panelReferencias(d) {
    var p = panel("Referencias", "Colores de cada unidad según su estado.");
    var refs = el("ul", "refs");
    (d.referencias || []).forEach(function (r) {
      var li = el("li"), m = el("span", "marca-color");
      m.style.background = "#" + (r.color || "FFFFFF");
      li.append(m, document.createTextNode(r.texto));
      refs.append(li);
    });
    p.append(refs);
    return p;
  }

  // ----- Tablero -----
  // De un vistazo: cuánto se cobró, quién no pagó y qué cambió contra el mes anterior,
  // por lugar. Usa la liquidación que se está viendo (o el borrador si se edita).
  var fmtCorto = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });
  function corto(n) { return typeof n !== "number" ? "—" : "$ " + fmtCorto.format(n); }
  function pct1(n) { return (n * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + " %"; }
  /** Lo que pagó la unidad en el mes: la transferencia o el efectivo (sin descuentos). */
  function montoUnidad(u) {
    if (typeof u.transferencia === "number" && u.transferencia) return u.transferencia;
    if (typeof u.efectivo === "number" && u.efectivo) return u.efectivo;
    return typeof u.total === "number" && u.total ? u.total : null;
  }
  /** "no-abono", "desocupado" o "pago". */
  function situacion(u) {
    if (u.estado === "no-abono") return "no-abono";
    if (u.estado === "desocupado") return "desocupado";
    return montoUnidad(u) === null ? "no-abono" : "pago";
  }
  /** Pagó en efectivo un mes anterior al de la liquidación (viene atrasado). */
  function atrasada(u, d) {
    return u.forma === "Efectivo" && !!u.mes && !!d.orden && String(u.mes).slice(0, 7) < String(d.orden).slice(0, 7);
  }
  function delEdificio(d) {
    return lista.filter(function (x) { return x.edificio === d.edificio; })
      .sort(function (a, b) { return String(a.orden).localeCompare(String(b.orden)); });
  }
  function anteriorDe(d) {
    var previas = delEdificio(d).filter(function (x) { return String(x.orden) < String(d.orden); });
    return previas.length ? previas[previas.length - 1].datos : null;
  }
  function porClave(d) {
    var m = {};
    (d && d.unidades || []).forEach(function (u) { m[u.clave || u.unidad] = u; });
    return m;
  }
  function verHistorial(u) {
    hist.unidad = u.clave || u.unidad;
    hist.texto = "";
    pestana = "historial";
    try { sessionStorage.setItem("prop-pestana", pestana); } catch (e) {}
    mostrar();
  }

  function vistaTablero(d) {
    var box = el("div", "tablero");
    var us = d.unidades || [];
    var ocupadas = us.filter(function (u) { return situacion(u) !== "desocupado"; });
    var pagas = us.filter(function (u) { return situacion(u) === "pago"; });
    var morosas = us.filter(function (u) { return situacion(u) === "no-abono"; });
    var atrasos = us.filter(function (u) { return atrasada(u, d); });
    var cobrado = pagas.reduce(function (a, u) { return a + montoUnidad(u); }, 0);
    var ant = anteriorDe(d), antU = porClave(ant);
    var cobradoAnt = ant ? (ant.unidades || []).reduce(function (a, u) { return a + (situacion(u) === "pago" ? montoUnidad(u) : 0); }, 0) : null;

    // Indicadores
    var k = el("section", "kpis");
    var delta = cobradoAnt ? (cobrado - cobradoAnt) / cobradoAnt : null;
    [
      ["Cobrado del mes", pesos(cobrado), delta === null ? pagas.length + " unidad(es) pagaron" : (delta >= 0 ? "▲ " : "▼ ") + pct1(Math.abs(delta)) + " contra " + ant.periodo, delta !== null && delta < -0.005 ? "baja" : ""],
      ["Al día", pagas.length + " de " + ocupadas.length, ocupadas.length ? pct1(pagas.length / ocupadas.length) + " de las ocupadas" : "Sin unidades ocupadas", ""],
      ["No abonaron", String(morosas.length), morosas.length ? morosas.map(function (u) { return u.unidad; }).slice(0, 6).join(", ") + (morosas.length > 6 ? "…" : "") : "Nadie debe este mes", morosas.length ? "alerta" : "ok"],
      ["Pagos atrasados", String(atrasos.length), atrasos.length ? "Pagaron en efectivo un mes anterior" : "Ninguno", atrasos.length ? "aviso" : ""],
      ["Desocupadas", String(us.length - ocupadas.length), us.length + " unidades en total", ""]
    ].forEach(function (x) {
      var c = el("div", "kpi" + (x[3] ? " " + x[3] : ""));
      c.append(el("small", null, x[0]), el("b", null, x[1]), el("span", null, x[2]));
      k.append(c);
    });
    box.append(k);

    var g = el("div", "grilla mitad");
    // Por lugar: barra con cómo pagó cada unidad.
    var pl = panel("Por lugar", "Cómo se cobró cada lugar este mes. Tocá una unidad en rojo para ver su historial.");
    lugaresDe(d).forEach(function (l) {
      var del = us.filter(function (u) { return lugarDe(d, u) === l; });
      if (!del.length) return;
      var n = { transfiere: 0, efectivo: 0, "no-abono": 0, desocupado: 0 };
      var total = 0;
      del.forEach(function (u) {
        var s = situacion(u);
        if (s === "pago") { n[u.forma === "Efectivo" ? "efectivo" : "transfiere"]++; total += montoUnidad(u); }
        else n[s]++;
      });
      var fila = el("div", "lugar");
      var cab = el("div", "lugar-cab");
      cab.append(el("b", null, l), el("span", "lugar-monto", pesos(total)));
      var barra = el("div", "barra-lugar");
      barra.setAttribute("role", "img");
      barra.setAttribute("aria-label", l + ": " + n.transfiere + " transfieren, " + n.efectivo + " en efectivo, " + n["no-abono"] + " no abonaron, " + n.desocupado + " desocupadas");
      [["transfiere", "Transfieren"], ["efectivo", "Efectivo"], ["no-abono", "No abonó"], ["desocupado", "Desocupadas"]].forEach(function (s) {
        if (!n[s[0]]) return;
        var seg = el("span", "seg " + s[0]);
        seg.style.flexGrow = String(n[s[0]]);
        seg.title = s[1] + ": " + n[s[0]];
        barra.append(seg);
      });
      var det = el("div", "lugar-det");
      det.textContent = del.length + " unidad(es) · " + (n.transfiere + n.efectivo) + " pagaron" + (n["no-abono"] ? " · " : "");
      if (n["no-abono"]) {
        del.filter(function (u) { return situacion(u) === "no-abono"; }).forEach(function (u, i) {
          if (i) det.append(document.createTextNode(", "));
          var b = el("button", "link rojo", u.unidad);
          b.type = "button";
          b.title = "Ver el historial de " + u.unidad + (u.inquilino ? " (" + u.inquilino + ")" : "");
          b.addEventListener("click", function () { verHistorial(u); });
          det.append(b);
        });
        det.append(document.createTextNode(" no abonaron"));
      }
      fila.append(cab, barra, det);
      pl.append(fila);
    });
    var ley = el("div", "leyenda");
    [["transfiere", "Transfieren"], ["efectivo", "Efectivo"], ["no-abono", "No abonó"], ["desocupado", "Desocupada"]].forEach(function (s) {
      var i = el("span"); i.append(el("i", "seg " + s[0]), document.createTextNode(s[1])); ley.append(i);
    });
    pl.append(ley);

    // Para revisar: morosos, atrasos y cambios contra el mes anterior.
    var pr = panel("Para revisar", ant ? "Comparado con " + ant.periodo + "." : "Es la primera liquidación de este edificio: todavía no hay mes anterior para comparar.");
    var items = [];
    us.forEach(function (u) {
      var a = antU[u.clave || u.unidad], s = situacion(u), m = montoUnidad(u);
      if (s === "no-abono") items.push({ u: u, tono: "rojo", txt: "No abonó" + (a && situacion(a) === "pago" ? " · el mes pasado pagó " + pesos(montoUnidad(a)) : a && situacion(a) === "no-abono" ? " · segundo mes seguido" : "") });
      if (atrasada(u, d)) items.push({ u: u, tono: "oro", txt: "Pagó en efectivo el mes de " + (u.mesTexto || u.mes) });
      if (typeof u.punitorios === "number" && u.punitorios > 0) items.push({ u: u, tono: "oro", txt: "Punitorios por " + pesos(u.punitorios) });
      if (!a) return;
      if (a.inquilino && u.inquilino && normalizarTxt(a.inquilino) !== normalizarTxt(u.inquilino)) items.push({ u: u, tono: "azul", txt: "Cambió el inquilino: antes " + a.inquilino });
      var ma = situacion(a) === "pago" ? montoUnidad(a) : null;
      if (s === "pago" && ma && m && Math.abs(m - ma) / ma >= 0.15) items.push({ u: u, tono: "azul", txt: "Pagó " + pesos(m) + " (antes " + pesos(ma) + ", " + (m > ma ? "+" : "−") + pct1(Math.abs(m - ma) / ma) + ")" });
      if (situacion(a) === "desocupado" && s === "pago") items.push({ u: u, tono: "verde", txt: "Se ocupó: antes estaba desocupada" });
    });
    if (!items.length) pr.append(el("p", "ok-linea", "Todo en orden: nadie debe y no hay cambios raros."));
    var ul = el("ul", "revisar");
    var orden = { rojo: 0, oro: 1, azul: 2, verde: 3 };
    items.sort(function (a, b) { return orden[a.tono] - orden[b.tono]; }).forEach(function (it) {
      var li = el("li", it.tono);
      var b = el("button", "link", it.u.unidad);
      b.type = "button";
      b.title = "Ver el historial";
      b.addEventListener("click", function () { verHistorial(it.u); });
      li.append(b, el("span", "quien", it.u.inquilino || ""), el("span", "que", it.txt));
      ul.append(li);
    });
    pr.append(ul);
    g.append(pl, pr);
    box.append(g);
    return box;
  }

  // ----- Historial -----
  // Una fila por unidad y una columna por mes (los últimos 12 del edificio): de un
  // vistazo se ve quién paga siempre, quién se atrasa y quién dejó de pagar.
  function normalizarTxt(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim(); }

  function vistaHistorial(d) {
    var box = el("div");
    // Si se está editando, la columna del mes que se ve muestra el borrador.
    var meses = delEdificio(d).slice(-12).map(function (x) { return x === actual ? d : x.datos; });
    var p = panel("Historial de pagos", "Últimos " + meses.length + " mes(es) cargados de este edificio. Tocá una unidad para ver el detalle.");
    var herr = el("div", "herramientas");
    var buscar = el("input"); buscar.type = "search"; buscar.placeholder = "Buscar por unidad o inquilino (también inquilinos anteriores)"; buscar.setAttribute("aria-label", "Buscar"); buscar.value = hist.texto;
    buscar.addEventListener("input", function () { hist.texto = buscar.value; pintarGrilla(); });
    herr.append(buscar);
    p.append(herr);

    // Unidades: las del mes que se ve, más las que estaban antes y ya no.
    var unidades = [], vistas = {};
    meses.slice().reverse().forEach(function (m) {
      (m.unidades || []).forEach(function (u) {
        var c = u.clave || u.unidad;
        if (vistas[c]) { if (u.inquilino && vistas[c].inquilinos.indexOf(u.inquilino) < 0) vistas[c].inquilinos.push(u.inquilino); return; }
        vistas[c] = { clave: c, unidad: u.unidad, inquilino: u.inquilino || "", inquilinos: u.inquilino ? [u.inquilino] : [], lugar: lugarDe(m, u) };
        unidades.push(vistas[c]);
      });
    });
    var caja = el("div", "tabla-scroll");
    var detalle = el("div");
    p.append(caja, el("div", "leyenda historial-ley"));
    var ley = p.lastChild;
    [["transfiere", "Transfirió"], ["efectivo", "Efectivo"], ["atraso", "Pagó atrasado"], ["no-abono", "No abonó"], ["desocupado", "Desocupada"]].forEach(function (s) {
      var i = el("span"); i.append(el("i", "seg " + s[0]), document.createTextNode(s[1])); ley.append(i);
    });
    box.append(p, detalle);

    function celdaDe(m, c) {
      var u = porClave(m)[c];
      if (!u) return { cls: "vacia", txt: "", tit: "No figura" };
      var s = situacion(u);
      if (s === "desocupado") return { cls: "desocupado", txt: "—", tit: "Desocupada" };
      if (s === "no-abono") return { cls: "no-abono", txt: "No", tit: "No abonó" + (u.inquilino ? " · " + u.inquilino : "") };
      var at = atrasada(u, m);
      return { cls: at ? "atraso" : (u.forma === "Efectivo" ? "efectivo" : "transfiere"), txt: corto(montoUnidad(u)) + (u.punitorios > 0 ? " •" : ""),
        tit: (u.forma || "") + " " + pesos(montoUnidad(u)) + (at ? " · pagó el mes de " + (u.mesTexto || u.mes) : "") + (u.punitorios > 0 ? " · punitorios " + pesos(u.punitorios) : "") + (u.inquilino ? " · " + u.inquilino : "") };
    }

    function pintarGrilla() {
      var q = normalizarTxt(hist.texto);
      var filas = unidades.filter(function (x) { return !q || normalizarTxt(x.unidad + " " + x.inquilinos.join(" ")).indexOf(q) >= 0; });
      var t = el("table", "historial");
      var thead = el("thead"), tr = el("tr");
      tr.append(el("th", null, "Unidad"));
      meses.forEach(function (m) { tr.append(el("th", "mes", m.periodo || m.orden)); });
      tr.append(el("th", "num", "Pagó"));
      thead.append(tr);
      var tbody = el("tbody");
      filas.forEach(function (x) {
        var r = el("tr", hist.unidad === x.clave ? "abierta" : "");
        var cu = el("td", "unidad");
        var b = el("button", "link", x.unidad);
        b.type = "button";
        b.addEventListener("click", function () { hist.unidad = hist.unidad === x.clave ? "" : x.clave; pintarGrilla(); pintarDetalle(); });
        cu.append(b, el("span", "sub", x.inquilino || "—"));
        r.append(cu);
        var pagos = 0, ocup = 0;
        meses.forEach(function (m) {
          var c = celdaDe(m, x.clave);
          if (c.cls !== "vacia" && c.cls !== "desocupado") ocup++;
          if (c.cls === "transfiere" || c.cls === "efectivo" || c.cls === "atraso") pagos++;
          var td = el("td", "celda-mes " + c.cls, c.txt);
          td.title = (m.periodo || "") + ": " + c.tit;
          r.append(td);
        });
        r.append(el("td", "num" + (ocup && pagos < ocup ? " rojo" : ""), ocup ? pagos + "/" + ocup : "—"));
        tbody.append(r);
      });
      if (!filas.length) { var v = el("tr"); var td = el("td", "vacio", "Ninguna unidad coincide con la búsqueda."); td.colSpan = meses.length + 2; v.append(td); tbody.append(v); }
      t.append(thead, tbody);
      caja.replaceChildren(t);
    }

    function pintarDetalle() {
      detalle.replaceChildren();
      var x = vistas[hist.unidad];
      if (!x) return;
      var pd = panel("Unidad " + x.unidad, x.inquilinos.length > 1 ? "Inquilinos: " + x.inquilinos.join(" · ") : (x.inquilino || ""));
      var w = el("div", "tabla-scroll"), t = el("table");
      var tr = el("tr");
      ["Período", "Inquilino", "Pago", "Mes pagado", "Monto", "Punitorios", "Arreglos"].forEach(function (h, i) { tr.append(el("th", i >= 4 ? "num" : "", h)); });
      var thead = el("thead"); thead.append(tr);
      var tbody = el("tbody");
      meses.slice().reverse().forEach(function (m) {
        var u = porClave(m)[x.clave];
        if (!u) return;
        var r = el("tr", atrasada(u, m) ? "fila-atraso" : "");
        var cp = el("td"); cp.append(pillEstado(u));
        r.append(el("td", null, m.periodo || m.orden), el("td", null, u.inquilino || "—"), cp, el("td", null, u.mesTexto || (u.forma === "Transfiere" ? "—" : "")),
          el("td", "num", pesos(montoUnidad(u))), el("td", "num" + (u.punitorios > 0 ? " rojo" : " cero"), pesos(u.punitorios || 0)), el("td", "num cero", typeof u.arreglos === "number" ? pesos(u.arreglos) : "—"));
        tbody.append(r);
      });
      t.append(thead, tbody); w.append(t); pd.append(w);
      detalle.append(pd);
    }

    pintarGrilla();
    pintarDetalle();
    return box;
  }

  // ----- Unidades -----
  /**
   * Las unidades de la liquidación más las que tienen contrato pero todavía no figuran en ella
   * (por ejemplo un galpón nuevo de Polo 52): esas se ven en Unidades y en Rentabilidad, sin montos del mes.
   */
  /** Nombre del lote en el mapa (KML) de una unidad cuyo nombre en la app es otro, o "". */
  function loteDe(u) {
    if (!window.PropValores || !PropValores.unidadesMapa) return "";
    var k = LectorPropiedades.claveUnidad(u.unidad);
    var x = PropValores.unidadesMapa().find(function (m) { return LectorPropiedades.claveUnidad(m.unidad) === k; });
    return x && LectorPropiedades.claveUnidad(x.nombre) !== k ? x.nombre : "";
  }
  function unidadesConContratos(d) {
    var extra = window.PropContratos && PropContratos.sinUnidad && actual ? PropContratos.sinUnidad(actual.edificio, d.unidades) : [];
    // Las unidades del mapa (lotes importados de Google Earth) que no están ni en la liquidación ni en un contrato.
    if (window.PropValores && PropValores.unidadesMapa) {
      var ya = {};
      d.unidades.concat(extra).forEach(function (u) { ya[LectorPropiedades.claveUnidad(u.unidad)] = true; });
      PropValores.unidadesMapa().forEach(function (m) {
        var k = LectorPropiedades.claveUnidad(m.unidad);
        if (ya[k]) return;
        ya[k] = true;
        extra.push({ unidad: m.unidad, inquilino: "", lugar: m.lugar, soloMapa: true });
      });
    }
    // Montos del mes de la liquidación que se ve: Transferencia = lo que paga el inquilino (total con
    // IVA si se facturó, subtotal si no) y Total = lo que cobra Andrés. Sin marcar si se facturó, sin montos.
    var mes = d.orden ? String(d.orden).substring(0, 7) + "-01" : "";
    return d.unidades.concat(extra.map(function (x) {
      var u = { unidad: x.unidad, clave: LectorPropiedades.claveUnidad(x.unidad), inquilino: x.inquilino, lugar: x.lugar || lugaresDe(d)[0], soloContrato: !x.soloMapa, soloMapa: !!x.soloMapa };
      var q = PropContratos.cuotaDe ? PropContratos.cuotaDe(actual.edificio, x.unidad, mes) : null;
      if (q) {
        u.cuota = q;
        if (q.paga !== null) { u.transferencia = redondo(q.paga); u.efectivo = 0; u.cochera = 0; u.adm = 0; u.total = redondo(q.aCobrar); }
      }
      return u;
    }));
  }
  function pillEstado(u) {
    var f = el("div");
    if (u.soloMapa) { f.append(el("span", "pill contrato", "En el mapa"), el("span", "sub", "Sin contrato ni liquidación todavía")); return f; }
    if (u.soloContrato) {
      f.append(el("span", "pill contrato", "Contrato"));
      var q = u.cuota;
      if (q && q.facturado) f.append(el("span", "sub", "Cuota " + q.cuota + " · " + (q.facturado === "SI" ? "con factura" : "sin factura") + " · cobra el " + String(q.participacion).replace(".", ",") + " %"));
      else if (q) f.append(el("span", "sub aviso-txt", "Cuota " + q.cuota + ": falta marcar si se facturó (Contratos → Ver cuotas)"));
      else f.append(el("span", "sub", "Todavía no está en la liquidación"));
      return f;
    }
    f.append(el("span", "pill " + (u.estado || ""), u.estado === "no-abono" ? "No abonó" : u.estado === "desocupado" ? "Desocupado" : u.estado === "amoblado" ? "Amoblado" : (u.forma || "—")));
    if (u.amoblado && u.estado !== "amoblado") { f.append(document.createTextNode(" ")); f.append(el("span", "pill amoblado", "Amoblado")); }
    if (u.mesTexto) f.append(el("span", "sub", u.mesTexto));
    return f;
  }
  var COLS = [
    ["transferencia", "Transferencia"], ["efectivo", "Efectivo"], ["punitorios", "Punitorios"], ["muniRentas", "Muni y rentas"],
    ["cochera", "Cochera"], ["adm", "Adm. (6 %)"], ["arreglos", "Arreglos"], ["total", "Total"]
  ];
  // Valores de cada unidad (se cargan a mano con la "i"; el rendimiento se calcula solo).
  var COLS_VALOR = [["valorReal", "Valor real"], ["precioCompra", "Precio de compra"], ["rendimiento", "Alquiler · rend."], ["ventaEstimada", "Venta estimada"]];
  /** Alquiler mensual de la unidad: el del contrato o, si no hay, lo que pagó en la liquidación. */
  function alquilerDe(u) {
    var c = window.PropContratos && actual ? PropContratos.montoDe(actual.edificio, u.unidad) : null;
    if (c) return { monto: c, fuente: PropContratos.fuenteDe ? PropContratos.fuenteDe(actual.edificio, u.unidad) : "Según el contrato" };
    var m = montoUnidad(u);
    return { monto: m, fuente: m ? "Lo que pagó en " + (datos().periodo || "la liquidación") : "" };
  }
  /** Promedio mensual de arreglos de la unidad en los últimos 12 meses del edificio (los descuenta la liquidación). */
  function arreglosMes(u, d) {
    var meses = delEdificio(d).slice(-12).map(function (x) { return x === actual ? d : x.datos; });
    if (meses.indexOf(d) < 0) meses.push(d);
    var k = u.clave || u.unidad, total = 0;
    meses.forEach(function (m) {
      var x = (m.unidades || []).find(function (y) { return (y.clave || y.unidad) === k; });
      if (x && typeof x.arreglos === "number") total += x.arreglos;
    });
    return meses.length ? total / meses.length : 0;
  }
  /** Lo que necesitan la ficha ("i") y Rentabilidad para calcular el neto de una unidad. */
  function ctxUnidad(u, d) {
    var alq = alquilerDe(u);
    return { edificio: actual.edificio, lugar: lugarDe(d, u), alquiler: alq.monto, fuente: alq.fuente,
      adm: typeof u.adm === "number" ? u.adm : 0, arreglosMes: arreglosMes(u, d), alGuardar: repintarPestana };
  }
  var COLORES_ESTADO = { transfiere: "A8D08D", efectivo: "FFFFFF", "no-abono": "FF0000", desocupado: "A5A5A5", amoblado: "8EAADB" };
  var MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  // Importe de PropValores en una celda; si es el estimado de la zona, en gris y con aviso.
  function celdaValor(v, k, cls) {
    var est = PropValores.esEstimado(v, k);
    var td = el("td", cls + (est ? " estimado" : ""), (est ? "≈ " : "") + pesos0(v[k]));
    if (est) td.title = "Estimado para la zona. Cargá el valor real con la “i”.";
    return td;
  }

  function panelUnidades(d) {
    var ed = editando();
    var p = panel("Unidades", ed ? "Al cambiar efectivo o cochera de una unidad que paga en efectivo, la administración (6 %) y el total se calculan solos." : "Cada unidad con su inquilino, cómo pagó, la liquidación de los que pagan en efectivo y sus valores (importes en pesos). Tocá la “i” para ver y cargar el detalle y los valores.");
    var conValores = !ed && !!window.PropValores;
    var todas = ed ? d.unidades : unidadesConContratos(d);
    if (conValores && PropValores.error()) p.append(el("div", "alerta error", PropValores.error()));
    // Pestañas por lugar, con la cantidad de unidades de cada uno.
    var subs = el("div", "pestanas sub");
    subs.setAttribute("role", "tablist");
    subs.setAttribute("aria-label", "Lugares");
    [["", "Todas", todas.length]].concat(lugaresDe(d).map(function (l) {
      return [l, l, todas.filter(function (u) { return lugarDe(d, u) === l; }).length];
    })).forEach(function (x) {
      var b = el("button", "pestana" + (filtro.lugar === x[0] ? " activa" : ""));
      b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", filtro.lugar === x[0] ? "true" : "false");
      b.append(document.createTextNode(x[1] + " "), el("span", "cuenta", String(x[2])));
      b.addEventListener("click", function () { filtro.lugar = x[0]; repintarPestana(); });
      subs.append(b);
    });
    p.append(subs);
    var herr = el("div", "herramientas");
    var buscar = el("input"); buscar.type = "search"; buscar.placeholder = "Buscar por unidad o inquilino"; buscar.setAttribute("aria-label", "Buscar"); buscar.value = filtro.texto;
    var sel = el("select"); sel.setAttribute("aria-label", "Forma de pago");
    [["", "Todas las unidades"], ["Transfiere", "Transfieren"], ["Efectivo", "Pagan en efectivo"]].forEach(function (o) { var x = el("option", null, o[1]); x.value = o[0]; sel.append(x); });
    sel.value = filtro.forma;
    herr.append(buscar, sel);
    if (conValores && PropValores.url()) {
      var lp = el("a", "boton secundario chico", "Planilla de Propiedades");
      lp.href = PropValores.url(); lp.target = "_blank"; lp.rel = "noopener";
      lp.title = "Abre la planilla de Google de Propiedades (liquidaciones, contratos, ubicaciones y valores; aparte de la de Tesorería)";
      herr.append(lp);
    }
    p.append(herr);
    var cols = ed ? COLS : COLS.filter(function (c) { return hay(d.unidades, c[0]); });
    // Encabezado (y totales) fijos: la tabla se desplaza dentro de su caja.
    var wrap = el("div", "tabla-scroll fija"), t = el("table", ed ? "editable" : "");
    var thead = el("thead"), tr = el("tr");
    tr.append(el("th", null, "Unidad"), el("th", null, "Pago"));
    cols.forEach(function (c) { tr.append(el("th", "num", c[1])); });
    tr.append(el("th", "num", "Coef. expensas"));
    if (conValores) COLS_VALOR.forEach(function (c, i) { tr.append(el("th", "num" + (i === 0 ? " valor-ini" : ""), c[1])); });
    if (ed) tr.append(el("th", null, ""));
    thead.append(tr);
    var tbody = el("tbody"), tfoot = el("tfoot");
    t.append(thead, tbody, tfoot); wrap.append(t); p.append(wrap);

    function filaVista(u) {
      var r = el("tr");
      var cu = el("td", "unidad"), m = el("span", "marca-color");
      m.style.background = "#" + (u.color || "FFFFFF");
      cu.append(m, document.createTextNode(u.unidad));
      var alq = conValores ? alquilerDe(u) : null;
      if (conValores) cu.append(PropValores.botonInfo(u, ctxUnidad(u, d)));
      var lote = loteDe(u);
      cu.append(el("span", "sub", (u.inquilino || "—") + (lote ? " · " + lote : "")));
      var cp = el("td"); cp.append(pillEstado(u));
      // Unidad que no abonó: mensaje de WhatsApp listo para el inquilino (propiedades-contratos.js).
      if (u.estado === "no-abono" && window.PropContratos) cp.append(PropContratos.botonRecordar(u, d, actual.edificio));
      r.append(cu, cp);
      cols.forEach(function (c) { var v = u[c[0]]; r.append(el("td", "num" + (v === 0 ? " cero" : ""), typeof v === "number" ? pesos0(v) : "—")); });
      r.append(el("td", "num", pct(u.coeficiente)));
      if (conValores) {
        var v = PropValores.de(u, lugarDe(d, u)) || {};
        var rd = PropValores.rendimiento(v, alq.monto);
        r.append(celdaValor(v, "valorReal", "num valor-ini"), celdaValor(v, "precioCompra", "num"));
        var tdr = el("td", "num" + (PropValores.esEstimado(v, "precioCompra") ? " estimado" : ""));
        tdr.append(el("b", "rend", rd === null ? "—" : pct1(rd)), el("span", "sub", alq.monto ? pesos0(alq.monto) + " / mes" : "Sin alquiler"));
        tdr.title = rd === null ? "" : "Alquiler × 12 sobre el precio de compra" + (PropValores.esEstimado(v, "precioCompra") ? " (compra estimada)" : "");
        r.append(tdr, celdaValor(v, "ventaEstimada", "num"));
      }
      return r;
    }
    function filaEdicion(u, idx) {
      var r = el("tr");
      var cu = el("td", "unidad");
      var iu = campoTxt(u.unidad, function (v) { u.unidad = v; u.clave = LectorPropiedades.claveUnidad(v); }, { titulo: "Unidad", cls: "corto" });
      var ii = campoTxt(u.inquilino, function (v) { u.inquilino = v; }, { titulo: "Inquilino de " + u.unidad, placeholder: "Inquilino" });
      var ls = el("select", "celda");
      ls.setAttribute("aria-label", "Lugar de " + u.unidad);
      lugaresDe(d).forEach(function (l) { var x = el("option", null, l); x.value = l; ls.append(x); });
      ls.value = lugarDe(d, u);
      ls.addEventListener("change", function () { u.lugar = ls.value; repintarLuego(); });
      cu.append(iu, ii, ls);
      var cp = el("td");
      var fs = el("select", "celda");
      fs.setAttribute("aria-label", "Forma de pago de " + u.unidad);
      [["Transfiere", "Transfiere"], ["Efectivo", "Efectivo"], ["", "Sin dato"]].forEach(function (o) { var x = el("option", null, o[1]); x.value = o[0]; fs.append(x); });
      fs.value = u.forma === "Transfiere" || u.forma === "Efectivo" ? u.forma : "";
      fs.addEventListener("change", function () {
        u.forma = fs.value;
        if (u.forma === "Efectivo" && !u.mes) { u.mes = d.orden || ""; u.mesTexto = d.orden ? MESES[+d.orden.slice(5, 7) - 1] + "-" + d.orden.slice(2, 4) : ""; }
        if (u.forma !== "Efectivo") { u.mes = ""; u.mesTexto = ""; }
        if (["no-abono", "desocupado", "amoblado"].indexOf(u.estado) < 0) u.estado = u.forma === "Transfiere" ? "transfiere" : u.forma === "Efectivo" ? "efectivo" : "";
        if (u.estado === "transfiere" || u.estado === "efectivo") u.color = COLORES_ESTADO[u.estado];
        repintarPestana();
      });
      var es = el("select", "celda");
      es.setAttribute("aria-label", "Estado de " + u.unidad);
      [["", "Al día"], ["no-abono", "No abonó"], ["desocupado", "Desocupado"], ["amoblado", "Amoblado"]].forEach(function (o) { var x = el("option", null, o[1]); x.value = o[0]; es.append(x); });
      es.value = ["no-abono", "desocupado", "amoblado"].indexOf(u.estado) >= 0 ? u.estado : (u.amoblado ? "amoblado" : "");
      es.addEventListener("change", function () {
        u.amoblado = es.value === "amoblado";
        u.estado = es.value || (u.forma === "Transfiere" ? "transfiere" : u.forma === "Efectivo" ? "efectivo" : "");
        u.color = COLORES_ESTADO[u.estado] || u.color;
        repintarPestana();
      });
      cp.append(fs, es);
      if (u.forma === "Efectivo") {
        var mi = el("input", "celda"); mi.type = "month"; mi.value = u.mes || "";
        mi.setAttribute("aria-label", "Mes de pago de " + u.unidad);
        mi.addEventListener("change", function () { u.mes = mi.value; u.mesTexto = mi.value ? MESES[+mi.value.slice(5, 7) - 1] + "-" + mi.value.slice(2, 4) : ""; });
        cp.append(mi);
      }
      r.append(cu, cp);
      cols.forEach(function (c) {
        var td = el("td");
        var inp = campoNum(u[c[0]], function (v) { u[c[0]] = v; recalcularUnidad(u, c[0] === "adm"); }, { titulo: c[1] + " de " + u.unidad });
        if (c[0] === "total" && u.forma === "Efectivo") inp.classList.add("calculado");
        td.append(inp);
        r.append(td);
      });
      var tc = el("td");
      tc.append(campoNum(u.coeficiente, function (v) { u.coeficiente = v; sincronizarCoef(d, u); }, { pct: true, titulo: "Coeficiente de " + u.unidad }));
      r.append(tc);
      var tq = el("td");
      tq.append(botonQuitar(function () { d.unidades.splice(idx, 1); }, "Quitar " + u.unidad));
      r.append(tq);
      return r;
    }
    function pintar() {
      var q = filtro.texto.trim().toLowerCase();
      tbody.replaceChildren();
      var filas = [];
      todas.forEach(function (u, i) {
        if (filtro.lugar && lugarDe(d, u) !== filtro.lugar) return;
        if (filtro.forma && u.forma !== filtro.forma) return;
        if (q && (u.unidad + " " + u.inquilino).toLowerCase().indexOf(q) < 0) return;
        filas.push(u);
        tbody.append(ed ? filaEdicion(u, i) : filaVista(u));
      });
      if (!filas.length) {
        var vacioLugar = filtro.lugar && !todas.some(function (u) { return lugarDe(d, u) === filtro.lugar; });
        var r0 = el("tr"), c0 = el("td", "vacio", vacioLugar ? "Todavía no hay unidades en " + filtro.lugar + "." + (ed ? " Agregalas con “+ Unidad”." : " Tocá Editar y “+ Unidad” para cargarlas.") : "Ninguna unidad coincide con la búsqueda.");
        c0.colSpan = cols.length + 4 + (conValores ? COLS_VALOR.length : 0); r0.append(c0); tbody.append(r0);
      }
      tfoot.replaceChildren();
      var rf = el("tr");
      var l = el("td", null, (filtro.texto || filtro.forma ? "Total filtrado · " : "Total · ") + (filtro.lugar ? filtro.lugar + " · " : "") + filas.length + " unidad(es)"); l.colSpan = 2;
      rf.append(l);
      cols.forEach(function (c) { rf.append(el("td", "num", hay(filas, c[0]) ? (ed ? pesos : pesos0)(suma(filas, c[0])) : "—")); });
      rf.append(el("td", "num", pct(suma(filas, "coeficiente"))));
      if (conValores) {
        // Rendimiento del conjunto: alquileres de las unidades con precio de compra sobre la suma de esas compras.
        var vs = filas.map(function (u) { return { v: PropValores.de(u, lugarDe(d, u)) || {}, a: alquilerDe(u).monto }; });
        var tot = function (k) { var con = vs.filter(function (x) { return typeof x.v[k] === "number"; }); return con.length ? pesos0(con.reduce(function (a, x) { return a + x.v[k]; }, 0)) : "—"; };
        var conRend = vs.filter(function (x) { return PropValores.rendimiento(x.v, x.a) !== null; });
        var compraR = conRend.reduce(function (a, x) { return a + x.v.precioCompra; }, 0);
        var alqR = conRend.reduce(function (a, x) { return a + x.a; }, 0);
        rf.append(el("td", "num valor-ini", tot("valorReal")), el("td", "num", tot("precioCompra")),
          el("td", "num", compraR ? pct1(alqR * 12 / compraR) : "—"), el("td", "num", tot("ventaEstimada")));
      }
      if (ed) rf.append(el("td"));
      tfoot.append(rf);
    }
    buscar.addEventListener("input", function () { filtro.texto = buscar.value; pintar(); });
    sel.addEventListener("change", function () { filtro.forma = sel.value; pintar(); });
    pintar();
    if (ed) {
      var acc = el("div", "agregar");
      acc.append(botonAgregar("Unidad", function () {
        // Se agrega en el lugar de la pestaña abierta.
        d.unidades.push({ unidad: "Nueva", inquilino: "", clave: "NUEVA", forma: "Transfiere", estado: "transfiere", color: COLORES_ESTADO.transfiere, lugar: filtro.lugar || lugaresDe(d)[0] });
        filtro.texto = ""; filtro.forma = "";
      }));
      p.append(acc);
    }
    return p;
  }

  // ----- Rentabilidad -----
  // Portafolio (por lugar y total), rendimiento neto de cada unidad y escenarios de venta:
  // qué deja por año seguir alquilando contra vender al valor estimado (menos los costos de
  // venta) e invertir lo cobrado a la tasa alternativa. Usa los valores de la "i" de cada unidad.
  var COSTOS_VENTA_DEF = 5;
  function vistaRentabilidad(d) {
    var box = el("div", "columna");
    if (!window.PropValores || !PropValores.listo()) { box.append(el("p", "cargando", "Cargando valores de las unidades…")); return box; }
    if (PropValores.error()) box.append(el("div", "alerta error", PropValores.error()));
    var par = PropValores.parametros() || {};
    var costos = typeof par.costosVenta === "number" ? par.costosVenta : COSTOS_VENTA_DEF;
    var tasa = typeof par.tasaAlternativa === "number" ? par.tasaAlternativa : null;
    var aCargo = ((d.expensas || {}).aCargo || {}).valores || {};
    var impEdificio = (aCargo.rentas || 0) + (aCargo.municipalidad || 0);

    // Una fila por unidad con todo calculado (también las que solo tienen contrato).
    var filas = unidadesConContratos(d).map(function (u) {
      var ctx = ctxUnidad(u, d), v = PropValores.de(u, ctx.lugar) || {}, c = PropValores.calculo(v, ctx);
      var ventaNeta = v.ventaEstimada > 0 ? v.ventaEstimada * (1 - costos / 100) : null;
      var netoAnual = c.neto === null ? null : c.neto * 12;
      var vendiendo = ventaNeta !== null && tasa !== null ? ventaNeta * tasa / 100 : null;
      return { u: u, lugar: lugarDe(d, u), v: v, c: c, ctx: ctx, ventaNeta: ventaNeta, netoAnual: netoAnual, vendiendo: vendiendo,
        sobreVenta: netoAnual !== null && ventaNeta ? netoAnual / ventaNeta : null };
    });
    function sumar(lista, f) { return lista.reduce(function (a, x) { var n = f(x); return a + (typeof n === "number" ? n : 0); }, 0); }
    function variacion(lista, k) {
      var con = lista.filter(function (x) { return x.v.precioCompra > 0 && x.v[k] > 0; });
      var compra = sumar(con, function (x) { return x.v.precioCompra; });
      return compra ? sumar(con, function (x) { return x.v[k]; }) / compra - 1 : null;
    }
    function resumen(lista) {
      var conCompra = lista.filter(function (x) { return x.v.precioCompra > 0 && x.c.alquiler; });
      var compra = sumar(conCompra, function (x) { return x.v.precioCompra; });
      return {
        n: lista.length, conValores: lista.filter(function (x) { return x.v.precioCompra > 0 || x.v.valorReal > 0 || x.v.ventaEstimada > 0; }).length,
        invertido: sumar(lista, function (x) { return x.v.precioCompra; }), valorReal: sumar(lista, function (x) { return x.v.valorReal; }),
        venta: sumar(lista, function (x) { return x.v.ventaEstimada; }),
        alquilerAnual: sumar(lista, function (x) { return x.c.alquiler && x.c.alquiler * 12; }),
        gastosAnual: sumar(lista, function (x) { return x.c.alquiler ? x.c.gastos * 12 : 0; }),
        netoAnual: sumar(lista, function (x) { return x.netoAnual; }),
        compraConRenta: compra,
        // Valor real y venta contra la compra, solo de las unidades que tienen los dos datos.
        dReal: variacion(lista, "valorReal"), dVenta: variacion(lista, "ventaEstimada"),
        brutoConCompra: sumar(conCompra, function (x) { return x.c.alquiler * 12; }),
        netoConCompra: sumar(conCompra, function (x) { return x.netoAnual; })
      };
    }
    var tot = resumen(filas);
    var rendBruto = tot.compraConRenta ? tot.brutoConCompra / tot.compraConRenta : null;
    var rendNeto = tot.compraConRenta ? (tot.netoConCompra - impEdificio * 12) / tot.compraConRenta : null;
    var valoriz = tot.dVenta;
    function signo(n) { return (n >= 0 ? "+" : "") + pct1(n); }

    // Parámetros de los escenarios (compartidos: quedan en la planilla de valores).
    var pp = panel("Escenarios de venta", "Compara lo que deja por año alquilar con vender al valor estimado, descontar los costos de venta e invertir lo cobrado a la tasa alternativa. No incluye la valorización futura de la propiedad.");
    var campos = el("div", "campos rent-param");
    var iCostos = el("input"); iCostos.type = "text"; iCostos.inputMode = "decimal"; iCostos.value = numTxt(costos, 1); iCostos.setAttribute("aria-label", "Costos de venta en porcentaje");
    var iTasa = el("input"); iTasa.type = "text"; iTasa.inputMode = "decimal"; iTasa.value = tasa === null ? "" : numTxt(tasa, 1); iTasa.placeholder = "Ej. 30"; iTasa.setAttribute("aria-label", "Tasa alternativa anual en porcentaje");
    var l1 = el("label", null, "Costos de venta (%)"); l1.append(iCostos, el("small", null, "Comisión, escribanía e impuestos"));
    var l2 = el("label", null, "Tasa alternativa anual (%)"); l2.append(iTasa, el("small", null, "Lo que rendiría la plata en otra inversión (FCI, bolsa, plazo fijo)"));
    var bG = el("button", "boton chico", "Guardar"); bG.type = "button";
    var estadoPar = el("span", "estado-guardado", par.actualizadoPor ? "Último cambio de " + par.actualizadoPor + (par.fecha ? " el " + par.fecha : "") : "");
    bG.addEventListener("click", function () {
      var c = numeroDe(iCostos.value), t = numeroDe(iTasa.value);
      if (iCostos.value.trim() && (c === null || c < 0 || c > 50)) { alert("Costos de venta: un porcentaje de 0 a 50."); return; }
      if (iTasa.value.trim() && (t === null || t < 0 || t > 1000)) { alert("Tasa alternativa: un porcentaje anual de 0 a 1000."); return; }
      bG.disabled = true; bG.textContent = "Guardando…";
      PropValores.guardarParametros(actual.edificio, { costosVenta: c, tasaAlternativa: t }).then(repintarPestana).catch(function (err) {
        if (err && err.sesion === false) { irAlIngreso(); return; }
        alert("No se pudieron guardar los parámetros: " + err.message);
        bG.disabled = false; bG.textContent = "Guardar";
      });
    });
    var lg = el("div", "rent-guardar"); lg.append(bG, estadoPar);
    campos.append(l1, l2, lg);
    pp.append(campos);

    // KPIs del portafolio
    var k = el("div", "kpis");
    [
      ["Invertido", corto(tot.invertido || null), tot.conValores + " de " + tot.n + " unidades con valores"],
      ["Valor real", corto(tot.valorReal || null), tot.dReal === null ? "Cargalo con la “i”" : signo(tot.dReal) + " sobre la compra", tot.dReal !== null && tot.dReal < 0 ? "baja" : "ok"],
      ["Venta estimada", corto(tot.venta || null), valoriz === null ? "Cargala con la “i”" : signo(valoriz) + " sobre la compra", valoriz !== null && valoriz < 0 ? "baja" : "ok"],
      ["Alquiler anual", corto(tot.alquilerAnual || null), "Neto " + corto(tot.netoAnual - impEdificio * 12) + " después de gastos"],
      ["Rendimiento bruto", rendBruto === null ? "—" : pct1(rendBruto), "Alquiler sobre la compra"],
      ["Rendimiento neto", rendNeto === null ? "—" : pct1(rendNeto), "Después de adm., arreglos, gastos" + (impEdificio ? " e impuestos a cargo" : ""), rendNeto !== null && rendNeto < 0 ? "baja" : "ok"]
    ].forEach(function (x) {
      var kk = el("div", "kpi" + (x[3] ? " " + x[3] : ""));
      kk.append(el("small", null, x[0]), el("b", null, x[1]), el("span", null, x[2]));
      k.append(kk);
    });
    box.append(k);
    if (!tot.conValores) box.append(el("div", "alerta", "Todavía no hay valores cargados. Tocá la “i” de cada unidad (en Unidades o en la tabla de abajo) y cargá precio de compra, valor real, venta estimada y gastos."));

    // Por lugar
    var pl = panel("Por lugar", "Rendimientos sobre el precio de compra de las unidades que lo tienen cargado." + (impEdificio ? " Los impuestos a cargo del dueño (Expensas, " + pesos0(impEdificio) + " por mes) se descuentan solo en el total." : ""));
    var tl = el("table"), th = el("thead"), hr = el("tr");
    ["Lugar", "Unidades", "Invertido", "Valor real", "Venta estimada", "Alquiler anual", "Gastos anuales", "Neto anual", "Rend. bruto", "Rend. neto"].forEach(function (h, i) { hr.append(el("th", i ? "num" : "", h)); });
    th.append(hr);
    var tb = el("tbody");
    function filaResumen(nombre, r, extraGastos, cls) {
      var tr = el("tr", cls || "");
      var neto = r.netoAnual - (extraGastos || 0);
      tr.append(el("td", null, nombre), el("td", "num", r.conValores + " / " + r.n), el("td", "num", pesos0(r.invertido || null)), el("td", "num", pesos0(r.valorReal || null)),
        el("td", "num", pesos0(r.venta || null)), el("td", "num", pesos0(r.alquilerAnual || null)), el("td", "num", pesos0((r.gastosAnual + (extraGastos || 0)) || null)),
        el("td", "num" + (neto < 0 ? " rojo" : ""), pesos0(r.alquilerAnual ? neto : null)),
        el("td", "num", r.compraConRenta ? pct1(r.brutoConCompra / r.compraConRenta) : "—"),
        el("td", "num", r.compraConRenta ? pct1((r.netoConCompra - (extraGastos || 0)) / r.compraConRenta) : "—"));
      return tr;
    }
    lugaresDe(d).forEach(function (l) {
      var del = filas.filter(function (x) { return x.lugar === l; });
      if (del.length) tb.append(filaResumen(l, resumen(del)));
    });
    var tf = el("tfoot");
    tf.append(filaResumen("Total", tot, impEdificio * 12));
    tl.append(th, tb, tf);
    var wl = el("div", "tabla-scroll"); wl.append(tl); pl.append(wl);

    // Unidades: rendimiento neto y escenario de venta, de la que más rinde a la que menos.
    var pu = panel("Unidades: rendimiento y escenario de venta", tasa === null ? "Cargá la tasa alternativa arriba para comparar alquilar con vender." :
      "Vendiendo: venta estimada − " + numTxt(costos, 1) + " % de costos, invertida al " + numTxt(tasa, 1) + " % anual.");
    var orden = filas.slice().sort(function (a, b) {
      var ra = a.c.rendNeto, rb = b.c.rendNeto;
      if (ra === null && rb === null) return 0;
      if (ra === null) return 1;
      if (rb === null) return -1;
      return rb - ra;
    });
    var tu = el("table"), thu = el("thead"), hu = el("tr");
    ["Unidad", "Lugar", "Compra", "Alquiler / mes", "Gastos / mes", "Neto / mes", "Rend. bruto", "Rend. neto", "Rend. s/ venta", "Alquilando / año", "Vendiendo / año", "Conviene"].forEach(function (h, i) {
      hu.append(el("th", i > 1 && i < 11 ? "num" : "", h));
    });
    thu.append(hu);
    var tbu = el("tbody");
    orden.forEach(function (x) {
      var tr = el("tr");
      var cu = el("td", "unidad");
      cu.append(document.createTextNode(x.u.unidad), PropValores.botonInfo(x.u, x.ctx), el("span", "sub", x.u.inquilino || "—"));
      var conv = el("td"), dif = x.netoAnual !== null && x.vendiendo !== null ? x.vendiendo - x.netoAnual : null;
      if (dif === null) conv.append(el("span", "sub", x.v.ventaEstimada ? (tasa === null ? "Falta la tasa" : "Falta el alquiler") : "Falta la venta estimada"));
      else {
        conv.append(el("span", "pill " + (dif > 0 ? "vender" : "alquilar"), dif > 0 ? "Vender" : "Alquilar"));
        conv.append(el("span", "sub", "+" + pesos0(Math.abs(dif)) + " por año"));
      }
      tr.append(cu, el("td", null, x.lugar), celdaValor(x.v, "precioCompra", "num"),
        el("td", "num", pesos0(x.c.alquiler)), el("td", "num", x.c.alquiler ? pesos0(x.c.gastos) : "—"),
        el("td", "num" + (x.c.neto !== null && x.c.neto < 0 ? " rojo" : ""), pesos0(x.c.neto)),
        el("td", "num", x.c.bruto === null ? "—" : pct1(x.c.bruto)), el("td", "num rend-celda", x.c.rendNeto === null ? "—" : pct1(x.c.rendNeto)),
        el("td", "num", x.sobreVenta === null ? "—" : pct1(x.sobreVenta)),
        el("td", "num", pesos0(x.netoAnual)), el("td", "num", pesos0(x.vendiendo)), conv);
      tbu.append(tr);
    });
    // Todo el portafolio: seguir alquilando o vender todo lo que tiene venta estimada.
    var conEsc = filas.filter(function (x) { return x.netoAnual !== null && x.vendiendo !== null; });
    var tfu = el("tfoot"), rf = el("tr");
    var alqT = sumar(conEsc, function (x) { return x.netoAnual; }), vendT = sumar(conEsc, function (x) { return x.vendiendo; });
    var lt = el("td", null, "Total · " + conEsc.length + " unidad(es) con escenario"); lt.colSpan = 9;
    var ct = el("td");
    if (conEsc.length) ct.append(el("span", "pill " + (vendT > alqT ? "vender" : "alquilar"), vendT > alqT ? "Vender" : "Alquilar"));
    rf.append(lt, el("td", "num", conEsc.length ? pesos0(alqT) : "—"), el("td", "num", conEsc.length ? pesos0(vendT) : "—"), ct);
    tfu.append(rf);
    tu.append(thu, tbu, tfu);
    var wu = el("div", "tabla-scroll fija"); wu.append(tu); pu.append(wu);

    box.append(pl, pp, pu);
    return box;
  }

  // El coeficiente de una unidad es el mismo en Unidades y en Expensas.
  function sincronizarCoef(d, u) {
    var imp = (d.expensas || {}).impuestos;
    if (!imp) return;
    var x = imp.unidades.find(function (e) { return e.clave === u.clave; });
    if (x) x.coeficiente = u.coeficiente;
    else imp.unidades.push({ unidad: u.unidad, clave: u.clave, coeficiente: u.coeficiente, rentas: null, municipalidad: null, total: null });
    recalcularExpensas(d);
  }

  // ----- Expensas -----
  function panelExpensas(d) {
    var ed = editando();
    var ex = d.expensas || {};
    var aC = ex.aCargo, imp = ex.impuestos;
    var box = el("div", "columna");
    function campo(cont, etiqueta, valor, alCambiar, ayuda) {
      var lab = el("label", null, etiqueta);
      if (ed) lab.append(campoNum(valor, alCambiar, { titulo: etiqueta, placeholder: "Sin cargar" }));
      else lab.append(el("span", "valor", typeof valor === "number" ? pesos(valor) : "Sin cargar"));
      if (ayuda) lab.append(el("small", null, ayuda));
      cont.append(lab);
    }
    if (aC) {
      var p1 = panel(aC.titulo.charAt(0) + aC.titulo.slice(1).toLowerCase().replace("sammartino", "Sammartino"), "Se carga cada mes.");
      var c1 = el("div", "campos");
      aC.valores = aC.valores || {};
      campo(c1, "Superficie", aC.valores.superf, function (v) { aC.valores.superf = v; });
      campo(c1, "Rentas", aC.valores.rentas, function (v) { aC.valores.rentas = v; });
      campo(c1, "Municipalidad", aC.valores.municipalidad, function (v) { aC.valores.municipalidad = v; });
      var totA = (aC.valores.rentas || 0) + (aC.valores.municipalidad || 0);
      c1.append((function () { var l = el("label", null, "Total"); l.append(el("span", "valor", aC.valores.rentas === null && aC.valores.municipalidad === null ? "—" : pesos(totA))); return l; })());
      p1.append(c1);
      box.append(p1);
    }
    if (imp) {
      var p2 = panel(imp.titulo.charAt(0) + imp.titulo.slice(1).toLowerCase(), "Rentas y municipalidad del mes se reparten por el coeficiente de cada unidad.");
      var c2 = el("div", "campos");
      campo(c2, "Rentas del mes (total)", imp.rentasTotal, function (v) { imp.rentasTotal = v; recalcularExpensas(d); });
      campo(c2, "Municipalidad del mes (total)", imp.muniTotal, function (v) { imp.muniTotal = v; recalcularExpensas(d); });
      p2.append(c2);
      var wrap = el("div", "tabla-scroll"), t = el("table", ed ? "editable" : ""), hr = el("tr");
      ["Unidad", "Coeficiente", "Rentas", "Municipalidad", "Total"].forEach(function (h, i) { hr.append(el("th", i ? "num" : "", h)); });
      var th = el("thead"); th.append(hr);
      var tb = el("tbody"), tf = el("tfoot");
      var R = imp.rentasTotal, M = imp.muniTotal;
      imp.unidades.forEach(function (u) {
        var rr = typeof R === "number" ? R * (u.coeficiente || 0) : null, mm = typeof M === "number" ? M * (u.coeficiente || 0) : null;
        var r = el("tr"), tdc = el("td", "num");
        if (ed) tdc.append(campoNum(u.coeficiente, function (v) {
          u.coeficiente = v;
          var x = d.unidades.find(function (z) { return z.clave === u.clave; });
          if (x) x.coeficiente = v;
          recalcularExpensas(d);
        }, { pct: true, titulo: "Coeficiente de " + u.unidad }));
        else tdc.textContent = pct(u.coeficiente);
        r.append(el("td", null, u.unidad), tdc, el("td", "num", pesos(rr)), el("td", "num", pesos(mm)), el("td", "num", rr === null && mm === null ? "—" : pesos((rr || 0) + (mm || 0))));
        tb.append(r);
      });
      var sC = suma(imp.unidades, "coeficiente");
      var f = el("tr");
      f.append(el("td", null, "Total"), el("td", "num", pct(sC)), el("td", "num", typeof R === "number" ? pesos(R * sC) : "—"), el("td", "num", typeof M === "number" ? pesos(M * sC) : "—"),
        el("td", "num", typeof R === "number" || typeof M === "number" ? pesos(((R || 0) + (M || 0)) * sC) : "—"));
      tf.append(f);
      t.append(th, tb, tf); wrap.append(t); p2.append(wrap);
      box.append(p2);
    }
    return box;
  }

  // ----- Cocheras y novedades -----
  function panelCocheras(d) {
    var ed = editando();
    d.cocheras = d.cocheras || [];
    var p = panel("Cocheras");
    var wrap = el("div", "tabla-scroll"), t = el("table", ed ? "editable" : ""), th = el("thead"), hr = el("tr");
    ["Inquilino", "Patente / modelo", "Monto"].forEach(function (h, i) { hr.append(el("th", i === 2 ? "num" : "", h)); });
    if (ed) hr.append(el("th"));
    th.append(hr);
    var tb = el("tbody");
    d.cocheras.forEach(function (c, i) {
      var r = el("tr");
      if (ed) {
        var a = el("td"); a.append(campoTxt(c.inquilino, function (v) { c.inquilino = v; }, { titulo: "Inquilino" }));
        var b = el("td"); b.append(campoTxt(c.vehiculo, function (v) { c.vehiculo = v; }, { titulo: "Patente o modelo", placeholder: "—" }));
        var m = el("td"); m.append(campoNum(c.monto, function (v) { c.monto = v; }, { titulo: "Monto" }));
        var q = el("td"); q.append(botonQuitar(function () { d.cocheras.splice(i, 1); }, "Quitar cochera"));
        r.append(a, b, m, q);
      } else r.append(el("td", null, c.inquilino), el("td", null, c.vehiculo || "—"), el("td", "num", pesos(c.monto)));
      tb.append(r);
    });
    if (!d.cocheras.length) { var r0 = el("tr"), c0 = el("td", "vacio", "No hay cocheras cargadas."); c0.colSpan = ed ? 4 : 3; r0.append(c0); tb.append(r0); }
    var tf = el("tfoot"), rf = el("tr"), tl = el("td", null, "Total · " + d.cocheras.length + " cochera(s)");
    tl.colSpan = 2;
    rf.append(tl, el("td", "num", pesos(typeof d.cocherasTotal === "number" ? d.cocherasTotal : suma(d.cocheras, "monto"))));
    if (ed) rf.append(el("td"));
    tf.append(rf);
    t.append(th, tb, tf); wrap.append(t); p.append(wrap);
    if (ed) {
      var acc = el("div", "agregar");
      acc.append(botonAgregar("Cochera", function () { d.cocheras.push({ inquilino: "", vehiculo: "", monto: 60000, clave: "" }); }));
      p.append(acc);
    }
    return p;
  }

  function panelNovedades(d) {
    var p = panel("Novedades");
    d.novedades = d.novedades || [];
    if (editando()) {
      var ta = el("textarea", "celda");
      ta.rows = 8; ta.placeholder = "Una novedad por renglón"; ta.value = d.novedades.join("\n");
      ta.setAttribute("aria-label", "Novedades");
      ta.addEventListener("change", function () { d.novedades = ta.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean); });
      p.append(ta);
    } else if (d.novedades.length) {
      var ul = el("ul", "refs");
      d.novedades.forEach(function (n) { ul.append(el("li", null, n)); });
      p.append(ul);
    } else p.append(el("p", "sub-panel", "Sin novedades este mes."));
    return p;
  }

  // ----- Planilla de transferencias -----
  function panelPlanillaTransferencias(d) {
    var ed = editando();
    var pt = d.planillaTransferencias;
    if (!pt) return panel("Transferencias", "La planilla de este mes no trae la hoja de transferencias.");
    var vacia = pt.filas.every(function (f) { return f.valores.every(function (v) { return v === null || v === ""; }); });
    var p = panel("Planilla de transferencias", vacia && !ed ? "Todavía sin completar. Tocá Editar para cargarla." : "");
    var wrap = el("div", "tabla-scroll"), t = el("table", ed ? "editable" : ""), th = el("thead"), hr = el("tr");
    hr.append(el("th", null, "Unidad"));
    pt.columnas.forEach(function (c) { hr.append(el("th", /MES/i.test(c) ? "" : "num", c)); });
    if (ed) hr.append(el("th"));
    th.append(hr);
    var tb = el("tbody");
    pt.filas.forEach(function (f, i) {
      var r = el("tr");
      if (ed) { var tu = el("td"); tu.append(campoTxt(f.unidad, function (v) { f.unidad = v; f.clave = LectorPropiedades.claveUnidad(v); }, { titulo: "Unidad", cls: "corto" })); r.append(tu); }
      else r.append(el("td", null, f.unidad));
      pt.columnas.forEach(function (c, j) {
        var esMes = /MES/i.test(c), v = f.valores[j], td = el("td", esMes ? "" : "num");
        if (ed) td.append(esMes ? campoTxt(v === null ? "" : String(v), function (x) { f.valores[j] = x || null; }, { titulo: c + " de " + f.unidad, placeholder: "mes" })
          : campoNum(typeof v === "number" ? v : null, function (x) { f.valores[j] = x; }, { titulo: c + " de " + f.unidad }));
        else td.textContent = v === null || v === "" ? "—" : typeof v === "number" ? pesos(v) : String(v);
        r.append(td);
      });
      if (ed) { var tq = el("td"); tq.append(botonQuitar(function () { pt.filas.splice(i, 1); }, "Quitar " + f.unidad)); r.append(tq); }
      tb.append(r);
    });
    var tf = el("tfoot"), rf = el("tr"), tl = el("td", null, "Total");
    tl.colSpan = pt.columnas.length;
    rf.append(tl, el("td", "num", pesos(pt.total)));
    if (ed) rf.append(el("td"));
    tf.append(rf);
    t.append(th, tb, tf); wrap.append(t); p.append(wrap);
    if (ed) {
      var acc = el("div", "agregar");
      acc.append(botonAgregar("Unidad", function () { pt.filas.push({ unidad: "", clave: "", valores: pt.columnas.map(function () { return null; }) }); }));
      p.append(acc);
    }
    return p;
  }

  // ----- Importar el Excel -----
  var promesaXlsx = null;
  function cargarXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!promesaXlsx) promesaXlsx = new Promise(function (ok, mal) {
      var s = document.createElement("script");
      s.src = XLSX_URL; s.async = true;
      s.onload = function () { window.XLSX ? ok(window.XLSX) : mal(new Error("No se pudo cargar el lector de planillas.")); };
      s.onerror = function () { promesaXlsx = null; mal(new Error("No se pudo cargar el lector de planillas. Revisá la conexión y probá de nuevo.")); };
      document.head.appendChild(s);
    });
    return promesaXlsx;
  }
  $("importar").addEventListener("click", function () { $("archivo").click(); });
  $("archivo").addEventListener("change", function () {
    var f = $("archivo").files[0];
    $("archivo").value = "";
    if (!f) return;
    var b = $("importar");
    b.disabled = true; b.textContent = "Leyendo…";
    Promise.all([cargarXlsx(), f.arrayBuffer()]).then(function (r) {
      var X = r[0];
      var nuevos = LectorPropiedades.leer(X, X.read(r[1], { type: "array", cellStyles: true, cellDates: true }), f.name);
      nuevos.lugares = LUGARES.slice();
      nuevos.unidades.forEach(function (u) { u.lugar = LUGARES[0]; });
      var previo = lista.find(function (x) { return x.edificio.toLowerCase() === nuevos.edificio.toLowerCase() && x.periodo.toLowerCase() === nuevos.periodo.toLowerCase(); });
      if (previo && !confirm("Ya hay una liquidación de " + nuevos.edificio + " · " + nuevos.periodo + ". ¿Reemplazarla por la de este archivo? Se pierden los cambios hechos acá en ese período.")) return null;
      // Las expensas cargadas acá no se pierden si la planilla nueva las trae vacías.
      if (previo && previo.datos.expensas && nuevos.expensas) {
        var a = previo.datos.expensas, n = nuevos.expensas;
        if (a.impuestos && n.impuestos) {
          if (n.impuestos.rentasTotal === null) n.impuestos.rentasTotal = a.impuestos.rentasTotal;
          if (n.impuestos.muniTotal === null) n.impuestos.muniTotal = a.impuestos.muniTotal;
        }
        if (a.aCargo && n.aCargo) ["superf", "rentas", "municipalidad"].forEach(function (k) { if (n.aCargo.valores[k] === null) n.aCargo.valores[k] = a.aCargo.valores[k]; });
        recalcularExpensas(nuevos);
      }
      b.textContent = "Guardando…";
      return BGPSesion.pedir("guardarPropiedades", { datos: nuevos, archivo: f.name }).then(function () { pestana = "resumen"; return cargar(nuevos.edificio + "|" + nuevos.periodo); });
    }).catch(function (err) {
      if (err && err.sesion === false) { irAlIngreso(); return; }
      alert("No se pudo importar la planilla: " + (err && err.message || err));
    }).then(function () { b.disabled = false; b.textContent = "Importar planilla"; });
  });

  // Desde el mapa: propiedades.html?edificio=…&periodo=…&lugar=… abre esa liquidación (o la última) en ese lugar.
  (function () {
    var q = new URLSearchParams(location.search);
    var ed = q.get("edificio");
    if (q.get("lugar")) { filtro.lugar = q.get("lugar"); pestana = "unidades"; }
    if (!ed) { cargar(undefined, true); return; }
    cargar(function (todas) {
      var suyas = todas.filter(function (x) { return x.edificio === ed; })
        .sort(function (a, b) { return String(b.orden).localeCompare(String(a.orden)); });
      var elegida = suyas.find(function (x) { return x.periodo === q.get("periodo"); }) || suyas[0];
      return elegida ? clave(elegida) : undefined;
    }, true);
  })();
})();
