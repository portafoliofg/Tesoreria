/*
 * Propiedades · vista de las liquidaciones mensuales de alquileres.
 *
 * Los datos (inquilinos, montos, patentes) no están en esta página ni en el
 * repositorio, que son públicos: se piden al servidor con la sesión iniciada
 * (BGPSesion.pedir) y se guardan en la planilla de Google, pestaña "Propiedades".
 * "Importar planilla" lee el Excel del mes con propiedades-lector.js y lo guarda.
 * Las expensas que en el Excel se cargan a mano (rentas y municipalidad del mes) se
 * pueden completar acá; se reparten por el coeficiente de cada unidad, igual que en el Excel.
 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  var lista = [];
  var actual = null;
  var filtro = { texto: "", forma: "" };

  // ----- Sesión -----
  function irAlIngreso() { location.replace("index.html?v=6#elegir"); }
  var guardado = BGPSesion.usuario();
  if (!guardado) { irAlIngreso(); return; }
  $("quien").textContent = guardado.nombre || guardado.usuario || "";
  document.body.classList.remove("verificando");
  BGPSesion.consultar().then(function (u) {
    if (!u) { irAlIngreso(); return; }
    $("quien").textContent = u.nombre || u.usuario;
  }, function () {});
  $("salir").addEventListener("click", function () { BGPSesion.salir().then(irAlIngreso); });

  // ----- Formatos -----
  var fmtPesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function pesos(n) { return n === null || n === undefined || n === "" || isNaN(n) ? "—" : fmtPesos.format(n); }
  function pct(n) { return n === null || n === undefined ? "—" : (n * 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + " %"; }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined && txt !== null) n.textContent = txt; return n; }
  function suma(arr, k) { return arr.reduce(function (a, x) { return a + (typeof x[k] === "number" ? x[k] : 0); }, 0); }
  function hay(arr, k) { return arr.some(function (x) { return typeof x[k] === "number"; }); }
  function numeroDe(txt) {
    var t = String(txt || "").replace(/[^0-9,.\-]/g, "");
    if (!t) return null;
    var c = t.lastIndexOf(","), p = t.lastIndexOf(".");
    t = c > p ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
    var n = parseFloat(t);
    return isNaN(n) ? null : n;
  }
  function errorEn(caja, err) {
    if (err && err.sesion === false) { irAlIngreso(); return; }
    caja.replaceChildren(el("div", "alerta error", (err && err.message) || String(err)));
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
    var elegido = lista.find(function (x) { return clave(x) === seleccion; }) || lista[0] || null;
    actual = elegido;
    if (elegido) sel.value = clave(elegido);
  }
  $("periodo").addEventListener("change", function () {
    actual = lista.find(function (x) { return clave(x) === $("periodo").value; }) || null;
    mostrar();
  });

  // ----- Vista -----
  function mostrar() {
    var caja = $("contenido");
    caja.replaceChildren();
    if (!actual) {
      $("tituloEdificio").textContent = "Liquidaciones de alquileres";
      $("subEdificio").textContent = "";
      var v = el("section", "panel vacio-grande");
      v.append(el("h2", null, "Todavía no hay liquidaciones"),
        el("p", null, "Importá la planilla de Excel del mes (resumen de pagos con las hojas RESUMEN TOTAL, TRANSFERENCIAS y EFECTIVO). Se lee completa y queda guardada para consultarla acá."));
      var b = el("button", "boton", "Importar planilla");
      b.type = "button";
      b.addEventListener("click", function () { $("archivo").click(); });
      v.append(b);
      caja.append(v);
      return;
    }
    var d = actual.datos;
    $("tituloEdificio").textContent = d.edificio;
    $("subEdificio").textContent = "Período " + d.periodo + " · " + d.unidades.length + " unidades";

    var obs = observaciones(d);
    if (obs.length) {
      var al = el("div", "alertas");
      obs.forEach(function (o) { var a = el("div", "alerta" + (o.error ? " error" : "")); a.append(o.nodo || document.createTextNode(o.texto)); al.append(a); });
      caja.append(al);
    }
    caja.append(kpis(d));

    var pu = panelUnidades(d);
    pu.classList.add("seccion-grilla");
    caja.append(pu);

    var g1 = el("div", "grilla mitad seccion-grilla");
    var der = columnaDerecha(d);
    g1.append(der.liquidacion, der.otros);
    der.otros.prepend(panelCocheras(d));
    caja.append(g1);

    var pe = panelExpensas(d);
    pe.classList.add("seccion-grilla");
    caja.append(pe);

    if (d.planillaTransferencias) caja.append(panelPlanillaTransferencias(d));
    caja.append(el("p", "meta", "Importado de " + (actual.archivo || d.archivo || "la planilla") + (actual.cargadoPor ? " por " + actual.cargadoPor : "") + (actual.fechaCarga ? " el " + actual.fechaCarga : "") + " · hojas: " + (d.hojas || []).join(", ")));
  }

  function liqDe(d, re) { return (d.liquidacion || []).find(function (x) { return re.test(x.concepto.toUpperCase()); }) || null; }

  function kpis(d) {
    var box = el("section", "kpis");
    box.setAttribute("aria-label", "Resumen");
    var cobrado = liqDe(d, /^TOTAL COBRADO/), transf = (d.liquidacion || []).find(function (x) { return x.tipo === "ingreso"; }),
      efectivo = liqDe(d, /^TOTAL EFECTIVO/);
    var nT = d.unidades.filter(function (u) { return u.forma === "Transfiere"; }).length;
    var nE = d.unidades.filter(function (u) { return u.forma === "Efectivo"; }).length;
    var datos = [
      ["Total cobrado", pesos(cobrado && cobrado.monto), "Efectivo + transferencias"],
      ["Transferencias", pesos(transf && transf.monto), nT + " unidad(es) transfieren"],
      ["Efectivo", pesos(efectivo && efectivo.monto), nE + " unidad(es) · neto de descuentos"],
      ["Unidades", String(d.unidades.length), nT + " transfieren · " + nE + " en efectivo"],
      ["Cocheras", pesos(d.cocherasTotal !== null && d.cocherasTotal !== undefined ? d.cocherasTotal : suma(d.cocheras || [], "monto")), (d.cocheras || []).length + " cochera(s)"]
    ];
    datos.forEach(function (x) { var k = el("div", "kpi"); k.append(el("small", null, x[0]), el("b", null, x[1]), el("span", null, x[2])); box.append(k); });
    return box;
  }

  function pillEstado(u) {
    var f = el("div");
    var p = el("span", "pill " + (u.estado || ""), u.estado === "no-abono" ? "No abonó" : u.estado === "desocupado" ? "Desocupado" : u.estado === "amoblado" ? "Amoblado" : (u.forma || "—"));
    f.append(p);
    if (u.amoblado && u.estado !== "amoblado") { f.append(document.createTextNode(" ")); f.append(el("span", "pill amoblado", "Amoblado")); }
    if (u.mesTexto) f.append(el("span", "sub", u.mesTexto));
    return f;
  }

  var COLS = [
    ["transferencia", "Transferencia"], ["efectivo", "Efectivo"], ["punitorios", "Punitorios"], ["muniRentas", "Muni y rentas"],
    ["cochera", "Cochera"], ["adm", "Adm."], ["arreglos", "Arreglos"], ["total", "Total"]
  ];
  var EXPLICA = { adm: "Administración", total: "Total" };

  function panelUnidades(d) {
    var p = el("section", "panel");
    p.append(el("h2", null, "Unidades"));
    p.append(el("p", "sub-panel", "Hoja EFECTIVO: cada unidad con su inquilino, cómo pagó y la liquidación de los que pagan en efectivo."));
    var herr = el("div", "herramientas");
    var buscar = el("input"); buscar.type = "search"; buscar.placeholder = "Buscar por unidad o inquilino"; buscar.setAttribute("aria-label", "Buscar"); buscar.value = filtro.texto;
    var sel = el("select"); sel.setAttribute("aria-label", "Forma de pago");
    [["", "Todas las unidades"], ["Transfiere", "Transfieren"], ["Efectivo", "Pagan en efectivo"]].forEach(function (o) { var x = el("option", null, o[1]); x.value = o[0]; sel.append(x); });
    sel.value = filtro.forma;
    herr.append(buscar, sel);
    p.append(herr);
    var wrap = el("div", "tabla-scroll");
    var t = el("table");
    var thead = el("thead"), tr = el("tr");
    tr.append(el("th", null, "Unidad"), el("th", null, "Pago"));
    var cols = COLS.filter(function (c) { return hay(d.unidades, c[0]) || (d.totalesPlanilla && typeof d.totalesPlanilla[c[0]] === "number"); });
    cols.forEach(function (c) { tr.append(el("th", "num", c[1])); });
    tr.append(el("th", "num", "Coef. expensas"));
    thead.append(tr);
    var tbody = el("tbody"), tfoot = el("tfoot");
    t.append(thead, tbody, tfoot);
    wrap.append(t);
    p.append(wrap);

    function pintar() {
      var q = filtro.texto.trim().toLowerCase();
      var filas = d.unidades.filter(function (u) {
        if (filtro.forma && u.forma !== filtro.forma) return false;
        return !q || (u.unidad + " " + u.inquilino).toLowerCase().indexOf(q) >= 0;
      });
      tbody.replaceChildren();
      if (!filas.length) { var r0 = el("tr"), c0 = el("td", "vacio", "Ninguna unidad coincide con la búsqueda."); c0.colSpan = cols.length + 3; r0.append(c0); tbody.append(r0); }
      filas.forEach(function (u) {
        var r = el("tr");
        var cu = el("td", "unidad");
        var m = el("span", "marca-color"); m.style.background = "#" + (u.color || "FFFFFF"); m.title = "Color de la fila en el Excel";
        cu.append(m, document.createTextNode(u.unidad));
        cu.append(el("span", "sub", u.inquilino || "—"));
        var cp = el("td"); cp.append(pillEstado(u));
        r.append(cu, cp);
        cols.forEach(function (c) {
          var v = u[c[0]], td = el("td", "num" + (v === 0 ? " cero" : ""), typeof v === "number" ? pesos(v) : "—");
          if (u[c[0] + "Formula"]) td.title = (EXPLICA[c[0]] || c[1]) + " = " + u[c[0] + "Formula"] + " (fórmula del Excel)";
          r.append(td);
        });
        r.append(el("td", "num", pct(u.coeficiente)));
        tbody.append(r);
      });
      tfoot.replaceChildren();
      var rf = el("tr");
      var l = el("td", null, (filtro.texto || filtro.forma ? "Total filtrado · " : "Total · ") + filas.length + " unidad(es)"); l.colSpan = 2;
      rf.append(l);
      cols.forEach(function (c) {
        var td = el("td", "num", hay(filas, c[0]) ? pesos(suma(filas, c[0])) : "—");
        var tp = d.totalesPlanilla && d.totalesPlanilla[c[0]];
        if (typeof tp === "number" && !filtro.texto && !filtro.forma) td.title = "Total en el Excel: " + pesos(tp);
        rf.append(td);
      });
      rf.append(el("td", "num", pct(suma(filas, "coeficiente"))));
      tfoot.append(rf);
    }
    buscar.addEventListener("input", function () { filtro.texto = buscar.value; pintar(); });
    sel.addEventListener("change", function () { filtro.forma = sel.value; pintar(); });
    pintar();
    return p;
  }

  // Liquidación del mes y, aparte, la columna con las referencias de colores.
  function columnaDerecha(d) {
    var col = el("div", "columna");
    var p = el("section", "panel");
    p.append(el("h2", null, "Liquidación del mes"));
    p.append(el("p", "sub-panel", "Hoja RESUMEN TOTAL."));
    var ul = el("ul", "liq");
    var finales = (d.liquidacion || []).filter(function (x) { return x.tipo === "total"; });
    (d.liquidacion || []).forEach(function (x) {
      var li = el("li", x.tipo + (x === finales[finales.length - 1] ? " final" : ""));
      li.append(el("span", null, x.concepto), el("span", "m", x.monto === null ? "—" : pesos(x.monto)));
      if (x.formula) li.title = "Fórmula del Excel: " + x.formula;
      ul.append(li);
    });
    p.append(ul);
    if (d.recibo || d.firma) {
      var rec = el("div", "recibo");
      if (d.recibo) rec.append(el("div", null, d.recibo));
      if (d.firma) rec.append(el("div", "firma", d.firma));
      p.append(rec);
    }
    if ((d.referencias || []).length) {
      var pr = el("section", "panel");
      pr.append(el("h2", null, "Referencias"));
      pr.append(el("p", "sub-panel", "Colores de las filas en la hoja EFECTIVO."));
      var refs = el("ul", "refs");
      d.referencias.forEach(function (r) {
        var li = el("li"), m = el("span", "marca-color");
        m.style.background = "#" + (r.color || "FFFFFF");
        li.append(m, document.createTextNode(r.texto));
        refs.append(li);
      });
      pr.append(refs);
      col.append(pr);
    }
    return { liquidacion: p, otros: col };
  }

  function panelExpensas(d) {
    var p = el("section", "panel");
    p.append(el("h2", null, "Expensas e impuestos"));
    p.append(el("p", "sub-panel", "Hoja RESUMEN TOTAL. Lo que en el Excel se carga a mano cada mes se completa acá; rentas y municipalidad se reparten por el coeficiente de cada unidad."));
    var ex = d.expensas || {};
    var aC = ex.aCargo, imp = ex.impuestos;
    var inputs = {};
    function campo(cont, k, etiqueta, valor, ayuda) {
      var lab = el("label", null, etiqueta);
      var inp = el("input"); inp.type = "text"; inp.inputMode = "decimal"; inp.placeholder = "Sin cargar";
      inp.value = typeof valor === "number" ? valor.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
      lab.append(inp);
      if (ayuda) lab.append(el("small", null, ayuda));
      cont.append(lab);
      inputs[k] = inp;
      return inp;
    }
    function notaDe(n) {
      if (!n || !n.texto) return null;
      var x = el("p", "nota", "Nota en el Excel: " + n.texto);
      if (n.autor || n.celda) x.append(el("small", null, [n.autor, n.celda ? "celda " + n.celda : ""].filter(Boolean).join(" · ")));
      return x;
    }
    if (aC) {
      var t1 = el("p", null); t1.append(el("b", null, aC.titulo));
      p.append(t1);
      var n1 = notaDe(aC.nota); if (n1) p.append(n1);
      var c1 = el("div", "campos");
      campo(c1, "aSuperf", "Superficie", aC.valores && aC.valores.superf);
      campo(c1, "aRentas", "Rentas", aC.valores && aC.valores.rentas);
      campo(c1, "aMuni", "Municipalidad", aC.valores && aC.valores.municipalidad);
      p.append(c1);
      var tot = aC.total || {};
      if (["superf", "rentas", "municipalidad"].some(function (k) { return typeof tot[k] === "number"; }))
        p.append(el("p", "sub-panel", "Total en el Excel · superficie " + pesos(tot.superf) + " · rentas " + pesos(tot.rentas) + " · municipalidad " + pesos(tot.municipalidad)));
    }
    if (imp) {
      var t2 = el("p", null); t2.append(el("b", null, imp.titulo));
      p.append(t2);
      var n2 = notaDe(imp.nota); if (n2) p.append(n2);
      var c2 = el("div", "campos");
      var iR = campo(c2, "rentas", "Rentas del mes (total)", imp.rentasTotal, imp.rentasCelda ? "Celda " + imp.rentasCelda + " del Excel" : "");
      var iM = campo(c2, "muni", "Municipalidad del mes (total)", imp.muniTotal, imp.muniCelda ? "Celda " + imp.muniCelda + " del Excel" : "");
      p.append(c2);
      var wrap = el("div", "tabla-scroll"), t = el("table");
      var hr = el("tr");
      ["Unidad", "Coeficiente", "Rentas", "Municipalidad", "Total"].forEach(function (h, i) { hr.append(el("th", i ? "num" : "", h)); });
      var th = el("thead"); th.append(hr);
      var tb = el("tbody"), tf = el("tfoot");
      t.append(th, tb, tf); wrap.append(t); p.append(wrap);
      var pintar = function () {
        var R = numeroDe(iR.value), M = numeroDe(iM.value);
        tb.replaceChildren(); tf.replaceChildren();
        var sR = 0, sM = 0, sC = 0;
        imp.unidades.forEach(function (u) {
          var r = el("tr"), rr = R === null ? null : R * (u.coeficiente || 0), mm = M === null ? null : M * (u.coeficiente || 0);
          sC += u.coeficiente || 0; sR += rr || 0; sM += mm || 0;
          r.append(el("td", null, u.unidad), el("td", "num", pct(u.coeficiente)), el("td", "num", pesos(rr)), el("td", "num", pesos(mm)),
            el("td", "num", rr === null && mm === null ? "—" : pesos((rr || 0) + (mm || 0))));
          tb.append(r);
        });
        var f = el("tr");
        f.append(el("td", null, "Total"), el("td", "num", pct(sC)), el("td", "num", R === null ? "—" : pesos(sR)), el("td", "num", M === null ? "—" : pesos(sM)),
          el("td", "num", R === null && M === null ? "—" : pesos(sR + sM)));
        tf.append(f);
      };
      iR.addEventListener("input", pintar); iM.addEventListener("input", pintar);
      pintar();
    }
    var fila = el("div", "guardar-fila");
    var b = el("button", "boton", "Guardar expensas"); b.type = "button";
    var est = el("span", "estado-guardado", "");
    fila.append(b, est);
    p.append(fila);
    b.addEventListener("click", function () {
      var datos = JSON.parse(JSON.stringify(actual.datos));
      var e2 = datos.expensas || {};
      if (e2.aCargo) {
        e2.aCargo.valores = e2.aCargo.valores || {};
        e2.aCargo.valores.superf = numeroDe(inputs.aSuperf.value);
        e2.aCargo.valores.rentas = numeroDe(inputs.aRentas.value);
        e2.aCargo.valores.municipalidad = numeroDe(inputs.aMuni.value);
      }
      if (e2.impuestos) {
        e2.impuestos.rentasTotal = numeroDe(inputs.rentas.value);
        e2.impuestos.muniTotal = numeroDe(inputs.muni.value);
        e2.impuestos.unidades.forEach(function (u) {
          u.rentas = e2.impuestos.rentasTotal === null ? u.rentas : e2.impuestos.rentasTotal * (u.coeficiente || 0);
          u.municipalidad = e2.impuestos.muniTotal === null ? u.municipalidad : e2.impuestos.muniTotal * (u.coeficiente || 0);
          u.total = (u.rentas || 0) + (u.municipalidad || 0);
        });
        e2.impuestos.total = e2.impuestos.unidades.reduce(function (a, u) { return a + (u.total || 0); }, 0);
      }
      b.disabled = true; est.textContent = "Guardando…";
      BGPSesion.pedir("guardarPropiedades", { datos: datos, archivo: actual.archivo }).then(function () {
        est.textContent = "Guardado.";
        return cargar(clave(actual));
      }).catch(function (err) {
        if (err && err.sesion === false) { irAlIngreso(); return; }
        est.textContent = err.message;
      }).then(function () { b.disabled = false; });
    });
    return p;
  }

  function panelCocheras(d) {
    var p = el("section", "panel");
    p.append(el("h2", null, "Novedades y cocheras"));
    p.append(el("p", "sub-panel", "Hoja EFECTIVO, debajo de las referencias."));
    var nov = el("div");
    nov.append(el("b", null, "Novedades: "));
    nov.append(document.createTextNode((d.novedades || []).length ? d.novedades.join(" · ") : "sin novedades en la planilla."));
    nov.style.fontSize = "14px"; nov.style.marginBottom = "14px";
    p.append(nov);
    var wrap = el("div", "tabla-scroll"), t = el("table"), th = el("thead"), hr = el("tr");
    ["Inquilino", "Patente / modelo", "Monto"].forEach(function (h, i) { hr.append(el("th", i === 2 ? "num" : "", h)); });
    th.append(hr);
    var tb = el("tbody");
    (d.cocheras || []).forEach(function (c) {
      var r = el("tr");
      r.append(el("td", null, c.inquilino), el("td", null, c.vehiculo || "—"), el("td", "num", pesos(c.monto)));
      tb.append(r);
    });
    if (!(d.cocheras || []).length) { var r0 = el("tr"), c0 = el("td", "vacio", "No hay cocheras en la planilla."); c0.colSpan = 3; r0.append(c0); tb.append(r0); }
    var tf = el("tfoot"), rf = el("tr");
    var tl = el("td", null, "Total · " + (d.cocheras || []).length + " cochera(s)"); tl.colSpan = 2;
    rf.append(tl, el("td", "num", pesos(d.cocherasTotal !== null && d.cocherasTotal !== undefined ? d.cocherasTotal : suma(d.cocheras || [], "monto"))));
    tf.append(rf);
    t.append(th, tb, tf); wrap.append(t); p.append(wrap);
    return p;
  }

  function panelPlanillaTransferencias(d) {
    var pt = d.planillaTransferencias;
    var p = el("section", "panel seccion-grilla");
    p.append(el("h2", null, "Planilla de transferencias"));
    var vacia = pt.filas.every(function (f) { return f.valores.every(function (v) { return v === null || v === ""; }); });
    p.append(el("p", "sub-panel", "Hoja " + pt.titulo + (vacia ? ": en el Excel está sin completar." : ".")));
    var wrap = el("div", "tabla-scroll"), t = el("table"), th = el("thead"), hr = el("tr");
    hr.append(el("th", null, "Unidad"));
    pt.columnas.forEach(function (c) { hr.append(el("th", /MES/i.test(c) ? "" : "num", c)); });
    th.append(hr);
    var tb = el("tbody");
    pt.filas.forEach(function (f) {
      var r = el("tr");
      r.append(el("td", null, f.unidad));
      f.valores.forEach(function (v, i) {
        var esMes = /MES/i.test(pt.columnas[i]);
        r.append(el("td", esMes ? "" : "num", v === null || v === "" ? "—" : typeof v === "number" ? pesos(v) : String(v)));
      });
      tb.append(r);
    });
    var tf = el("tfoot"), rf = el("tr"), tl = el("td", null, "Total");
    tl.colSpan = pt.columnas.length;
    rf.append(tl, el("td", "num", pesos(pt.total)));
    tf.append(rf);
    t.append(th, tb, tf); wrap.append(t); p.append(wrap);
    return p;
  }

  // Controles: lo que no cierra entre las hojas o falta cargar.
  function observaciones(d) {
    var out = [];
    var tp = d.totalesPlanilla || {};
    var transf = (d.liquidacion || []).find(function (x) { return x.tipo === "ingreso"; });
    if (transf && typeof transf.monto === "number" && typeof tp.transferencia === "number") {
      var dif = transf.monto - tp.transferencia;
      if (Math.abs(dif) >= 0.01) {
        var u = d.unidades.find(function (x) { return typeof x.transferencia === "number" && Math.abs(Math.abs(dif) - x.transferencia) <= 1; });
        out.push({ texto: "Transferencias: el resumen dice " + pesos(transf.monto) + " y la suma de la hoja EFECTIVO da " + pesos(tp.transferencia) +
          " (diferencia " + pesos(dif) + ")." + (u ? " La diferencia coincide con lo que transfirió " + u.unidad + (u.inquilino ? " (" + u.inquilino + ")" : "") + ": puede estar contado dos veces." : "") });
      }
    }
    var base = (d.liquidacion || []).find(function (x) { return x.tipo === "base"; });
    if (base && typeof base.monto === "number" && typeof tp.total === "number" && Math.abs(base.monto - tp.total) >= 0.005) {
      out.push({ texto: "Efectivo: el resumen toma " + pesos(base.monto) + " y la hoja EFECTIVO suma " + pesos(tp.total) + " (diferencia " + pesos(tp.total - base.monto) + ", redondeo)." });
    }
    var mezcla = d.unidades.filter(function (x) { return x.forma === "Efectivo" && typeof x.transferencia === "number" && x.transferencia && !x.efectivo; });
    if (mezcla.length) out.push({ texto: mezcla.map(function (x) { return x.unidad; }).join(" y ") + (mezcla.length > 1 ? " figuran" : " figura") +
      " con mes de pago en efectivo, pero el importe está en la columna Transferencia." });
    var sinPago = d.unidades.filter(function (x) { return x.estado === "no-abono"; });
    if (sinPago.length) out.push({ error: true, texto: "No abonaron: " + sinPago.map(function (x) { return x.unidad + (x.inquilino ? " (" + x.inquilino + ")" : ""); }).join(", ") + "." });
    var imp = (d.expensas || {}).impuestos;
    if (imp && imp.rentasTotal === null && imp.muniTotal === null) out.push({ texto: "Expensas: faltan cargar rentas y municipalidad del mes (en el Excel se cargan a mano). Completalas abajo, en Expensas e impuestos." });
    if (imp) {
      var sc = imp.unidades.reduce(function (a, x) { return a + (x.coeficiente || 0); }, 0);
      if (Math.abs(sc - 1) > 0.0005) out.push({ texto: "Los coeficientes de expensas suman " + pct(sc) + " (no 100 %): la parte restante no se reparte entre las unidades." });
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
      s.onload = function () { window.XLSX ? ok(window.XLSX) : mal(new Error("No se pudo cargar el lector de Excel.")); };
      s.onerror = function () { promesaXlsx = null; mal(new Error("No se pudo cargar el lector de Excel. Revisá la conexión y probá de nuevo.")); };
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
      var datos = LectorPropiedades.leer(X, X.read(r[1], { type: "array", cellStyles: true, cellDates: true }), f.name);
      var previo = lista.find(function (x) { return x.edificio.toLowerCase() === datos.edificio.toLowerCase() && x.periodo.toLowerCase() === datos.periodo.toLowerCase(); });
      if (previo && !confirm("Ya hay una liquidación de " + datos.edificio + " · " + datos.periodo + ". ¿Reemplazarla por la de este archivo?")) return null;
      // Las expensas cargadas a mano acá no se pierden si el Excel nuevo las trae vacías.
      if (previo && previo.datos.expensas && datos.expensas) {
        var a = previo.datos.expensas, n = datos.expensas;
        if (a.impuestos && n.impuestos) {
          if (n.impuestos.rentasTotal === null) n.impuestos.rentasTotal = a.impuestos.rentasTotal;
          if (n.impuestos.muniTotal === null) n.impuestos.muniTotal = a.impuestos.muniTotal;
        }
        if (a.aCargo && n.aCargo) ["superf", "rentas", "municipalidad"].forEach(function (k) { if (n.aCargo.valores[k] === null) n.aCargo.valores[k] = a.aCargo.valores[k]; });
      }
      b.textContent = "Guardando…";
      return BGPSesion.pedir("guardarPropiedades", { datos: datos, archivo: f.name }).then(function () { return cargar(datos.edificio + "|" + datos.periodo); });
    }).catch(function (err) {
      if (err && err.sesion === false) { irAlIngreso(); return; }
      alert("No se pudo importar la planilla: " + (err && err.message || err));
    }).then(function () { b.disabled = false; b.textContent = "Importar planilla"; });
  });

  cargar();
})();
