/*
 * Mapa de propiedades · vista satelital 3D (estilo Google Earth) de cada lugar de
 * las liquidaciones de alquileres.
 *
 * Las ubicaciones las da el servidor (ubicacionesPropiedades, en PropiedadesMapa.gs):
 * viven solo en la planilla de Google, nunca en esta página ni en el repositorio,
 * que son públicos. Desde acá se corrigen escribiendo la dirección o arrastrando el pin.
 *
 * Mapa: MapLibre GL con imágenes satelitales de Esri, nombres de calles y edificios
 * en 3D de OpenStreetMap (OpenFreeMap). Sin claves ni costo.
 * Al elegir un lugar: vuela hasta ahí inclinado y gira despacio alrededor, y el panel
 * muestra la entrada en Street View y la liquidación resumida (con selector de período).
 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
  var ESTILO_MAPA = "https://tiles.openfreemap.org/styles/liberty";
  var CENTRO_INICIAL = [-64.19, -31.42];  // Córdoba, mientras no haya ubicaciones
  var VUELTA_SEG = 120;                    // segundos por vuelta completa al girar

  // ----- Sesión -----
  function irAlIngreso() { location.replace("index.html?v=7#elegir"); }
  var guardado = BGPSesion.usuario();
  if (!guardado) { irAlIngreso(); return; }
  $("quien").textContent = guardado.nombre || guardado.usuario || "";
  document.body.classList.remove("verificando");
  BGPSesion.consultar().then(function (u) { if (!u) irAlIngreso(); }, function () {});

  // ----- Ayudas -----
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined && txt !== null) n.textContent = txt; return n; }
  var fmtPesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  function nombreDe(l) { return l.lugar || l.edificio; }
  function ubicado(l) { return typeof l.lat === "number" && typeof l.lon === "number"; }
  function colorDe(l) {
    var e = l.estados || {};
    if (e["no-abono"]) return "#c0392b";
    if (l.unidades && (e.desocupado || 0) >= l.unidades) return "#8a8f87";
    return "#2f8f4e";
  }
  function chipsDe(l) {
    var c = el("div", "chips");
    c.append(el("span", "chip", l.unidades + (l.unidades === 1 ? " unidad" : " unidades")));
    var e = l.estados || {};
    if (e["no-abono"]) c.append(el("span", "chip rojo", e["no-abono"] + " no abonó"));
    if (e.desocupado) c.append(el("span", "chip gris", e.desocupado + " desocupada" + (e.desocupado === 1 ? "" : "s")));
    if (l.precision === "aproximada") c.append(el("span", "chip oro", "ubicación aproximada"));
    if (!ubicado(l)) c.append(el("span", "chip oro", "sin ubicar"));
    return c;
  }

  // ----- Mapa -----
  function estiloSatelite() {
    return {
      version: 8,
      sources: {
        satelite: { type: "raster", tiles: [ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19,
          attribution: "Imágenes © Esri, Maxar, Earthstar Geographics" },
        calles: { type: "raster", tiles: [ESRI + "Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19 },
        nombres: { type: "raster", tiles: [ESRI + "Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19 },
        osm: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: "© OpenStreetMap" }
      },
      layers: [
        { id: "satelite", type: "raster", source: "satelite" },
        { id: "calles", type: "raster", source: "calles", paint: { "raster-opacity": 0.85 } },
        { id: "nombres", type: "raster", source: "nombres" },
        { id: "edificios-3d", type: "fill-extrusion", source: "osm", "source-layer": "building", minzoom: 15,
          paint: {
            "fill-extrusion-color": "#efe9dd",
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
            "fill-extrusion-opacity": 0.55
          } }
      ]
    };
  }

  var mapa = new maplibregl.Map({
    container: "mapa", style: estiloSatelite(), center: CENTRO_INICIAL, zoom: 11, pitch: 45, bearing: -15,
    maxPitch: 75, attributionControl: { compact: true }
  });
  mapa.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  mapa.addControl(new maplibregl.FullscreenControl(), "bottom-right");

  document.querySelectorAll(".capas button").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".capas button").forEach(function (x) { x.classList.toggle("activa", x === b); });
      mapa.setStyle(b.dataset.capa === "mapa" ? ESTILO_MAPA : estiloSatelite());
    });
  });

  // ----- Giro alrededor del lugar elegido -----
  var girar = true, girando = false, ultimoCuadro = 0;
  function cuadro(t) {
    if (!girando) return;
    if (ultimoCuadro) mapa.setBearing(mapa.getBearing() + (t - ultimoCuadro) / 1000 * 360 / VUELTA_SEG);
    ultimoCuadro = t;
    requestAnimationFrame(cuadro);
  }
  function empezarGiro() {
    if (!girar || girando || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    girando = true; ultimoCuadro = 0; requestAnimationFrame(cuadro);
  }
  function pararGiro() { girando = false; }
  // Cualquier toque del usuario sobre el mapa corta el giro y el recorrido.
  ["mousedown", "touchstart", "wheel"].forEach(function (ev) {
    mapa.getCanvas().addEventListener(ev, function () { pararGiro(); pararRecorrido(); }, { passive: true });
  });
  $("girar").addEventListener("click", function () {
    girar = !girar;
    $("girar").setAttribute("aria-pressed", String(girar));
    $("girar").classList.toggle("activo", girar);
    if (girar && seleccionado) empezarGiro(); else pararGiro();
  });
  $("girar").classList.add("activo");

  // ----- Datos -----
  var lugares = [], pines = {}, seleccionado = null, arrastrando = null;

  function cargar(intento) {
    return BGPSesion.pedir("ubicacionesPropiedades").then(function (r) {
      lugares = r.lugares || [];
      pintarLista();
      pintarPines();
      if (intento === 0) verTodo(false);
      // La búsqueda automática va de a unas pocas: se repite hasta ubicar todo lo posible.
      if (r.pendientes && intento < 6) { $("resumen").textContent = "Ubicando propiedades… faltan " + r.pendientes + "."; return cargar(intento + 1); }
    }).catch(function (err) {
      if (err && err.sesion === false) { irAlIngreso(); return; }
      $("lista").replaceChildren(el("div", "error", err.message || "No se pudieron cargar las ubicaciones."));
      $("resumen").textContent = "";
    });
  }

  function pintarLista() {
    var lista = $("lista");
    lista.replaceChildren();
    var ubicados = lugares.filter(ubicado).length;
    $("resumen").textContent = lugares.length
      ? lugares.length + (lugares.length === 1 ? " lugar" : " lugares") + " · " + ubicados + " en el mapa" + (ubicados < lugares.length ? " · tocá los que faltan para ubicarlos" : "")
      : "";
    if (!lugares.length) { lista.append(el("div", "vacio", "No hay liquidaciones de propiedades cargadas. Importalas en Propiedades.")); return; }
    lugares.forEach(function (l) {
      var b = el("button", "lugar" + (seleccionado === l ? " sel" : ""));
      b.type = "button";
      b.setAttribute("role", "listitem");
      var t = el("b");
      var p = el("span", "punto"); p.style.background = colorDe(l);
      t.append(p, document.createTextNode(nombreDe(l)));
      b.append(t, el("span", "sub", (l.lugar ? l.edificio + " · " : "") + (l.direccion || "Sin dirección")), chipsDe(l));
      b.addEventListener("click", function () { elegir(l, true); });
      lista.append(b);
    });
  }

  function pintarPines() {
    Object.keys(pines).forEach(function (k) { pines[k].remove(); });
    pines = {};
    lugares.filter(ubicado).forEach(function (l) {
      var n = el("div", "pin" + (seleccionado === l ? " sel" : ""));
      var base = el("span", "base"); base.style.background = colorDe(l);
      n.append(el("span", "etq", nombreDe(l)), el("span", "palo"), base);
      n.title = nombreDe(l) + " · " + (l.direccion || "");
      n.addEventListener("click", function (e) { e.stopPropagation(); elegir(l, true); });
      var m = new maplibregl.Marker({ element: n, anchor: "bottom" }).setLngLat([l.lon, l.lat]).addTo(mapa);
      m.on("dragend", function () { mostrarFicha(l, true); });
      pines[l.clave] = m;
    });
  }

  function verTodo(animar) {
    pararGiro();
    var u = lugares.filter(ubicado);
    if (!u.length) return;
    if (u.length === 1) { mapa.flyTo({ center: [u[0].lon, u[0].lat], zoom: 16, pitch: 55, duration: animar ? 2000 : 0 }); return; }
    var b = new maplibregl.LngLatBounds();
    u.forEach(function (l) { b.extend([l.lon, l.lat]); });
    mapa.fitBounds(b, { padding: 90, pitch: 45, bearing: -15, maxZoom: 16, duration: animar ? 2000 : 0 });
  }
  $("verTodo").addEventListener("click", function () { pararRecorrido(); seleccionado = null; cerrarFicha(); pintarLista(); marcarPines(); verTodo(true); });

  function marcarPines() {
    Object.keys(pines).forEach(function (k) { pines[k].getElement().classList.toggle("sel", !!seleccionado && seleccionado.clave === k); });
  }

  function elegir(l, volar) {
    seleccionado = l;
    terminarArrastre();
    pintarLista();
    marcarPines();
    mostrarFicha(l, false);
    if (!ubicado(l) || !volar) { pararGiro(); return; }
    pararGiro();
    mapa.flyTo({ center: [l.lon, l.lat], zoom: 17.6, pitch: 62, bearing: mapa.getBearing() + 40, speed: 0.9, curve: 1.5, essential: true });
    mapa.once("moveend", function () { if (seleccionado === l) empezarGiro(); });
  }

  // ----- Ficha: Street View de la entrada + liquidación resumida -----
  var periodoElegido = {};   // clave del lugar → orden del período que se está mirando

  /**
   * Street View sin clave: con el panorama del enlace pegado, la vista exacta (la misma
   * que da "Compartir → Insertar un mapa" de Google Maps); si no, la vista más cercana
   * a la casa, mirando hacia el rumbo guardado.
   */
  function urlCalle(l, rumbo) {
    var h = Math.round(((rumbo % 360) + 360) % 360), p = l.inclinacion || 0;
    if (l.panorama) {
      return "https://www.google.com/maps/embed?pb=!4v0!6m8!1m7!1s" + encodeURIComponent(l.panorama) + "!2m2!1d" + l.lat + "!2d" + l.lon +
        "!3f" + h + "!4f" + p + "!5f0.7820865974627469";
    }
    return "https://maps.google.com/maps?layer=c&cbll=" + l.lat + "," + l.lon + "&cbp=11," + h + ",0,0," + (-p) + "&source=embed&output=svembed";
  }
  function urlStreetView(l, rumbo) {
    return "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" + l.lat + "," + l.lon + "&heading=" + Math.round(rumbo) + "&pitch=" + (l.inclinacion || 0) +
      (l.panorama ? "&pano=" + encodeURIComponent(l.panorama) : "");
  }

  function num(n) { return typeof n === "number" && !isNaN(n) ? n : 0; }
  function sumar(lista, k) { return lista.reduce(function (a, x) { return a + num(x[k]); }, 0); }
  function etiquetaEstado(u) {
    var t = u.estado === "no-abono" ? "No abonó" : u.estado === "desocupado" ? "Desocupada" : u.estado === "amoblado" ? "Amoblado" : (u.forma || u.estado || "—");
    return t.charAt(0).toUpperCase() + t.substring(1);
  }

  function mostrarFicha(l, conPinMovido) {
    var f = $("ficha");
    f.replaceChildren();
    f.hidden = false;
    document.querySelector(".cuerpo").classList.add("con-ficha");
    var cerrar = el("button", "cerrar", "×");
    cerrar.type = "button"; cerrar.setAttribute("aria-label", "Cerrar");
    cerrar.addEventListener("click", cerrarFicha);
    f.append(cerrar, el("h2", null, nombreDe(l)), el("div", "dir", (l.lugar ? l.edificio + " · " : "") + (l.direccion || "Sin dirección cargada")));
    if (ubicado(l)) f.append(seccionCalle(l));
    else f.append(el("div", "aviso-ficha", "Todavía no está en el mapa: escribí su dirección (calle, número y ciudad) para ver la entrada y ubicarlo."));
    f.append(seccionLiquidacion(l));
    f.append(seccionUbicacion(l, conPinMovido));
  }

  function seccionCalle(l) {
    var box = el("section", "bloque calle");
    var rumbo = l.rumbo == null ? 0 : l.rumbo;
    var marco = el("div", "marco-calle");
    var ifr = el("iframe");
    ifr.title = "Street View de " + nombreDe(l);
    ifr.loading = "lazy";
    ifr.referrerPolicy = "no-referrer-when-downgrade";
    ifr.allowFullscreen = true;
    ifr.src = urlCalle(l, rumbo);
    marco.append(ifr);
    box.append(marco);
    var bs = el("div", "botones barra-calle");
    var izq = el("button", "boton secundario chico", "◀"), der = el("button", "boton secundario chico", "▶");
    izq.type = der.type = "button";
    izq.title = "Girar a la izquierda"; der.title = "Girar a la derecha";
    var guardar = el("button", "boton chico", "Guardar esta vista");
    guardar.type = "button"; guardar.hidden = true;
    var girarA = function (delta) {
      rumbo = (rumbo + delta + 360) % 360;
      ifr.src = urlCalle(l, rumbo);
      abrir.href = urlStreetView(l, rumbo);
      guardar.hidden = false;
    };
    izq.addEventListener("click", function () { girarA(-30); });
    der.addEventListener("click", function () { girarA(30); });
    var abrir = el("a", "boton secundario chico", "Abrir en Google Maps");
    abrir.href = urlStreetView(l, rumbo); abrir.target = "_blank"; abrir.rel = "noopener";
    var ajustar = el("button", "boton secundario chico", l.panorama ? "Cambiar la vista" : "Fijar la entrada");
    ajustar.type = "button";
    bs.append(izq, der, guardar, abrir, ajustar);
    box.append(bs);
    var nota = el("div", "nota");
    var panel = el("div", "corregir");
    panel.hidden = true;
    var inp = el("input");
    inp.type = "url"; inp.placeholder = "Pegá acá el enlace de Street View";
    inp.setAttribute("aria-label", "Enlace de Street View");
    var usar = el("button", "boton chico", "Usar este enlace");
    usar.type = "button";
    panel.append(el("div", "nota", "En Google Maps abrí Street View frente a la entrada, girá hasta que se vea la puerta, tocá Compartir → Copiar vínculo y pegalo acá. Queda guardada para todos."), inp, usar);
    box.append(nota, panel);
    ajustar.addEventListener("click", function () { panel.hidden = !panel.hidden; if (!panel.hidden) inp.focus(); });
    var enviar = function (datos, boton) {
      boton.disabled = true;
      nota.textContent = "Guardando…";
      BGPSesion.pedir("guardarVistaCalle", Object.assign({ clave: l.clave }, datos)).then(function (r) {
        l.rumbo = r.rumbo; l.inclinacion = r.inclinacion; l.panorama = r.panorama;
        mostrarFicha(l, false);
      }).catch(function (err) { boton.disabled = false; nota.textContent = err.message || "No se pudo guardar."; });
    };
    guardar.addEventListener("click", function () { enviar({ rumbo: rumbo, inclinacion: l.inclinacion || 0, panorama: l.panorama || "" }, guardar); });
    usar.addEventListener("click", function () { if (inp.value.trim()) enviar({ enlace: inp.value.trim() }, usar); else inp.focus(); });
    inp.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); usar.click(); } });
    if (l.rumbo == null && !l.panorama) nota.textContent = "Girá con ◀ ▶ hasta ver la entrada y tocá “Guardar esta vista”, o pegá el enlace exacto con “Fijar la entrada”.";
    return box;
  }

  function seccionLiquidacion(l) {
    var box = el("section", "bloque");
    var hist = l.historial || [];
    var cab = el("div", "bloque-cab");
    cab.append(el("h3", null, "Liquidación"));
    if (!hist.length) { box.append(cab, el("div", "nota", "No hay liquidaciones cargadas.")); return box; }
    var sel = el("select");
    sel.setAttribute("aria-label", "Período");
    hist.forEach(function (h) { var o = el("option", null, h.periodo); o.value = h.orden; sel.append(o); });
    var elegido = periodoElegido[l.clave] || hist[0].orden;
    sel.value = elegido;
    sel.addEventListener("change", function () { periodoElegido[l.clave] = sel.value; var nuevo = seccionLiquidacion(l); box.replaceWith(nuevo); });
    cab.append(sel);
    box.append(cab);
    var i = Math.max(0, hist.findIndex(function (h) { return h.orden === elegido; }));
    var h = hist[i], prev = hist[i + 1] || null;
    var us = h.unidades || [];
    var total = sumar(us, "total"), transf = sumar(us, "transferencia"), efvo = sumar(us, "efectivo");
    var noAbono = us.filter(function (u) { return u.estado === "no-abono"; });
    var desoc = us.filter(function (u) { return u.estado === "desocupado"; });
    var ocupadas = us.length - desoc.length;
    var totalPrev = prev ? sumar(prev.unidades || [], "total") : null;

    var datos = el("div", "datos");
    var dato = function (t, v, sub, cls) { var d = el("div", "dato" + (cls ? " " + cls : "")); d.append(el("small", null, t), el("b", null, v)); if (sub) d.append(el("span", null, sub)); return d; };
    var variacion = totalPrev ? (total - totalPrev) / Math.abs(totalPrev) : null;
    datos.append(
      dato("Cobrado " + (l.varios ? "en " + nombreDe(l) : "del mes"), fmtPesos.format(total),
        variacion === null ? "" : (variacion >= 0 ? "▲ " : "▼ ") + Math.abs(variacion * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + " % vs " + prev.periodo, variacion !== null && variacion < 0 ? "baja" : ""),
      dato("Ocupación", ocupadas + " de " + us.length, desoc.length ? desoc.length + " desocupada" + (desoc.length === 1 ? "" : "s") : "Todo ocupado"),
      dato("Transferencias", fmtPesos.format(transf), us.filter(function (u) { return num(u.transferencia); }).length + " unidad(es)"),
      dato("Efectivo", fmtPesos.format(efvo), us.filter(function (u) { return num(u.efectivo); }).length + " unidad(es)"));
    box.append(datos);

    // Lo que hay que mirar: quién no pagó y qué cambió respecto del mes anterior.
    if (noAbono.length) {
      var na = el("div", "resalte rojo");
      na.append(el("b", null, noAbono.length === 1 ? "No abonó:" : "No abonaron (" + noAbono.length + "):"),
        document.createTextNode(" " + noAbono.map(function (u) { return u.unidad + (u.inquilino ? " (" + u.inquilino + ")" : ""); }).join(", ")));
      box.append(na);
    }
    if (prev) {
      var antes = {};
      (prev.unidades || []).forEach(function (u) { antes[String(u.unidad)] = u; });
      var cambios = [];
      us.forEach(function (u) {
        var a = antes[String(u.unidad)];
        if (!a) { cambios.push(u.unidad + ": nueva"); return; }
        if ((a.estado || "") !== (u.estado || "")) cambios.push(u.unidad + ": " + etiquetaEstado(a).toLowerCase() + " → " + etiquetaEstado(u).toLowerCase());
        else if (num(a.total) && Math.abs(num(u.total) - num(a.total)) / Math.abs(num(a.total)) > 0.05) {
          cambios.push(u.unidad + ": " + fmtPesos.format(num(a.total)) + " → " + fmtPesos.format(num(u.total)));
        }
        if (a.inquilino && u.inquilino && a.inquilino !== u.inquilino) cambios.push(u.unidad + ": nuevo inquilino (" + u.inquilino + ")");
      });
      if (cambios.length) {
        var c = el("div", "resalte");
        c.append(el("b", null, "Cambios vs " + prev.periodo + ":"));
        var ul = el("ul");
        cambios.slice(0, 8).forEach(function (t) { ul.append(el("li", null, t)); });
        if (cambios.length > 8) ul.append(el("li", null, "y " + (cambios.length - 8) + " más"));
        c.append(ul);
        box.append(c);
      }
    }

    // Unidades del lugar.
    var tabla = el("table", "unidades");
    var tb = el("tbody");
    us.slice().sort(function (a, b) {
      var orden = function (u) { return u.estado === "no-abono" ? 0 : u.estado === "desocupado" ? 2 : 1; };
      return orden(a) - orden(b);
    }).forEach(function (u) {
      var tr = el("tr");
      var td1 = el("td");
      td1.append(el("b", null, u.unidad || "—"), el("span", "sub", u.inquilino || ""));
      var pill = el("span", "pill " + (u.estado || ""), etiquetaEstado(u));
      var td2 = el("td"); td2.append(pill);
      tr.append(td1, td2, el("td", "num", num(u.total) ? fmtPesos.format(u.total) : "—"));
      tb.append(tr);
    });
    tabla.append(tb);
    var scroll = el("div", "tabla-scroll");
    scroll.append(tabla);
    box.append(scroll);

    // Liquidación del edificio (es una sola para todos sus lugares).
    var liq = h.liquidacion || [];
    var totales = liq.filter(function (x) { return x.tipo === "total"; });
    var final = totales[totales.length - 1];
    if (liq.length) {
      var lb = el("div", "liq-resumen");
      lb.append(el("small", null, l.varios ? "Liquidación del edificio (todos sus lugares)" : "Liquidación"));
      var fila = function (t, v, cls) { var d = el("div", cls || ""); d.append(el("span", null, t), el("span", "m", fmtPesos.format(num(v)))); return d; };
      var base = liq.find(function (x) { return x.tipo === "base"; });
      var desc = liq.filter(function (x) { return x.tipo === "descuento"; });
      var ing = liq.filter(function (x) { return x.tipo === "ingreso"; });
      if (base) lb.append(fila(base.concepto, base.monto));
      if (desc.length) lb.append(fila("Descuentos (" + desc.length + ")", -sumar(desc, "monto")));
      if (ing.length) lb.append(fila("Ingresos (" + ing.length + ")", sumar(ing, "monto")));
      if (final) lb.append(fila(final.concepto, final.monto, "final"));
      box.append(lb);
    }
    var bs = el("div", "botones");
    var ver = el("a", "boton", "Ver liquidación completa");
    ver.href = "propiedades.html?edificio=" + encodeURIComponent(l.edificio) + "&periodo=" + encodeURIComponent(h.periodo) + (l.lugar ? "&lugar=" + encodeURIComponent(l.lugar) : "");
    bs.append(ver);
    if (ubicado(l)) {
      var ge = el("a", "boton secundario", "Google Earth");
      ge.href = "https://earth.google.com/web/@" + l.lat + "," + l.lon + ",40a,350d,35y," + Math.round(((mapa.getBearing() % 360) + 360) % 360) + "h,65t,0r";
      ge.target = "_blank"; ge.rel = "noopener";
      bs.append(ge);
    }
    box.append(bs);
    return box;
  }

  function seccionUbicacion(l, conPinMovido) {
    var box = el("section", "bloque");
    var corr = el("button", "boton secundario chico", ubicado(l) ? "Corregir la ubicación en el mapa" : "Ubicar");
    corr.type = "button";
    box.append(corr);
    if (l.precision === "aproximada") box.append(el("div", "aviso-ficha", "La ubicación es aproximada: revisala y, si hace falta, corregila."));
    var panel = el("div", "corregir");
    panel.hidden = ubicado(l) && !conPinMovido;
    var inp = el("input");
    inp.type = "text"; inp.placeholder = "Calle y número, ciudad"; inp.value = l.direccion || "";
    inp.setAttribute("aria-label", "Dirección");
    var fila = el("div", "botones");
    var buscar = el("button", "boton chico", "Buscar dirección");
    buscar.type = "button";
    var mover = el("button", "boton secundario chico", arrastrando === l ? "Guardar posición del pin" : "Mover el pin");
    mover.type = "button";
    if (ubicado(l)) fila.append(buscar, mover); else fila.append(buscar);
    var nota = el("div", "nota", arrastrando === l ? "Arrastrá el pin hasta el lugar exacto y tocá “Guardar posición del pin”." : "");
    panel.append(inp, fila, nota);
    box.append(panel);
    corr.addEventListener("click", function () { panel.hidden = !panel.hidden; if (!panel.hidden) inp.focus(); });
    inp.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); buscar.click(); } });
    buscar.addEventListener("click", function () {
      if (!inp.value.trim()) { inp.focus(); return; }
      guardarUbicacion(l, { direccion: inp.value.trim() }, buscar, nota);
    });
    mover.addEventListener("click", function () {
      if (arrastrando === l) {
        var p = pines[l.clave].getLngLat();
        guardarUbicacion(l, { direccion: inp.value.trim() || l.direccion, lat: p.lat, lon: p.lng }, mover, nota);
        return;
      }
      pararGiro();
      terminarArrastre();
      arrastrando = l;
      pines[l.clave].setDraggable(true);
      pines[l.clave].getElement().classList.add("arrastrable");
      mostrarFicha(l, true);
    });
    return box;
  }

  function cerrarFicha() {
    $("ficha").hidden = true;
    document.querySelector(".cuerpo").classList.remove("con-ficha");
    terminarArrastre();
  }

  function terminarArrastre() {
    if (!arrastrando) return;
    var m = pines[arrastrando.clave];
    if (m) { m.setDraggable(false); m.getElement().classList.remove("arrastrable"); m.setLngLat([arrastrando.lon, arrastrando.lat]); }
    arrastrando = null;
  }

  function guardarUbicacion(l, d, boton, nota) {
    boton.disabled = true;
    nota.textContent = "Guardando…";
    BGPSesion.pedir("guardarUbicacionPropiedad", Object.assign({ clave: l.clave, edificio: l.edificio, lugar: l.lugar }, d)).then(function (r) {
      l.lat = r.lat; l.lon = r.lon; l.direccion = r.direccion; l.precision = r.precision;
      l.rumbo = null; l.inclinacion = null; l.panorama = "";
      arrastrando = null;
      pintarPines();
      elegir(l, true);
    }).catch(function (err) {
      boton.disabled = false;
      nota.textContent = err.message || "No se pudo guardar.";
    });
  }

  // ----- Recorrido: pasa por cada lugar como en Google Earth -----
  var recorrido = null;
  function pararRecorrido() {
    if (!recorrido) return;
    clearTimeout(recorrido);
    recorrido = null;
    $("recorrer").textContent = "Recorrer";
    $("recorrer").classList.remove("activo");
  }
  $("recorrer").addEventListener("click", function () {
    if (recorrido) { pararRecorrido(); return; }
    var u = lugares.filter(ubicado);
    if (!u.length) return;
    var i = Math.max(0, u.indexOf(seleccionado) + 1) % u.length;
    $("recorrer").textContent = "Parar";
    $("recorrer").classList.add("activo");
    (function siguiente() {
      elegir(u[i], true);
      i = (i + 1) % u.length;
      recorrido = setTimeout(siguiente, 11000);
    })();
  });

  // Si algún servidor de mapas no responde, igual se cargan los lugares.
  var arrancado = false;
  function arrancar() { if (arrancado) return; arrancado = true; cargar(0); }
  mapa.on("load", arrancar);
  setTimeout(arrancar, 5000);
})();
