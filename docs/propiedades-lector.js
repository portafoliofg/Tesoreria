/*
 * Lector de la planilla mensual de alquileres (Propiedades · Andrés Sammartino)
 *
 * Lee el Excel "RESUMEN DE PAGOS DE SAMMARTINO ANDRES…" con sus tres hojas y devuelve
 * todo lo que trae, sin perder datos:
 *  - RESUMEN TOTAL: edificio y período (título), expensas a cargo de Sammartino,
 *    impuestos de expensas por unidad (coeficiente, rentas, municipalidad), la
 *    liquidación (efectivo, descuentos, transferencias, total cobrado), el recibo y
 *    la firma, y las notas de las celdas.
 *  - EFECTIVO: cada unidad con su inquilino, cómo pagó y cada columna (transferencia,
 *    efectivo, punitorios, muni y rentas, cochera, administración, arreglos, total),
 *    el color de la fila (estado), las referencias de colores, las novedades y las cocheras.
 *  - TRANSFERENCIAS: la planilla de transferencias tal cual (unidades y columnas).
 * Las columnas y filas se buscan por su título, no por posición fija, así los meses
 * siguientes se leen igual aunque se agregue o mueva algo.
 *
 * LectorPropiedades.leer(XLSX, workbook, nombreArchivo) → datos (objeto para guardar)
 * LectorPropiedades.claveUnidad("1° G") → "1G" (para cruzar unidades entre hojas)
 */
(function (raiz) {
  var MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
  var MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  function normalizar(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  }
  function limpio(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }

  // "1° G" → "1G", "local B" → "LOCALB", "PB A " → "PBA", "1 ° E" → "1E".
  function claveUnidad(s) {
    return normalizar(s).replace(/[°º]/g, "").replace(/[^A-Z0-9]/g, "");
  }

  // Hoja → grilla de celdas {v, f, color, nota, fecha}.
  function grilla(XLSX, ws) {
    var g = [];
    if (!ws || !ws["!ref"]) return g;
    var rango = XLSX.utils.decode_range(ws["!ref"]);
    for (var r = rango.s.r; r <= rango.e.r; r++) {
      var fila = [];
      for (var c = rango.s.c; c <= rango.e.c; c++) {
        var celda = ws[XLSX.utils.encode_cell({ r: r, c: c })];
        if (!celda) { fila.push(null); continue; }
        var x = { v: celda.v, f: celda.f ? String(celda.f).trim() : "", ref: XLSX.utils.encode_cell({ r: r, c: c }) };
        if (celda.t === "d" || celda.v instanceof Date) x.fecha = celda.v;
        if (celda.s && celda.s.fgColor) x.color = celda.s.fgColor.rgb ? String(celda.s.fgColor.rgb).slice(-6).toUpperCase() : (celda.s.fgColor.theme === 0 ? "FFFFFF" : "");
        if (celda.c && celda.c.length) x.nota = celda.c.map(function (n) { return n.t; }).join("\n");
        fila.push(x);
      }
      g.push(fila);
    }
    return g;
  }

  function texto(c) { return c && c.v != null && !(c.v instanceof Date) && typeof c.v !== "number" ? limpio(c.v) : ""; }
  function numero(c) { return c && typeof c.v === "number" && isFinite(c.v) ? c.v : null; }
  function vacia(c) { return !c || c.v == null || (typeof c.v === "string" && !c.v.trim()); }

  function buscar(g, re, desdeFila) {
    for (var r = desdeFila || 0; r < g.length; r++) for (var c = 0; c < g[r].length; c++) if (re.test(normalizar(g[r][c] && g[r][c].v))) return { r: r, c: c };
    return null;
  }

  // Nota de Google Sheets exportada: "======\nID#…\nUsuario    (2025-04-16 15:36:20)\nTEXTO".
  function nota(c) {
    if (!c || !c.nota) return null;
    var lineas = c.nota.split(/\r?\n/).map(limpio).filter(function (l) { return l && !/^=+$/.test(l) && !/^ID#/.test(l); });
    var autor = "", m;
    if (lineas.length && (m = /^(.*?)\s*\((\d{4}-\d{2}-\d{2}[^)]*)\)$/.exec(lineas[0]))) { autor = m[1] + " · " + m[2]; lineas.shift(); }
    return { texto: lineas.join(" "), autor: autor, celda: c.ref };
  }

  function mesDeFecha(d) {
    // Las fechas del Excel llegan a medianoche UTC: se leen en UTC para no correr el día.
    return { iso: d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"), texto: MESES_CORTOS[d.getUTCMonth()] + "-" + String(d.getUTCFullYear()).slice(-2) };
  }

  // "CALLE EJEMPLO NRO. 123 : Octubre/26" → edificio, período y orden (2026-10).
  function titulo(t) {
    var partes = String(t || "").split(":");
    var edif = limpio(partes[0]), per = limpio(partes.slice(1).join(":"));
    var lindo = edif.toLowerCase().replace(/(^|\s)(\S)/g, function (_, a, b) { return a + b.toUpperCase(); }).replace(/\bNro\.?\s*/i, "N° ");
    var orden = "", m = /([A-Za-zÁÉÍÓÚáéíóú]+)\s*[\/\- ]\s*(\d{2,4})/.exec(per);
    if (m) {
      var i = MESES.indexOf(normalizar(m[1]));
      var anio = m[2].length === 2 ? "20" + m[2] : m[2];
      if (i >= 0) orden = anio + "-" + String(i + 1).padStart(2, "0");
    }
    return { original: limpio(t), edificio: lindo, periodo: per, orden: orden };
  }

  function unidadEInquilino(t) {
    var s = limpio(t), m = /^(.*?)\s*\((.*)\)\s*$/.exec(s);
    return m ? { unidad: limpio(m[1]), inquilino: limpio(m[2]) } : { unidad: s, inquilino: "" };
  }

  // Colores de las referencias de la hoja EFECTIVO.
  function estadoPorColor(color) {
    if (color === "FF0000") return "no-abono";
    if (color === "A5A5A5" || color === "7F7F7F") return "desocupado";
    if (color === "8EAADB") return "amoblado";
    return "";
  }

  function leerResumen(g, out) {
    var t = buscar(g, /\S/);
    var tit = titulo(t ? g[t.r][t.c].v : "");
    out.tituloOriginal = tit.original; out.edificio = tit.edificio; out.periodo = tit.periodo; out.orden = tit.orden;

    var exp = { aCargo: null, impuestos: null };
    // Expensas a cargo de Sammartino: títulos SUPERF / RENTAS / MUNICIPALIDAD en la misma fila.
    var a = buscar(g, /^EXPENSAS A CARGO/);
    if (a) {
      var cols = {}, fila = g[a.r];
      fila.forEach(function (c, i) { var n = normalizar(c && c.v); if (/^SUPERF/.test(n)) cols.superf = i; else if (/^RENTAS/.test(n)) cols.rentas = i; else if (/^MUNICIPALIDAD/.test(n)) cols.municipalidad = i; });
      var tot = buscar(g, /^TOTAL$/, a.r + 1);
      var val = function (r) { var o = {}; Object.keys(cols).forEach(function (k) { o[k] = numero(g[r] && g[r][cols[k]]); }); return o; };
      exp.aCargo = { titulo: limpio(fila[a.c].v), nota: nota(fila[a.c]), valores: val(a.r + 1), total: tot ? val(tot.r) : null };
    }
    // Impuestos de expensas por unidad: columna B (total), C (coeficiente), D (rentas), E (municipalidad).
    var b = buscar(g, /^IMPUESTOS DE EXPENSAS/);
    if (b) {
      var hdr = g[b.r], ci = {};
      hdr.forEach(function (c, i) { var n = normalizar(c && c.v); if (/^SUPERF/.test(n)) ci.coef = i; else if (/^RENTAS/.test(n)) ci.rentas = i; else if (/^MUNICIPALIDAD/.test(n)) ci.muni = i; });
      var unidades = [], refRentas = "", refMuni = "", totalFila = null, totalRef = null;
      for (var r = b.r + 1; r < g.length; r++) {
        var et = texto(g[r][b.c]);
        if (/^TOTAL/.test(normalizar(et))) { totalRef = g[r]; break; }
        if (!et) continue;
        var cR = g[r][ci.rentas], cM = g[r][ci.muni], cT = g[r][b.c + 1];
        // Las fórmulas (=H6*C8) dicen en qué celda se carga el total de rentas y de municipalidad.
        var mR = cR && /^\$?([A-Z]+)\$?(\d+)\*/i.exec(cR.f || ""), mM = cM && /^\$?([A-Z]+)\$?(\d+)\*/i.exec(cM.f || "");
        if (mR && !refRentas) refRentas = mR[1] + mR[2];
        if (mM && !refMuni) refMuni = mM[1] + mM[2];
        unidades.push({ unidad: et, clave: claveUnidad(et), coeficiente: numero(g[r][ci.coef]), rentas: numero(cR), municipalidad: numero(cM), total: numero(cT) });
      }
      if (totalRef) totalFila = numero(totalRef[b.c + 1]);
      var celdaValor = function (ref) {
        if (!ref) return null;
        var m = /^([A-Z]+)(\d+)$/.exec(ref), col = 0;
        for (var i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64);
        return numero(g[+m[2] - 1] && g[+m[2] - 1][col - 1]);
      };
      // Etiquetas al lado de esas celdas ("RENTAS", "MUNI").
      exp.impuestos = {
        titulo: limpio(hdr[b.c].v), nota: nota(hdr[b.c]), unidades: unidades, total: totalFila,
        rentasTotal: celdaValor(refRentas), rentasCelda: refRentas, muniTotal: celdaValor(refMuni), muniCelda: refMuni
      };
    }
    out.expensas = exp;

    // Liquidación: desde "TOTAL DPTOS ADMINISTRADOS EN EFECTIVO" hasta "TOTAL COBRADO".
    var ini = buscar(g, /^TOTAL DPTOS/), fin = buscar(g, /^TOTAL COBRADO/);
    out.liquidacion = [];
    if (ini) {
      var hasta = fin ? fin.r : g.length - 1, enDescuentos = false;
      for (var r2 = ini.r; r2 <= hasta; r2++) {
        var etq = texto(g[r2][0]);
        if (!etq) continue;
        var valor = null, formula = "";
        for (var c2 = 1; c2 < g[r2].length; c2++) { var n2 = numero(g[r2][c2]); if (n2 !== null) { valor = n2; formula = g[r2][c2].f || ""; break; } }
        var N = normalizar(etq), tipo;
        if (r2 === ini.r) { tipo = "base"; enDescuentos = true; }
        else if (/^TOTAL/.test(N)) { tipo = "total"; enDescuentos = false; }
        else tipo = enDescuentos ? "descuento" : "ingreso";
        out.liquidacion.push({ concepto: etq, monto: valor, tipo: tipo, formula: formula });
      }
    }
    var rec = buscar(g, /^RECIBI/), fir = buscar(g, /^FIRMA/);
    out.recibo = rec ? limpio(g[rec.r][rec.c].v) : "";
    out.firma = fir ? limpio(g[fir.r][fir.c].v) : "";
  }

  function leerEfectivo(g, out) {
    var h = buscar(g, /^UNIDADES$/);
    out.unidades = []; out.referencias = []; out.novedades = []; out.cocheras = []; out.cocherasTotal = null; out.totalesPlanilla = {};
    if (!h) return;
    var col = {};
    g[h.r].forEach(function (c, i) {
      var n = normalizar(c && c.v);
      if (/^UNIDADES/.test(n)) col.unidad = i;
      else if (/^MES/.test(n)) col.mes = i;
      else if (/^TRANSFERENCIA/.test(n)) col.transferencia = i;
      else if (/^MONTO/.test(n)) col.efectivo = i;
      else if (/^PUNITORIOS/.test(n)) col.punitorios = i;
      else if (/^MUNI/.test(n)) col.muniRentas = i;
      else if (/^COCHERA/.test(n)) col.cochera = i;
      else if (/^ADM/.test(n)) col.adm = i;
      else if (/^ARREGLOS/.test(n)) col.arreglos = i;
      else if (/^TOTAL/.test(n)) col.total = i;
    });
    var r = h.r + 1;
    var NUM = ["transferencia", "efectivo", "punitorios", "muniRentas", "cochera", "adm", "arreglos", "total"];
    for (; r < g.length; r++) {
      var c0 = g[r][col.unidad], et = texto(c0);
      if (/^TOTAL/.test(normalizar(et))) {
        NUM.forEach(function (k) { if (col[k] !== undefined) out.totalesPlanilla[k] = numero(g[r][col[k]]); });
        r++;
        break;
      }
      if (!et) continue;
      var ui = unidadEInquilino(et), cMes = g[r][col.mes], u = { unidad: ui.unidad, inquilino: ui.inquilino, clave: claveUnidad(ui.unidad), color: c0.color || "" };
      if (cMes && cMes.fecha) { var md = mesDeFecha(cMes.fecha); u.forma = "Efectivo"; u.mes = md.iso; u.mesTexto = md.texto; }
      else if (/TRANSFIERE/.test(normalizar(cMes && cMes.v))) u.forma = "Transfiere";
      else u.forma = texto(cMes);
      NUM.forEach(function (k) {
        if (col[k] === undefined) return;
        var cc = g[r][col[k]];
        u[k] = numero(cc);
        if (cc && cc.f) u[k + "Formula"] = cc.f;
      });
      u.estado = estadoPorColor(u.color) || (u.forma === "Transfiere" ? "transfiere" : u.forma === "Efectivo" ? "efectivo" : "");
      out.unidades.push(u);
    }
    // Referencias de colores, novedades y cocheras (debajo del total).
    var nov = buscar(g, /^NOVEDADES/, r), cochHdr = buscar(g, /^INQUILINO$/, r);
    var finRef = nov ? nov.r : (cochHdr ? cochHdr.r : g.length);
    for (var r3 = r; r3 < finRef; r3++) {
      var cr = g[r3][0], tr = texto(cr);
      if (tr) out.referencias.push({ texto: tr, color: (cr && cr.color) || "", estado: estadoPorColor(cr && cr.color) || (/TRANSFIEREN/.test(normalizar(tr)) ? "transfiere" : "") });
    }
    if (nov) {
      var finNov = cochHdr ? cochHdr.r : g.length;
      // Texto en la misma celda después de "Novedades:" y en las filas siguientes.
      var resto = limpio(String(g[nov.r][nov.c].v).replace(/^\s*novedades\s*:?/i, ""));
      if (resto) out.novedades.push(resto);
      for (var r4 = nov.r; r4 < finNov; r4++) g[r4].forEach(function (c, i) { if ((r4 > nov.r || i > nov.c) && !vacia(c)) out.novedades.push(limpio(c.fecha ? mesDeFecha(c.fecha).texto : c.v)); });
    }
    if (cochHdr) {
      var hc = g[cochHdr.r], ic = {};
      hc.forEach(function (c, i) { var n = normalizar(c && c.v); if (/^INQUILINO/.test(n)) ic.inq = i; else if (/^PATENTE/.test(n)) ic.veh = i; else if (/^MONTO/.test(n)) ic.monto = i; });
      for (var r5 = cochHdr.r + 1; r5 < g.length; r5++) {
        var inq = texto(g[r5][ic.inq]), veh = texto(g[r5][ic.veh]), monto = numero(g[r5][ic.monto]);
        if (!inq && !veh && monto === null) continue;
        if (!inq && !veh) { out.cocherasTotal = monto; continue; }
        var mu = /^(LOCAL\s*[A-Z]|PB\s*[A-Z]|\d\s*[°º]\s*[A-Z])/i.exec(inq);
        out.cocheras.push({ inquilino: inq, vehiculo: veh, monto: monto, clave: mu ? claveUnidad(mu[1]) : "" });
      }
    }
  }

  function leerTransferencias(g, out) {
    var h = buscar(g, /^UNIDADES$/);
    var t = buscar(g, /\S/);
    out.planillaTransferencias = { titulo: t ? limpio(g[t.r][t.c].v) : "TRANSFERENCIAS", columnas: [], filas: [], total: null };
    if (!h) return;
    var cols = [];
    g[h.r].forEach(function (c, i) { if (i > h.c && !vacia(c)) cols.push({ i: i, titulo: limpio(c.v) }); });
    out.planillaTransferencias.columnas = cols.map(function (c) { return c.titulo; });
    for (var r = h.r + 1; r < g.length; r++) {
      var et = texto(g[r][h.c]);
      if (!et) continue;
      if (/^TOTAL/.test(normalizar(et))) {
        for (var k = cols.length - 1; k >= 0; k--) { var n = numero(g[r][cols[k].i]); if (n !== null) { out.planillaTransferencias.total = n; break; } }
        break;
      }
      out.planillaTransferencias.filas.push({
        unidad: et, clave: claveUnidad(et),
        valores: cols.map(function (c) { var x = g[r][c.i]; return x ? (x.fecha ? mesDeFecha(x.fecha).texto : x.v) : null; })
      });
    }
  }

  function hoja(XLSX, wb, re) {
    var n = wb.SheetNames.find(function (s) { return re.test(normalizar(s)); });
    return n ? grilla(XLSX, wb.Sheets[n]) : null;
  }

  function leer(XLSX, wb, archivo) {
    var out = { version: 1, archivo: archivo || "", hojas: wb.SheetNames.slice() };
    var res = hoja(XLSX, wb, /^RESUMEN/), efe = hoja(XLSX, wb, /^EFECTIVO/), tra = hoja(XLSX, wb, /^TRANSFERENCIA/);
    if (!res || !efe) throw new Error("La planilla no tiene las hojas RESUMEN TOTAL y EFECTIVO.");
    leerResumen(res, out);
    leerEfectivo(efe, out);
    if (tra) leerTransferencias(tra, out);
    // Coeficiente de expensas de cada unidad (de RESUMEN TOTAL) y si es amoblada (referencias).
    var coef = {};
    ((out.expensas.impuestos || {}).unidades || []).forEach(function (x) { coef[x.clave] = x.coeficiente; });
    out.unidades.forEach(function (u) {
      if (coef[u.clave] !== undefined) u.coeficiente = coef[u.clave];
      out.referencias.forEach(function (ref) {
        if (ref.estado !== "amoblado") return;
        var m = /([0-9]\s*[°º]\s*[A-Z]|PB\s*[A-Z]|LOCAL\s*[A-Z])\s*$/i.exec(ref.texto);
        if (m && claveUnidad(m[1]) === u.clave) u.amoblado = true;
      });
    });
    if (!out.unidades.length) throw new Error("No se encontraron unidades en la hoja EFECTIVO.");
    return out;
  }

  var api = { leer: leer, claveUnidad: claveUnidad };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.LectorPropiedades = api;
})(this);
