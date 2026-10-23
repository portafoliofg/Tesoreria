/*
 * Modo Fórmula 1 · tablero de la tesorería para una pantalla de la oficina.
 * Los datos los da el servidor (tableroF1, en TableroF1.gs) con la sesión de
 * bgpsammar.com; nada queda en la página. Se actualiza solo cada 5 minutos.
 *
 * Torre de tiempos = saldos de cada cuenta y FCI ordenados (la flecha es contra ayer).
 * Total en pista = cuentas + FCI en pesos. Sectores = cuentas, FCI y dólares.
 * Paradas en boxes = lo que vence en los próximos 7 días. Banderas = avisos.
 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var REFRESCO_MS = 5 * 60 * 1000;
  var ROTACION_MS = 20000;
  var MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

  function irAlIngreso() { location.replace("index.html?v=7#elegir"); }
  if (!BGPSesion.usuario()) { irAlIngreso(); return; }
  document.body.classList.remove("verificando");

  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined && txt !== null) n.textContent = txt; return n; }
  var fmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
  function pesos(n) { return (n < 0 ? "-$ " : "$ ") + fmt.format(Math.abs(n || 0)); }
  function dolares(n) { return (n < 0 ? "-US$ " : "US$ ") + fmt.format(Math.abs(n || 0)); }
  function corto(n) {
    var v = Math.abs(n || 0), s = n < 0 ? "-" : "+";
    if (v >= 1e6) return s + (v / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "M";
    if (v >= 1e3) return s + Math.round(v / 1e3) + "k";
    return s + Math.round(v);
  }
  var quieto = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Número que corre hasta su valor, como un cronómetro. */
  function contar(nodo, hasta, formato) {
    var desde = typeof nodo._valor === "number" ? nodo._valor : 0;
    nodo._valor = hasta;
    if (quieto || desde === hasta) { nodo.textContent = formato(hasta); return; }
    var t0 = performance.now(), dur = 1400;
    (function paso(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      nodo.textContent = formato(desde + (hasta - desde) * e);
      if (k < 1) requestAnimationFrame(paso);
    })(t0);
  }

  // ----- Reloj -----
  function reloj() {
    var d = new Date();
    $("reloj").textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (x) { return ("0" + x).slice(-2); }).join(":");
  }
  reloj(); setInterval(reloj, 1000);

  $("pantalla").addEventListener("click", function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
  });

  // ----- Largada: cinco luces rojas que se apagan -----
  function largada() {
    return new Promise(function (listo) {
      var caja = $("largada"), luces = caja.querySelectorAll(".luz");
      if (quieto) { caja.classList.add("fuera"); listo(); return; }
      var i = 0;
      var t = setInterval(function () {
        if (i < luces.length) { luces[i].classList.add("on"); i++; return; }
        clearInterval(t);
        setTimeout(function () {
          luces.forEach(function (l) { l.classList.remove("on"); });
          $("largadaTexto").textContent = "¡Largamos!";
          setTimeout(function () { caja.classList.add("fuera"); listo(); }, 700);
        }, 500 + Math.random() * 700);
      }, 650);
    });
  }

  // ----- Datos -----
  var proximo = 0;
  function cargar() {
    return BGPSesion.pedir("tableroF1").then(pintar).catch(function (err) {
      if (err && err.sesion === false) { irAlIngreso(); return; }
      $("torre").replaceChildren(el("div", "error", (err && err.message) || "No se pudo cargar el tablero."));
    }).then(function () { proximo = Date.now() + REFRESCO_MS; });
  }
  setInterval(function () {
    var s = Math.max(0, Math.round((proximo - Date.now()) / 1000));
    $("proxima").textContent = proximo ? "ACTUALIZA EN " + Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2) : "—";
    if (proximo && Date.now() >= proximo) { proximo = 0; cargar(); }
  }, 1000);

  function pintar(r) {
    var p = r.hoy.split("-");
    var dias = new Date(+p[0], +p[1], 0).getDate();
    $("vuelta").replaceChildren(document.createTextNode("VUELTA "), el("b", null, String(+p[2])), document.createTextNode("/" + dias + " · " + MESES[+p[1] - 1]));

    // Torre de tiempos
    var torre = $("torre");
    torre.replaceChildren();
    var lider = null, pos = 0, grupoUsd = false;
    (r.pilotos || []).forEach(function (x, i) {
      if (x.moneda === "USD" && !grupoUsd) { grupoUsd = true; torre.append(el("div", "grupo", "Dólares")); pos = 0; lider = null; }
      pos++;
      if (!lider) lider = x;
      var fila = el("div", "piloto");
      fila.style.animationDelay = (i * 0.05) + "s";
      var eq = el("i", "equipo"); eq.style.background = x.color || (x.fci ? "#b14cff" : "#3ea6ff");
      var nom = el("div", "nom", x.nombre);
      nom.append(el("small", null, "al " + x.fecha));
      var t = el("div", "t", (x.moneda === "USD" ? dolares : pesos)(x.saldo));
      var sub = el("small");
      if (x === lider) sub.textContent = "LÍDER";
      else sub.textContent = corto(x.saldo - lider.saldo);
      if (typeof x.antes === "number" && Math.abs(x.saldo - x.antes) >= 1) {
        var f = el("span", x.saldo >= x.antes ? "sube" : "baja", (x.saldo >= x.antes ? " ▲" : " ▼") + corto(x.saldo - x.antes).replace(/^[+-]/, ""));
        sub.append(f);
      }
      t.append(sub);
      fila.append(el("div", "pos", "P" + pos), eq, nom, t);
      torre.append(fila);
    });
    if (!(r.pilotos || []).length) torre.append(el("div", "vacio", "Todavía no hay saldos cargados."));

    // Total y sectores
    var c = r.caja;
    contar($("total"), c.total, pesos);
    var dl = $("delta");
    dl.className = "delta " + (c.diferencia > 0 ? "sube" : c.diferencia < 0 ? "baja" : "igual");
    dl.textContent = Math.abs(c.diferencia) >= 1 ? (c.diferencia > 0 ? "▲ " : "▼ ") + pesos(Math.abs(c.diferencia)) + " vs ayer" : "Sin cambios vs ayer";
    contar($("s1"), c.cuentas, pesos);
    contar($("s2"), c.fci, pesos);
    contar($("s3"), c.usd, dolares);
    $("s1b").textContent = c.total ? Math.round(c.cuentas / c.total * 100) + " % del total" : "";
    $("s2b").textContent = c.total ? Math.round(c.fci / c.total * 100) + " % del total" : "";
    $("s3b").textContent = "Cuentas y FCI en dólares";

    // Ritmo del mes
    var m = r.mes, mes = $("mes");
    mes.replaceChildren();
    var di = el("div", "dato-mes"); di.append(el("small", null, "Entró en el mes"), el("b", null, pesos(m.ingresos))); di.querySelector("b").style.color = "var(--verde)";
    var de = el("div", "dato-mes"); de.append(el("small", null, "Salió en el mes"), el("b", null, pesos(Math.abs(m.egresos)))); de.querySelector("b").style.color = "var(--rojo)";
    var tot = m.ingresos + Math.abs(m.egresos);
    var barra = el("div", "barra-mes");
    var bi = el("i"); bi.style.background = "var(--verde)"; bi.style.width = (tot ? m.ingresos / tot * 100 : 50) + "%";
    var be = el("i"); be.style.background = "var(--rojo)"; be.style.width = (tot ? Math.abs(m.egresos) / tot * 100 : 50) + "%";
    barra.append(bi, be);
    var neto = el("div", "dato-mes"); neto.append(el("small", null, "Resultado del mes"), el("b", null, pesos(m.ingresos + m.egresos)));
    var mov = el("div", "dato-mes"); mov.append(el("small", null, "Movimientos"), el("b", null, fmt.format(m.movimientos)));
    mes.append(di, de, barra, neto, mov);

    // Propiedades
    var props = $("props");
    props.replaceChildren();
    (r.propiedades || []).forEach(function (x) {
      var b = el("div", "prop");
      b.append(el("b", null, x.edificio), el("div", "m", pesos(x.cobrado)));
      var oc = el("div", "ocup"), i = el("i");
      i.style.width = (x.unidades ? (x.unidades - x.desocupadas) / x.unidades * 100 : 0) + "%";
      oc.append(i);
      b.append(oc, el("span", null, x.periodo + " · " + (x.unidades - x.desocupadas) + "/" + x.unidades + " ocupadas"));
      if (x.noAbono) { b.append(document.createTextNode(" · ")); b.append(el("span", "rojo", x.noAbono + " no abonó")); }
      props.append(b);
    });
    if (!(r.propiedades || []).length) props.append(el("div", "vacio", "No hay liquidaciones de propiedades."));

    // Boxes
    var boxes = $("boxes");
    boxes.replaceChildren();
    (r.boxes || []).forEach(function (x, i) {
      var f = el("div", "parada" + (x.vencido ? " vencido" : ""));
      f.style.animationDelay = (i * 0.05) + "s";
      var d = String(x.fecha || "").split("/");
      var dia = el("div", "dia"); dia.append(el("b", null, d[0] || "—"), el("small", null, x.vencido ? "Vencido" : MESES[+d[1] - 1] || ""));
      var det = el("div", "det", x.detalle || x.tipo); det.append(el("small", null, x.tipo));
      f.append(dia, det, el("div", "imp" + (x.importe > 0 ? " cobra" : ""), (x.moneda === "USD" ? dolares : pesos)(x.importe)));
      boxes.append(f);
    });
    if (!(r.boxes || []).length) boxes.append(el("div", "vacio", "Pista libre: nada vence en los próximos 7 días."));

    // Banderas
    var cinta = $("cinta");
    cinta.replaceChildren();
    var items = (r.banderas || []).slice();
    (r.propiedades || []).forEach(function (x) { if (x.noAbono) items.push({ tipo: "roja", texto: x.edificio + ": " + x.noAbono + " unidad(es) no abonaron " + x.periodo }); });
    if (!items.length) items.push({ tipo: "verde", texto: "Bandera verde: todo en orden en la pista." });
    var COLOR = { amarilla: "#ffd100", roja: "#e10600", azul: "#3ea6ff", verde: "#20d36b" };
    items.forEach(function (b) {
      var s = el("span");
      var ic = el("i", "bandera-ic"); ic.style.background = COLOR[b.tipo] || "#fff";
      s.append(ic, document.createTextNode(b.texto));
      cinta.append(s);
    });
    cinta.style.animationDuration = Math.max(25, items.length * 12) + "s";
  }

  // ----- Panel central rotativo: ritmo del mes ↔ propiedades -----
  var cual = 0;
  setInterval(function () {
    cual = 1 - cual;
    $("panelMes").classList.toggle("oculta", cual === 1);
    $("panelProps").classList.toggle("oculta", cual === 0);
  }, ROTACION_MS);

  Promise.all([largada(), cargar()]);
})();
