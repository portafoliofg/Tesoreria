/*
 * Propiedades · pestaña Contratos y aviso "no abonó" por WhatsApp.
 *
 * Un contrato por unidad: inquilino, teléfono, inicio, fin, monto y cómo se actualiza
 * (ICL, IPC, porcentaje fijo o sin actualización, cada N meses). El servidor
 * (Contratos.gs) calcula la próxima actualización y el monto estimado con el último
 * índice publicado; "Aplicar" deja el monto nuevo como el actual.
 * Los datos viven solo en la planilla de Google (hoja Contratos), nunca en esta página.
 *
 * PropContratos.cargar(edificio) → Promise   (lo llama propiedades-vista.js al mostrar un edificio)
 * PropContratos.panel(d, edificio, repintar) → nodo de la pestaña
 * PropContratos.botonRecordar(u, d, edificio) → enlace de WhatsApp para una unidad que no abonó
 * PropContratos.montoDe(edificio, unidad) → alquiler actual en pesos (sin IVA; los contratos en
 *   dólares, al Dólar Blue venta de El Cronista), o null. fuenteDe(edificio, unidad) → de dónde sale.
 * PropContratos.sinUnidad(edificio, unidades) → contratos de unidades que no están en la liquidación
 *   (por ejemplo un galpón nuevo): [{unidad, inquilino, lugar}]
 * PropContratos.cuotaDe(edificio, unidad, mesIso) → la cuota de ese mes en pesos: {cuota, subtotal,
 *   total, facturado ("SI" | "NO" | ""), paga (lo que paga el inquilino), aCobrar, participacion} o null
 *
 * Contratos por m² (índice "Suma fija por m²"): metros × precio por m², que sube un monto fijo por m²
 * cada N meses. Tienen su cuadro de cuotas (como el del contrato) con el Dólar Blue del día.
 */
(function () {
  "use strict";
  var INDICE_M2 = "Suma fija por m²";
  var INDICES = ["ICL", "IPC", "Porcentaje fijo", INDICE_M2, "Sin actualización"];
  // Lugares agregados después de que se guardaron liquidaciones (que tienen su propia lista).
  var LUGARES_NUEVOS = ["Oficina PEA"];
  var estado = { edificio: null, contratos: [], indices: {}, dolar: null, hoy: "", cargando: null, listo: false, error: "" };
  var cuotasAbiertas = {};  // ID de contrato → cuadro de cuotas a la vista
  var editando = null;  // contrato (o borrador nuevo) en el formulario

  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined && txt !== null) n.textContent = txt; return n; }
  var fmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  function pesos(n) { return typeof n === "number" && !isNaN(n) ? fmt.format(n) : "—"; }
  var fmt2 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function pesos2(n) { return typeof n === "number" && !isNaN(n) ? "$ " + fmt2.format(n) : "—"; }
  function usd(n) { return typeof n === "number" && !isNaN(n) ? "USD " + fmt2.format(n) : "—"; }
  /** Monto en la moneda del contrato. */
  function montoTxt(n, moneda) { return moneda === "USD" ? usd(n) : pesos(n); }
  function ivaDe(c) { var v = numero(c && c.datos["IVA %"]); return v > 0 ? v : 0; }
  /** Dólares a pesos con el Dólar Blue venta (null si no hay cotización). */
  function aPesos(n) { return estado.dolar && estado.dolar.venta > 0 && typeof n === "number" ? n * estado.dolar.venta : null; }
  function clave(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim(); }
  function dmaAIso(s) { var p = String(s || "").split("/"); return p.length === 3 ? p[2] + "-" + ("0" + p[1]).slice(-2) + "-" + ("0" + p[0]).slice(-2) : ""; }
  function isoADma(s) { var p = String(s || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : ""; }
  function numero(txt) {
    var t = String(txt == null ? "" : txt).replace(/[^0-9,.\-]/g, "");
    var c = t.lastIndexOf(","), p = t.lastIndexOf(".");
    // "455.000" son miles (formato argentino); "455.5" es decimal.
    if (c > p) t = t.split(".").join("").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.split(".").join("");
    var n = parseFloat(t);
    return isNaN(n) ? null : n;
  }

  /** Teléfono argentino para wa.me: 549 + característica + número, sin 0 ni 15. */
  function telWa(t) {
    var d = String(t || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.indexOf("54") === 0) return d.indexOf("549") === 0 ? d : "549" + d.substring(2);
    d = d.replace(/^0/, "");
    return d.length === 10 ? "549" + d : d;
  }
  function enlaceWa(tel, texto) {
    var t = telWa(tel);
    return "https://wa.me/" + (t || "") + "?text=" + encodeURIComponent(texto);
  }

  function cargar(edificio) {
    if (estado.edificio === edificio && estado.cargando) return estado.cargando;
    estado.edificio = edificio;
    estado.error = "";
    estado.listo = false;
    estado.cargando = BGPSesion.pedir("obtenerContratos", { edificio: edificio }).then(function (r) {
      if (estado.edificio !== edificio) return;
      estado.contratos = r.contratos || [];
      estado.indices = r.indices || {};
      estado.dolar = r.dolar || null;
      estado.hoy = r.hoy || "";
      estado.listo = true;
    }).catch(function (err) { estado.error = err.message || "No se pudieron cargar los contratos."; estado.contratos = []; estado.listo = true; });
    return estado.cargando;
  }
  function recargar(repintar) { estado.cargando = null; return cargar(estado.edificio).then(repintar); }

  function contratoDe(unidad) {
    var k = clave(unidad);
    return estado.contratos.find(function (c) { return clave(c.datos["Unidad"]) === k; }) || null;
  }

  // ----- Pestaña -----
  function panel(d, edificio, repintar) {
    var p = el("section", "panel");
    p.append(el("h2", null, "Contratos"));
    var ind = [];
    if (estado.indices.icl) ind.push("ICL " + estado.indices.icl.valor.toLocaleString("es-AR") + " al " + isoADma(estado.indices.icl.fecha));
    if (estado.indices.ipc) ind.push("IPC " + estado.indices.ipc.valor.toLocaleString("es-AR", { maximumFractionDigits: 1 }) + " (" + isoADma(estado.indices.ipc.fecha).substring(3) + ")");
    p.append(el("p", "sub-panel", "Vencimiento y actualización de cada alquiler. " + (ind.length ? "Últimos índices: " + ind.join(" · ") + "." : "Los índices ICL e IPC se leen solos cuando están disponibles.")));
    if (estado.edificio !== edificio || !estado.listo) { cargar(edificio).then(repintar); p.append(el("p", "cargando", "Cargando contratos…")); return p; }
    if (estado.contratos.some(function (c) { return c.datos["Moneda"] === "USD"; })) {
      var b = el("div", "nota dolar-blue");
      if (estado.dolar) {
        b.append(el("b", null, "Dólar Blue: compra " + pesos2(estado.dolar.compra) + " · venta " + pesos2(estado.dolar.venta)),
          document.createTextNode(" · " + (estado.dolar.fuente || "El Cronista") + (estado.dolar.fecha ? ", " + estado.dolar.fecha : "") + ". Los contratos en dólares se pasan a pesos con la venta."));
      } else b.append(document.createTextNode("No se pudo leer el Dólar Blue (El Cronista): los contratos en dólares se muestran solo en dólares."));
      p.append(b);
    }
    if (estado.error) { p.append(el("div", "alerta error", estado.error)); }
    if (editando) p.append(formulario(d, edificio, repintar));

    var tabla = el("table");
    var th = el("tr");
    ["Unidad", "Vence", "Monto actual", "Actualización", ""].forEach(function (h, i) { th.append(el("th", i === 2 ? "num" : null, h)); });
    var thead = el("thead"); thead.append(th);
    var tbody = el("tbody");
    var vistos = {};
    var filas = (d.unidades || []).map(function (u) { return { unidad: u.unidad, inquilino: u.inquilino, lugar: u.lugar || "", c: contratoDe(u.unidad) }; });
    filas.forEach(function (f) { if (f.c) vistos[f.c.datos["ID"]] = true; });
    estado.contratos.forEach(function (c) { if (!vistos[c.datos["ID"]]) filas.push({ unidad: c.datos["Unidad"], inquilino: c.datos["Inquilino"], lugar: c.datos["Lugar"], c: c }); });
    filas.forEach(function (f) { tbody.append(fila(f, d, edificio, repintar)); });
    if (!filas.length) { var r0 = el("tr"), c0 = el("td", "vacio", "No hay unidades."); c0.colSpan = 5; r0.append(c0); tbody.append(r0); }
    tabla.append(thead, tbody);
    var sc = el("div", "tabla-scroll"); sc.append(tabla);
    p.append(sc);
    var acc = el("div", "agregar");
    var nuevo = el("button", "boton secundario chico", "+ Contrato de otra unidad");
    nuevo.type = "button";
    nuevo.addEventListener("click", function () { editando = { nuevo: true, datos: { "Unidad": "", "Índice": "ICL", "Cada (meses)": "3" } }; repintar(); });
    acc.append(nuevo);
    p.append(acc);
    return p;
  }

  function fila(f, d, edificio, repintar) {
    var tr = el("tr");
    var c = f.c, e = c ? c.estado : null;
    var tdU = el("td", "unidad");
    tdU.append(el("b", null, f.unidad || "—"), el("span", "contr-sub", (c && c.datos["Inquilino"]) || f.inquilino || ""));
    var tdV = el("td");
    if (e && e.fin) {
      tdV.append(el("div", null, isoADma(e.fin)));
      var dv = el("span", "contr-sub", e.vencido ? "Vencido" : "en " + e.diasParaVencer + " día" + (e.diasParaVencer === 1 ? "" : "s"));
      if (e.vencido || e.diasParaVencer <= 60) dv.style.color = e.vencido || e.diasParaVencer <= 30 ? "var(--rojo)" : "var(--oro)";
      tdV.append(dv);
    } else tdV.append(el("span", "contr-sub", c ? "Sin fecha de fin" : "Sin contrato"));
    var tdM = el("td", "num");
    var mon = c ? c.datos["Moneda"] : "Pesos";
    tdM.append(el("div", null, e ? montoTxt(e.monto, mon) : "—"));
    if (e && mon === "USD") {
      var ars = aPesos(e.monto), iva = ivaDe(c);
      if (ars !== null) {
        tdM.append(el("span", "contr-sub", "≈ " + pesos(ars) + (iva ? " + IVA " + String(iva).replace(".", ",") + " % = " + pesos(ars * (1 + iva / 100)) : "")));
      }
    } else if (e && ivaDe(c)) tdM.append(el("span", "contr-sub", "+ IVA " + String(ivaDe(c)).replace(".", ",") + " % = " + pesos(e.monto * (1 + ivaDe(c) / 100))));
    if (e && c.datos["Índice"] === INDICE_M2 && numero(c.datos["Metros"]) > 0) {
      tdM.append(el("span", "contr-sub", fmt2.format(numero(c.datos["Metros"])).replace(",00", "") + " m² × " + montoTxt(e.monto / numero(c.datos["Metros"]), mon) + (e.cuota ? " · cuota " + e.cuota + (e.totalCuotas ? " de " + e.totalCuotas : "") : "")));
    }
    var tdA = el("td");
    if (e && e.indice !== "Sin actualización") {
      tdA.append(el("div", null, e.indice === INDICE_M2 ? "+ " + montoTxt(numero(c.datos["Aumento por m²"]), mon).replace(/,00$/, "") + " por m² cada " + c.datos["Cada (meses)"] + " meses" : e.indice + " · cada " + c.datos["Cada (meses)"] + " meses"));
      if (e.proxima) {
        var cuotaProx = e.cuota ? e.cuota + mesesEntre(estado.hoy, e.proxima) : null;
        var px = el("span", "contr-sub", (e.diasParaActualizar <= 0 ? "Tocaba el " : "Próxima: ") + isoADma(e.proxima) + (cuotaProx ? " (cuota " + cuotaProx + ")" : "") +
          (e.nuevo ? " → " + montoTxt(e.nuevo, mon) + " (" + (e.variacion >= 0 ? "+" : "") + (e.variacion * 100).toFixed(1).replace(".", ",") + " %)" : e.sinIndice ? " · sin índice: cargalo a mano" : ""));
        if (e.diasParaActualizar <= 15) px.style.color = e.diasParaActualizar <= 0 ? "var(--rojo)" : "var(--oro)";
        tdA.append(px);
      } else tdA.append(el("span", "contr-sub", "Sin más actualizaciones antes del fin"));
    } else tdA.append(el("span", "contr-sub", c ? "Sin actualización" : "—"));
    var tdB = el("td");
    var bs = el("div", "lado");
    var ed = el("button", "boton secundario chico", c ? "Editar" : "Cargar");
    ed.type = "button";
    ed.addEventListener("click", function () {
      editando = c ? { datos: Object.assign({}, c.datos) } : { nuevo: true, datos: { "Unidad": f.unidad, "Inquilino": f.inquilino || "", "Lugar": f.lugar, "Índice": "ICL", "Cada (meses)": "3" } };
      repintar();
    });
    bs.append(ed);
    if (e && e.proxima && e.diasParaActualizar <= 15) {
      var ap = el("button", "boton chico", "Aplicar");
      ap.type = "button";
      ap.title = "El monto nuevo pasa a ser el actual desde el " + isoADma(e.proxima);
      ap.addEventListener("click", function () {
        var txt = window.prompt("Monto nuevo" + (mon === "USD" ? " en dólares" : "") + " desde el " + isoADma(e.proxima) + (e.nuevo ? " (calculado con " + e.indice + ")" : "") + ":", e.nuevo ? String(Math.round(e.nuevo * 100) / 100).replace(".", ",") : "");
        if (txt === null) return;
        var monto = numero(txt);
        if (!(monto > 0)) { window.alert("Escribí un monto válido."); return; }
        ap.disabled = true;
        BGPSesion.pedir("aplicarActualizacionContrato", { id: c.datos["ID"], monto: monto }).then(function () { return recargar(repintar); })
          .catch(function (err) { ap.disabled = false; window.alert(err.message); });
      });
      bs.append(ap);
    }
    if (c && c.datos["Teléfono"] && e && e.proxima && e.nuevo && e.diasParaActualizar <= 15) {
      var wa = el("a", "boton secundario chico", "Avisar por WhatsApp");
      wa.target = "_blank"; wa.rel = "noopener";
      wa.href = enlaceWa(c.datos["Teléfono"], "Hola " + (c.datos["Inquilino"] || "") + ", te aviso que a partir del " + isoADma(e.proxima) +
        " el alquiler de " + f.unidad + " se actualiza" + (e.indice === INDICE_M2 ? "" : " por " + e.indice) + " y pasa a " + montoTxt(e.nuevo, mon) + (ivaDe(c) ? " + IVA" : "") + ". Cualquier duda, avisame. Saludos.");
      bs.append(wa);
    }
    if (c && c.datos["Índice"] === INDICE_M2 && e && e.inicio && e.totalCuotas) {
      var vc = el("button", "boton secundario chico", cuotasAbiertas[c.datos["ID"]] ? "Ocultar cuotas" : "Ver cuotas");
      vc.type = "button";
      vc.addEventListener("click", function () { cuotasAbiertas[c.datos["ID"]] = !cuotasAbiertas[c.datos["ID"]]; repintar(); });
      bs.append(vc);
    }
    tdB.append(bs);
    tr.append(tdU, tdV, tdM, tdA, tdB);
    if (c && cuotasAbiertas[c.datos["ID"]] && e && e.totalCuotas) {
      var frag = document.createDocumentFragment();
      var tr2 = el("tr", "fila-cuotas"), td2 = el("td");
      td2.colSpan = 5;
      td2.append(cuadroCuotas(c));
      tr2.append(td2);
      frag.append(tr, tr2);
      return frag;
    }
    return tr;
  }

  function mesesEntre(a, b) {
    var m = function (iso) { return parseInt(iso.substring(0, 4), 10) * 12 + parseInt(iso.substring(5, 7), 10); };
    return a && b ? m(b) - m(a) : 0;
  }
  function sumarMeses(iso, n) {
    var y = parseInt(iso.substring(0, 4), 10), mes = parseInt(iso.substring(5, 7), 10) - 1 + n, d = parseInt(iso.substring(8, 10), 10);
    var f = new Date(Date.UTC(y, mes, 1)), ult = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
    return f.getUTCFullYear() + "-" + ("0" + (f.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + Math.min(d, ult)).slice(-2);
  }

  /** Parte que cobra Andrés (%): la del contrato o, si no está cargada, 50. */
  function participacionDe(c) { var v = numero(c.datos["Participación %"]); return v > 0 ? v : 50; }
  /** Lo marcado en el cuadro: {"9": "SI", "10": "NO"}. */
  function facturacionDe(c) {
    var m = {};
    String(c.datos["Facturación"] || "").split(";").forEach(function (x) { var p = x.split(":"); if (p.length === 2 && p[0].trim()) m[p[0].trim()] = p[1].trim(); });
    return m;
  }

  // Cuadro de cuotas de un contrato por m², como el del contrato: fecha, cuota, metros, precio por
  // m², tipo de cambio, subtotal, IVA y total. Las que vienen se estiman con el Dólar Blue de hoy.
  // "¿Se facturó?" por cuota: A cobrar es la participación sobre el total (con factura) o sobre el
  // subtotal (sin factura).
  function cuadroCuotas(c) {
    var e = c.estado, mon = c.datos["Moneda"];
    var part = participacionDe(c), fact = facturacionDe(c);
    var metros = numero(c.datos["Metros"]), aumento = numero(c.datos["Aumento por m²"]) || 0, cada = parseInt(c.datos["Cada (meses)"], 10) || 12;
    var precioHoy = e.monto / metros, ultima = e.ultima || e.inicio, iva = ivaDe(c);
    var box = el("div", "cuotas-box");
    var t = el("table", "cuotas");
    var trh = el("tr");
    ["Fecha", "Cuota", "Metros", "Precio m²", mon === "USD" ? "Subtotal USD" : "Subtotal", mon === "USD" ? "TC (blue venta)" : "", "Subtotal $", "IVA", "Total $", "¿Se facturó?", "A cobrar (" + String(part).replace(".", ",") + " %)"].forEach(function (h, i) {
      if (h === "" ) return; trh.append(el("th", i ? "num" : null, h));
    });
    var thead = el("thead"); thead.append(trh);
    var tbody = el("tbody");
    for (var k = 1; k <= e.totalCuotas; k++) {
      var fecha = sumarMeses(e.inicio, k - 1);
      var desde = mesesEntre(ultima, fecha);
      var pasos = desde >= 0 ? Math.floor(desde / cada) : -Math.ceil(-desde / cada);
      var sub = montoCuota(c, k);
      var precio = Math.round(sub / metros * 100) / 100;
      var futura = k >= (e.cuota || 1);
      var subPesos = mon === "USD" ? (futura ? aPesos(sub) : null) : sub;
      var tr = el("tr", (k === e.cuota ? "actual" : "") + (pasos !== 0 && desde % cada === 0 && desde > 0 ? " sube" : ""));
      tr.append(el("td", null, isoADma(fecha)), el("td", "num", String(k)), el("td", "num", fmt2.format(metros).replace(",00", "")), el("td", "num", montoTxt(precio, mon)));
      if (mon === "USD") tr.append(el("td", "num", usd(sub)), el("td", "num", futura && estado.dolar ? pesos2(estado.dolar.venta) : "—"));
      else tr.append(el("td", "num", pesos2(sub)));
      tr.append(el("td", "num", subPesos === null ? "—" : pesos2(subPesos)), el("td", "num", subPesos === null || !iva ? "—" : pesos2(subPesos * iva / 100)),
        el("td", "num", subPesos === null ? "—" : pesos2(subPesos * (1 + iva / 100))));
      var tdF = el("td", "fact"), tdC = el("td", "num cobrar");
      tdF.append(selectFacturado(c, k, fact[k] || "", subPesos, iva, part, tdC));
      pintarCobrar(tdC, fact[k] || "", subPesos, iva, part);
      tr.append(tdF, tdC);
      tbody.append(tr);
    }
    t.append(thead, tbody);
    var sc = el("div", "tabla-scroll"); sc.append(t);
    box.append(sc);
    box.append(el("p", "contr-sub", (mon === "USD" ? "En pesos, solo desde la cuota de este mes y con el Dólar Blue venta de hoy (es una estimación: se paga al del día). " : "") +
      "En negrita, la cuota actual; resaltadas, las que suben el precio por m². A cobrar: el " + String(part).replace(".", ",") + " % del total si se facturó o del subtotal si no."));
    return box;
  }

  /** A cobrar de una cuota según si se facturó (sobre el total con IVA) o no (sobre el subtotal). */
  function pintarCobrar(td, valor, subPesos, iva, part) {
    td.classList.toggle("vacio-cobrar", !valor || subPesos === null);
    if (!valor) { td.textContent = "Elegí SÍ o NO"; return; }
    if (subPesos === null) { td.textContent = "—"; return; }
    var base = valor === "SI" ? subPesos * (1 + iva / 100) : subPesos;
    td.replaceChildren(el("div", null, pesos2(base * part / 100)), el("span", "contr-sub", valor === "SI" ? "sobre el total" : "sobre el subtotal"));
  }

  function selectFacturado(c, cuota, valor, subPesos, iva, part, tdC) {
    var sel = el("select", "sel-fact");
    sel.setAttribute("aria-label", "¿Se facturó la cuota " + cuota + "?");
    [["", "—"], ["SI", "Sí"], ["NO", "No"]].forEach(function (o) { var x = el("option", null, o[1]); x.value = o[0]; sel.append(x); });
    sel.value = valor;
    sel.className = "sel-fact" + (valor ? " " + valor.toLowerCase() : "");
    sel.addEventListener("change", function () {
      var nuevo = sel.value, previo = valor;
      sel.disabled = true;
      pintarCobrar(tdC, nuevo, subPesos, iva, part);
      BGPSesion.pedir("guardarContrato", { facturaCuota: true, id: c.datos["ID"], cuota: cuota, valor: nuevo }).then(function (r) {
        c.datos["Facturación"] = r.facturacion || "";
        valor = nuevo;
        sel.className = "sel-fact" + (nuevo ? " " + nuevo.toLowerCase() : "");
        sel.disabled = false;
      }).catch(function (err) {
        sel.value = previo; sel.disabled = false;
        pintarCobrar(tdC, previo, subPesos, iva, part);
        window.alert("No se pudo guardar: " + err.message);
      });
    });
    return sel;
  }

  // ----- Formulario -----
  function formulario(d, edificio, repintar) {
    var x = editando.datos;
    var box = el("div", "recibo");
    box.append(el("b", null, editando.nuevo ? "Nuevo contrato" : "Contrato de " + x["Unidad"]));
    var campos = el("div", "campos");
    var refs = {};
    function campo(nombre, etiqueta, tipo, valor, opciones) {
      var lab = el("label", null, etiqueta);
      var inp;
      if (opciones) { inp = el("select"); opciones.forEach(function (o) { var op = el("option", null, o); op.value = o; inp.append(op); }); }
      else { inp = el("input"); inp.type = tipo || "text"; }
      inp.value = valor || "";
      inp.style.textAlign = "left"; inp.style.fontFamily = "inherit";
      lab.append(inp);
      campos.append(lab);
      refs[nombre] = inp;
      return inp;
    }
    var unidades = (d.unidades || []).map(function (u) { return u.unidad; });
    if (editando.nuevo && !x["Unidad"]) campo("unidad", "Unidad", "text", "");
    else if (editando.nuevo) campo("unidad", "Unidad", null, x["Unidad"], unidades.indexOf(x["Unidad"]) >= 0 ? unidades : [x["Unidad"]]);
    else campo("unidad", "Unidad", "text", x["Unidad"]);
    campo("inquilino", "Inquilino", "text", x["Inquilino"]);
    campo("telefono", "Teléfono (WhatsApp)", "tel", x["Teléfono"]);
    campo("inicio", "Inicio", "date", dmaAIso(x["Inicio"]));
    campo("fin", "Fin", "date", dmaAIso(x["Fin"]));
    // Los lugares de la liquidación más los que se agregaron después (mismos que LUGARES en propiedades-vista.js).
    var lugares = d.lugares && d.lugares.length ? d.lugares.concat(LUGARES_NUEVOS.filter(function (l) { return d.lugares.indexOf(l) < 0; })) : [];
    if (lugares.length) campo("lugar", "Lugar", null, x["Lugar"] || lugares[0], lugares);
    campo("moneda", "Moneda", null, x["Moneda"] === "USD" ? "USD" : "Pesos", ["Pesos", "USD"]);
    var ind = campo("indice", "Se actualiza por", null, x["Índice"] || "ICL", INDICES);
    var monto = campo("monto", "Monto actual", "text", x["Monto"]);
    var metros = campo("metros", "Metros (m²)", "text", x["Metros"]);
    var metrosN = numero(x["Metros"]), montoN = numero(x["Monto"]);
    var precio = campo("precioM2", "Precio por m² actual", "text", metrosN > 0 && montoN > 0 ? String(Math.round(montoN / metrosN * 100) / 100).replace(".", ",") : "");
    var aum = campo("aumento", "Sube por m² (cada actualización)", "text", x["Aumento por m²"]);
    var cada = campo("cada", "Cada (meses)", "number", x["Cada (meses)"]);
    var pct = campo("porcentaje", "Porcentaje (%)", "text", x["Porcentaje"]);
    campo("iva", "IVA (%)", "text", x["IVA %"]);
    campo("participacion", "Participación de Andrés (%)", "text", x["Participación %"] || "50");
    campo("ultima", "Última actualización", "date", dmaAIso(x["Última actualización"]));
    campo("notas", "Notas", "text", x["Notas"]);
    var ajustar = function () {
      var m2 = ind.value === INDICE_M2;
      cada.parentNode.hidden = ind.value === "Sin actualización";
      pct.parentNode.hidden = ind.value !== "Porcentaje fijo";
      monto.parentNode.hidden = m2;
      precio.parentNode.hidden = !m2;
      aum.parentNode.hidden = !m2;
      metros.parentNode.hidden = !m2;
    };
    ind.addEventListener("change", ajustar);
    ajustar();
    box.append(campos);
    box.append(el("p", "estado-guardado", "“Última actualización”: desde cuándo rige el monto actual (si queda vacío, el inicio). La próxima se calcula sumando los meses. Por m²: el monto es metros × precio por m², y en cada actualización el precio sube lo indicado (en la moneda del contrato)."));
    var bs = el("div", "agregar");
    var g = el("button", "boton chico", "Guardar contrato"); g.type = "button";
    var cn = el("button", "boton secundario chico", "Cancelar"); cn.type = "button";
    var msg = el("span", "estado-guardado");
    cn.addEventListener("click", function () { editando = null; repintar(); });
    g.addEventListener("click", function () {
      g.disabled = true; msg.textContent = "Guardando…";
      BGPSesion.pedir("guardarContrato", {
        id: editando.nuevo ? "" : x["ID"], edificio: edificio, lugar: refs.lugar ? refs.lugar.value : (x["Lugar"] || ""), unidad: refs.unidad.value,
        inquilino: refs.inquilino.value, telefono: refs.telefono.value, inicio: refs.inicio.value, fin: refs.fin.value,
        monto: refs.monto.value, moneda: refs.moneda.value, indice: refs.indice.value, cada: refs.cada.value, porcentaje: refs.porcentaje.value,
        metros: refs.metros.value, precioM2: refs.precioM2.value, aumento: refs.aumento.value, iva: refs.iva.value, participacion: refs.participacion.value,
        ultima: refs.ultima.value, notas: refs.notas.value
      }).then(function () { editando = null; return recargar(repintar); })
        .catch(function (err) { g.disabled = false; msg.textContent = err.message; });
    });
    bs.append(g, cn);
    if (!editando.nuevo) {
      var del = el("button", "boton secundario chico", "Eliminar"); del.type = "button";
      del.addEventListener("click", function () {
        if (!window.confirm("¿Eliminar el contrato de " + x["Unidad"] + "?")) return;
        BGPSesion.pedir("eliminarContrato", { id: x["ID"] }).then(function () { editando = null; return recargar(repintar); })
          .catch(function (err) { msg.textContent = err.message; });
      });
      bs.append(del);
    }
    bs.append(msg);
    box.append(bs);
    return box;
  }

  // ----- "No abonó": recordatorio por WhatsApp al inquilino -----
  function botonRecordar(u, d, edificio) {
    var c = estado.edificio === edificio && estado.listo ? contratoDe(u.unidad) : null;
    var tel = c && c.datos["Teléfono"];
    var a = el("a", "boton secundario chico", tel ? "Recordarle" : "Recordarle (elegís el contacto)");
    a.target = "_blank"; a.rel = "noopener";
    a.title = tel ? "Abre WhatsApp con el mensaje listo para " + (c.datos["Inquilino"] || u.inquilino || "el inquilino") : "Cargá el teléfono en Contratos para que vaya directo";
    a.href = enlaceWa(tel, "Hola " + (u.inquilino || (c && c.datos["Inquilino"]) || "") + ", ¿cómo estás? Te escribo porque el alquiler de " + u.unidad +
      " de " + (d.periodo || "este mes") + " todavía figura pendiente. Cuando puedas, avisame. ¡Gracias!");
    a.style.marginTop = "4px";
    return a;
  }

  function montoDe(edificio, unidad) {
    var c = estado.edificio === edificio && estado.listo ? contratoDe(unidad) : null;
    if (!(c && c.estado && typeof c.estado.monto === "number" && c.estado.monto > 0)) return null;
    return c.datos["Moneda"] === "USD" ? aPesos(c.estado.monto) : c.estado.monto;
  }
  function fuenteDe(edificio, unidad) {
    var c = estado.edificio === edificio && estado.listo ? contratoDe(unidad) : null;
    if (!c) return "";
    return c.datos["Moneda"] === "USD" ? "Contrato " + usd(c.estado.monto) + " al blue " + (estado.dolar ? pesos2(estado.dolar.venta) : "") : "Según el contrato";
  }
  /** Monto de la cuota k en la moneda del contrato (los de m² con el precio que rige ese mes). */
  function montoCuota(c, k) {
    var e = c.estado;
    if (c.datos["Índice"] !== INDICE_M2) return e.monto;
    var metros = numero(c.datos["Metros"]), aumento = numero(c.datos["Aumento por m²"]) || 0, cada = parseInt(c.datos["Cada (meses)"], 10) || 12;
    var desde = mesesEntre(e.ultima || e.inicio, sumarMeses(e.inicio, k - 1));
    var pasos = desde >= 0 ? Math.floor(desde / cada) : -Math.ceil(-desde / cada);
    return Math.round(metros * (Math.round((e.monto / metros + aumento * pasos) * 100) / 100) * 100) / 100;
  }

  function cuotaDe(edificio, unidad, mesIso) {
    var c = estado.edificio === edificio && estado.listo ? contratoDe(unidad) : null;
    if (!(c && c.estado && c.estado.inicio && c.estado.monto > 0)) return null;
    var k = mesesEntre(c.estado.inicio, (mesIso || estado.hoy).substring(0, 7) + "-01") + 1;
    if (k < 1 || (c.estado.totalCuotas && k > c.estado.totalCuotas)) return null;
    var m = montoCuota(c, k);
    var sub = c.datos["Moneda"] === "USD" ? aPesos(m) : m;
    if (sub === null) return null;
    var iva = ivaDe(c), part = participacionDe(c), fact = facturacionDe(c)[k] || "";
    var total = sub * (1 + iva / 100);
    var paga = fact === "SI" ? total : fact === "NO" ? sub : null;
    return { cuota: k, subtotal: sub, total: total, facturado: fact, paga: paga, aCobrar: paga === null ? null : paga * part / 100, participacion: part };
  }

  function sinUnidad(edificio, unidades) {
    if (estado.edificio !== edificio || !estado.listo) return [];
    var hay = {};
    (unidades || []).forEach(function (u) { hay[clave(u.unidad)] = true; });
    return estado.contratos.filter(function (c) { return c.datos["Unidad"] && !hay[clave(c.datos["Unidad"])]; })
      .map(function (c) { return { unidad: c.datos["Unidad"], inquilino: c.datos["Inquilino"] || "", lugar: c.datos["Lugar"] || "" }; });
  }

  window.PropContratos = { cargar: cargar, panel: panel, botonRecordar: botonRecordar, montoDe: montoDe, fuenteDe: fuenteDe, sinUnidad: sinUnidad, cuotaDe: cuotaDe };
})();
