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
  var PESTANAS = [["resumen", "Resumen"], ["unidades", "Unidades"], ["expensas", "Expensas"], ["cocheras", "Cocheras y novedades"], ["transferencias", "Transferencias"]];
  var lista = [];
  var actual = null;      // registro guardado {edificio, periodo, datos, ...}
  var borrador = null;    // copia de actual.datos mientras se edita
  var pestana = "resumen";
  var filtro = { texto: "", forma: "" };
  try { pestana = sessionStorage.getItem("prop-pestana") || pestana; } catch (e) {}

  // ----- Sesión -----
  function irAlIngreso() { location.replace("index.html?v=7#elegir"); }
  var guardado = BGPSesion.usuario();
  if (!guardado) { irAlIngreso(); return; }
  $("quien").textContent = guardado.nombre || guardado.usuario || "";
  document.body.classList.remove("verificando");
  BGPSesion.consultar().then(function (u) {
    if (!u) { irAlIngreso(); return; }
    $("quien").textContent = u.nombre || u.usuario;
  }, function () {});
  $("salir").addEventListener("click", function () { BGPSesion.salir().then(irAlIngreso); });
  window.addEventListener("beforeunload", function (e) { if (borrador) { e.preventDefault(); e.returnValue = ""; } });

  // ----- Formatos y ayudas -----
  var fmtPesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function pesos(n) { return typeof n !== "number" || isNaN(n) ? "—" : fmtPesos.format(n); }
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

  // Importe en letras para el recibo ("doce millones setecientos ocho mil…").
  function enLetras(n) {
    n = Math.floor(Math.abs(n));
    var U = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
    var D = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
    var C = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
    function hasta999(x) {
      if (x === 100) return "cien";
      var c = Math.floor(x / 100), r = x % 100, t = [];
      if (c) t.push(C[c]);
      if (r < 30) { if (r) t.push(U[r]); }
      else { var d = Math.floor(r / 10), u = r % 10; t.push(D[d] + (u ? " y " + U[u] : "")); }
      return t.join(" ");
    }
    function grupo(x, sing, plur) { return x === 0 ? "" : x === 1 ? sing : hasta999(x).replace(/uno$/, "un") + " " + plur; }
    if (n === 0) return "cero";
    var mill = Math.floor(n / 1e6), miles = Math.floor((n % 1e6) / 1000), resto = n % 1000;
    return [grupo(mill, "un millón", "millones"), miles === 1 ? "mil" : miles ? hasta999(miles).replace(/uno$/, "un") + " mil" : "", resto ? hasta999(resto) : ""].filter(Boolean).join(" ");
  }

  // ----- Datos -----
  function cargar(seleccion) {
    return BGPSesion.pedir("obtenerPropiedades").then(function (r) {
      lista = (r.liquidaciones || []).slice().sort(function (a, b) {
        return String(b.orden).localeCompare(String(a.orden)) || String(a.edificio).localeCompare(String(b.edificio));
      });
      armarSelector(seleccion);
      mostrar();
    }).catch(function (err) { errorEn($("contenido"), err); });
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
    var caja = $("contenido");
    caja.replaceChildren();
    $("acciones").replaceChildren();
    if (!actual) {
      $("tituloEdificio").textContent = "Liquidaciones de alquileres";
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
    $("tituloEdificio").textContent = d.edificio;
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

    // Pestañas
    var tabs = el("div", "pestanas");
    tabs.setAttribute("role", "tablist");
    PESTANAS.forEach(function (p) {
      var b = el("button", "pestana" + (pestana === p[0] ? " activa" : ""), p[1]);
      b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", pestana === p[0] ? "true" : "false");
      b.addEventListener("click", function () {
        pestana = p[0];
        try { sessionStorage.setItem("prop-pestana", pestana); } catch (err) {}
        mostrar();
      });
      tabs.append(b);
    });
    caja.append(tabs);
    var cuerpo = el("div", null);
    cuerpo.id = "cuerpoPestana";
    caja.append(cuerpo);
    repintarPestana();
  }

  // Después de un cambio se redibuja cuando el foco ya pasó al campo siguiente (Tab),
  // y se devuelve el foco a ese mismo campo en la tabla nueva.
  function repintarLuego() { setTimeout(repintarPestana, 0); }
  function repintarPestana() {
    var cuerpo = $("cuerpoPestana");
    if (!cuerpo) return;
    var d = datos();
    if (editando()) recalcularTotales(d);
    var previos = Array.prototype.slice.call(cuerpo.querySelectorAll("input, select, textarea, button"));
    var foco = previos.indexOf(document.activeElement);
    cuerpo.replaceChildren();
    if (pestana === "unidades") cuerpo.append(panelUnidades(d));
    else if (pestana === "expensas") cuerpo.append(panelExpensas(d));
    else if (pestana === "cocheras") { var g = el("div", "grilla mitad"); g.append(panelCocheras(d), panelNovedades(d)); cuerpo.append(g); }
    else if (pestana === "transferencias") cuerpo.append(panelPlanillaTransferencias(d));
    else cuerpo.append(vistaResumen(d));
    if (foco >= 0) { var f = cuerpo.querySelectorAll("input, select, textarea, button")[foco]; if (f) f.focus(); }
    if (!editando()) cuerpo.append(el("p", "meta", "Cargado de " + (actual.archivo || "la planilla") + (actual.cargadoPor ? " · último cambio de " + actual.cargadoPor : "") + (actual.fechaCarga ? " el " + actual.fechaCarga : "")));
  }

  function panel(titulo, sub) {
    var p = el("section", "panel");
    p.append(el("h2", null, titulo));
    if (sub) p.append(el("p", "sub-panel", sub));
    return p;
  }

  // ----- Resumen -----
  function vistaResumen(d) {
    var box = el("div");
    var obs = observaciones(d);
    if (obs.length) {
      var al = el("div", "alertas");
      obs.forEach(function (o) { al.append(el("div", "alerta" + (o.error ? " error" : ""), o.texto)); });
      box.append(al);
    }
    box.append(kpis(d));
    var g = el("div", "grilla mitad");
    var der = el("div", "columna");
    der.append(panelReferencias(d));
    var notas = panelNotas(d);
    if (notas) der.append(notas);
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
    var rec = el("div", "recibo");
    if (editando()) {
      var ta = el("textarea", "celda");
      ta.rows = 2; ta.value = d.recibo || ""; ta.setAttribute("aria-label", "Texto del recibo");
      ta.addEventListener("change", function () { d.recibo = ta.value.trim(); });
      rec.append(ta);
      var cob = (d.liquidacion || []).filter(function (x) { return x.tipo === "total"; }).pop();
      if (cob && typeof cob.monto === "number") {
        var letras = el("button", "boton secundario chico", "Poner el total en letras");
        letras.type = "button";
        letras.addEventListener("click", function () {
          var txt = "(" + enLetras(cob.monto) + ")";
          d.recibo = /\(.*\)/.test(d.recibo || "") ? d.recibo.replace(/\(.*\)/, txt) : "Recibí la suma TOTAL de " + txt;
          repintarPestana();
        });
        rec.append(letras);
      }
      var fi = campoTxt(d.firma, function (v) { d.firma = v; }, { titulo: "Firma" });
      fi.classList.add("firma-campo");
      rec.append(fi);
    } else if (d.recibo || d.firma) {
      if (d.recibo) rec.append(el("div", null, d.recibo));
      if (d.firma) rec.append(el("div", "firma", d.firma));
    }
    if (rec.childNodes.length) p.append(rec);
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

  function notasDe(d) {
    var ex = d.expensas || {}, out = [];
    [ex.aCargo, ex.impuestos].forEach(function (b) { if (b && b.nota && b.nota.texto) out.push({ bloque: b.titulo, texto: b.nota.texto }); });
    return out;
  }
  function panelNotas(d) {
    var ns = notasDe(d);
    if (!ns.length) return null;
    var p = panel("Notas");
    ns.forEach(function (n) {
      var x = el("p", "nota");
      x.append(el("b", null, n.bloque + ": "), document.createTextNode(n.texto));
      p.append(x);
    });
    return p;
  }

  // ----- Unidades -----
  function pillEstado(u) {
    var f = el("div");
    f.append(el("span", "pill " + (u.estado || ""), u.estado === "no-abono" ? "No abonó" : u.estado === "desocupado" ? "Desocupado" : u.estado === "amoblado" ? "Amoblado" : (u.forma || "—")));
    if (u.amoblado && u.estado !== "amoblado") { f.append(document.createTextNode(" ")); f.append(el("span", "pill amoblado", "Amoblado")); }
    if (u.mesTexto) f.append(el("span", "sub", u.mesTexto));
    return f;
  }
  var COLS = [
    ["transferencia", "Transferencia"], ["efectivo", "Efectivo"], ["punitorios", "Punitorios"], ["muniRentas", "Muni y rentas"],
    ["cochera", "Cochera"], ["adm", "Adm. (6 %)"], ["arreglos", "Arreglos"], ["total", "Total"]
  ];
  var COLORES_ESTADO = { transfiere: "A8D08D", efectivo: "FFFFFF", "no-abono": "FF0000", desocupado: "A5A5A5", amoblado: "8EAADB" };
  var MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  function panelUnidades(d) {
    var ed = editando();
    var p = panel("Unidades", ed ? "Al cambiar efectivo o cochera de una unidad que paga en efectivo, la administración (6 %) y el total se calculan solos." : "Cada unidad con su inquilino, cómo pagó y la liquidación de los que pagan en efectivo.");
    var herr = el("div", "herramientas");
    var buscar = el("input"); buscar.type = "search"; buscar.placeholder = "Buscar por unidad o inquilino"; buscar.setAttribute("aria-label", "Buscar"); buscar.value = filtro.texto;
    var sel = el("select"); sel.setAttribute("aria-label", "Forma de pago");
    [["", "Todas las unidades"], ["Transfiere", "Transfieren"], ["Efectivo", "Pagan en efectivo"]].forEach(function (o) { var x = el("option", null, o[1]); x.value = o[0]; sel.append(x); });
    sel.value = filtro.forma;
    herr.append(buscar, sel);
    p.append(herr);
    var cols = ed ? COLS : COLS.filter(function (c) { return hay(d.unidades, c[0]); });
    var wrap = el("div", "tabla-scroll"), t = el("table", ed ? "editable" : "");
    var thead = el("thead"), tr = el("tr");
    tr.append(el("th", null, "Unidad"), el("th", null, "Pago"));
    cols.forEach(function (c) { tr.append(el("th", "num", c[1])); });
    tr.append(el("th", "num", "Coef. expensas"));
    if (ed) tr.append(el("th", null, ""));
    thead.append(tr);
    var tbody = el("tbody"), tfoot = el("tfoot");
    t.append(thead, tbody, tfoot); wrap.append(t); p.append(wrap);

    function filaVista(u) {
      var r = el("tr");
      var cu = el("td", "unidad"), m = el("span", "marca-color");
      m.style.background = "#" + (u.color || "FFFFFF");
      cu.append(m, document.createTextNode(u.unidad), el("span", "sub", u.inquilino || "—"));
      var cp = el("td"); cp.append(pillEstado(u));
      r.append(cu, cp);
      cols.forEach(function (c) { var v = u[c[0]]; r.append(el("td", "num" + (v === 0 ? " cero" : ""), typeof v === "number" ? pesos(v) : "—")); });
      r.append(el("td", "num", pct(u.coeficiente)));
      return r;
    }
    function filaEdicion(u, idx) {
      var r = el("tr");
      var cu = el("td", "unidad");
      var iu = campoTxt(u.unidad, function (v) { u.unidad = v; u.clave = LectorPropiedades.claveUnidad(v); }, { titulo: "Unidad", cls: "corto" });
      var ii = campoTxt(u.inquilino, function (v) { u.inquilino = v; }, { titulo: "Inquilino de " + u.unidad, placeholder: "Inquilino" });
      cu.append(iu, ii);
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
      d.unidades.forEach(function (u, i) {
        if (filtro.forma && u.forma !== filtro.forma) return;
        if (q && (u.unidad + " " + u.inquilino).toLowerCase().indexOf(q) < 0) return;
        filas.push(u);
        tbody.append(ed ? filaEdicion(u, i) : filaVista(u));
      });
      if (!filas.length) { var r0 = el("tr"), c0 = el("td", "vacio", "Ninguna unidad coincide con la búsqueda."); c0.colSpan = cols.length + 4; r0.append(c0); tbody.append(r0); }
      tfoot.replaceChildren();
      var rf = el("tr");
      var l = el("td", null, (filtro.texto || filtro.forma ? "Total filtrado · " : "Total · ") + filas.length + " unidad(es)"); l.colSpan = 2;
      rf.append(l);
      cols.forEach(function (c) { rf.append(el("td", "num", hay(filas, c[0]) ? pesos(suma(filas, c[0])) : "—")); });
      rf.append(el("td", "num", pct(suma(filas, "coeficiente"))));
      if (ed) rf.append(el("td"));
      tfoot.append(rf);
    }
    buscar.addEventListener("input", function () { filtro.texto = buscar.value; pintar(); });
    sel.addEventListener("change", function () { filtro.forma = sel.value; pintar(); });
    pintar();
    if (ed) {
      var acc = el("div", "agregar");
      acc.append(botonAgregar("Unidad", function () {
        d.unidades.push({ unidad: "Nueva", inquilino: "", clave: "NUEVA", forma: "Transfiere", estado: "transfiere", color: COLORES_ESTADO.transfiere });
        filtro.texto = ""; filtro.forma = "";
      }));
      p.append(acc);
    }
    return p;
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
    var notas = panelNotas(d);
    if (notas) box.append(notas);
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

  // ----- Controles: lo que no cierra o falta cargar -----
  function observaciones(d) {
    var out = [];
    var tp = d.totalesPlanilla || {};
    var sumaT = hay(d.unidades, "transferencia") ? suma(d.unidades, "transferencia") : null;
    var ingresos = (d.liquidacion || []).filter(function (x) { return x.tipo === "ingreso" && /TRANSFER/i.test(x.concepto); });
    if (ingresos.length && typeof sumaT === "number") {
      var tr = suma(ingresos, "monto"), dif = tr - sumaT;
      if (Math.abs(dif) >= 0.01) {
        var u = d.unidades.find(function (x) { return typeof x.transferencia === "number" && Math.abs(Math.abs(dif) - x.transferencia) <= 1; });
        out.push({ texto: "Transferencias: la liquidación dice " + pesos(tr) + " y la suma de las unidades da " + pesos(sumaT) + " (diferencia " + pesos(dif) + ")." +
          (u ? " La diferencia coincide con lo que transfirió " + u.unidad + (u.inquilino ? " (" + u.inquilino + ")" : "") + ": puede estar contado dos veces." : "") });
      }
    }
    var base = (d.liquidacion || []).find(function (x) { return x.tipo === "base"; });
    var sumaTot = hay(d.unidades, "total") ? suma(d.unidades, "total") : (typeof tp.total === "number" ? tp.total : null);
    if (base && typeof base.monto === "number" && typeof sumaTot === "number" && Math.abs(base.monto - sumaTot) >= 0.005) {
      out.push({ texto: "Efectivo: la liquidación toma " + pesos(base.monto) + " y las unidades que pagan en efectivo suman " + pesos(sumaTot) + " (diferencia " + pesos(sumaTot - base.monto) + ")." });
    }
    var mezcla = d.unidades.filter(function (x) { return x.forma === "Efectivo" && typeof x.transferencia === "number" && x.transferencia && !x.efectivo; });
    if (mezcla.length) out.push({ texto: mezcla.map(function (x) { return x.unidad; }).join(" y ") + (mezcla.length > 1 ? " figuran" : " figura") + " pagando en efectivo, pero el importe está en la columna Transferencia." });
    var sinPago = d.unidades.filter(function (x) { return x.estado === "no-abono"; });
    if (sinPago.length) out.push({ error: true, texto: "No abonaron: " + sinPago.map(function (x) { return x.unidad + (x.inquilino ? " (" + x.inquilino + ")" : ""); }).join(", ") + "." });
    var imp = (d.expensas || {}).impuestos;
    if (imp && typeof imp.rentasTotal !== "number" && typeof imp.muniTotal !== "number") out.push({ texto: "Expensas: faltan cargar rentas y municipalidad del mes (pestaña Expensas)." });
    if (imp && imp.unidades.length) {
      var sc = suma(imp.unidades, "coeficiente");
      if (Math.abs(sc - 1) > 0.0005) out.push({ texto: "Los coeficientes de expensas suman " + pct(sc) + " (no 100 %)." });
    }
    return out;
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

  cargar();
})();
