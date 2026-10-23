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
 */
(function () {
  "use strict";
  var INDICES = ["ICL", "IPC", "Porcentaje fijo", "Sin actualización"];
  var estado = { edificio: null, contratos: [], indices: {}, hoy: "", cargando: null, listo: false, error: "" };
  var editando = null;  // contrato (o borrador nuevo) en el formulario

  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined && txt !== null) n.textContent = txt; return n; }
  var fmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  function pesos(n) { return typeof n === "number" && !isNaN(n) ? fmt.format(n) : "—"; }
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
    var tdM = el("td", "num", e ? pesos(e.monto) : "—");
    var tdA = el("td");
    if (e && e.indice !== "Sin actualización") {
      tdA.append(el("div", null, e.indice + " · cada " + c.datos["Cada (meses)"] + " meses"));
      if (e.proxima) {
        var px = el("span", "contr-sub", (e.diasParaActualizar <= 0 ? "Tocaba el " : "Próxima: ") + isoADma(e.proxima) +
          (e.nuevo ? " → " + pesos(e.nuevo) + " (" + (e.variacion >= 0 ? "+" : "") + (e.variacion * 100).toFixed(1).replace(".", ",") + " %)" : e.sinIndice ? " · sin índice: cargalo a mano" : ""));
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
        var txt = window.prompt("Monto nuevo desde el " + isoADma(e.proxima) + (e.nuevo ? " (calculado con " + e.indice + ")" : "") + ":", e.nuevo ? String(e.nuevo).replace(".", ",") : "");
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
        " el alquiler de " + f.unidad + " se actualiza por " + e.indice + " y pasa a " + pesos(e.nuevo) + ". Cualquier duda, avisame. Saludos.");
      bs.append(wa);
    }
    tdB.append(bs);
    tr.append(tdU, tdV, tdM, tdA, tdB);
    return tr;
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
    campo("monto", "Monto actual", "text", x["Monto"]);
    var ind = campo("indice", "Se actualiza por", null, x["Índice"] || "ICL", INDICES);
    var cada = campo("cada", "Cada (meses)", "number", x["Cada (meses)"]);
    var pct = campo("porcentaje", "Porcentaje (%)", "text", x["Porcentaje"]);
    campo("ultima", "Última actualización", "date", dmaAIso(x["Última actualización"]));
    campo("notas", "Notas", "text", x["Notas"]);
    var ajustar = function () {
      cada.parentNode.hidden = ind.value === "Sin actualización";
      pct.parentNode.hidden = ind.value !== "Porcentaje fijo";
    };
    ind.addEventListener("change", ajustar);
    ajustar();
    box.append(campos);
    box.append(el("p", "estado-guardado", "“Última actualización”: desde cuándo rige el monto actual (si queda vacío, el inicio). La próxima se calcula sumando los meses."));
    var bs = el("div", "agregar");
    var g = el("button", "boton chico", "Guardar contrato"); g.type = "button";
    var cn = el("button", "boton secundario chico", "Cancelar"); cn.type = "button";
    var msg = el("span", "estado-guardado");
    cn.addEventListener("click", function () { editando = null; repintar(); });
    g.addEventListener("click", function () {
      g.disabled = true; msg.textContent = "Guardando…";
      BGPSesion.pedir("guardarContrato", {
        id: editando.nuevo ? "" : x["ID"], edificio: edificio, lugar: x["Lugar"] || "", unidad: refs.unidad.value,
        inquilino: refs.inquilino.value, telefono: refs.telefono.value, inicio: refs.inicio.value, fin: refs.fin.value,
        monto: refs.monto.value, moneda: "Pesos", indice: refs.indice.value, cada: refs.cada.value, porcentaje: refs.porcentaje.value,
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

  window.PropContratos = { cargar: cargar, panel: panel, botonRecordar: botonRecordar };
})();
