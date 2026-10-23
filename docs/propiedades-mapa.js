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
 * Al elegir un lugar: vuela hasta ahí inclinado y gira despacio alrededor.
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
  $("verTodo").addEventListener("click", function () { pararRecorrido(); seleccionado = null; $("ficha").hidden = true; pintarLista(); marcarPines(); verTodo(true); });

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

  // ----- Ficha -----
  function mostrarFicha(l, conPinMovido) {
    var f = $("ficha");
    f.replaceChildren();
    f.hidden = false;
    var cerrar = el("button", "cerrar", "×");
    cerrar.type = "button"; cerrar.setAttribute("aria-label", "Cerrar");
    cerrar.addEventListener("click", function () { f.hidden = true; terminarArrastre(); });
    f.append(cerrar, el("h2", null, nombreDe(l)), el("div", "dir", (l.lugar ? l.edificio + " · " : "") + (l.direccion || "Sin dirección cargada")));
    var datos = el("div", "datos");
    var dato = function (t, v) { var d = el("div", "dato"); d.append(el("small", null, t), el("b", null, v)); return d; };
    var e = l.estados || {};
    datos.append(dato("Unidades", String(l.unidades)), dato("Período", l.periodo || "—"),
      dato("No abonó", String(e["no-abono"] || 0)), dato("Total del mes", l.total ? fmtPesos.format(l.total) : "—"));
    f.append(datos);

    var bs = el("div", "botones");
    var liq = el("a", "boton", "Ver liquidación");
    liq.href = "propiedades.html?edificio=" + encodeURIComponent(l.edificio) + (l.lugar ? "&lugar=" + encodeURIComponent(l.lugar) : "");
    bs.append(liq);
    if (ubicado(l)) {
      var ge = el("a", "boton secundario", "Google Earth");
      ge.href = "https://earth.google.com/web/@" + l.lat + "," + l.lon + ",40a,350d,35y," + Math.round(((mapa.getBearing() % 360) + 360) % 360) + "h,65t,0r";
      ge.target = "_blank"; ge.rel = "noopener";
      var sv = el("a", "boton secundario", "Street View");
      sv.href = "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" + l.lat + "," + l.lon;
      sv.target = "_blank"; sv.rel = "noopener";
      bs.append(ge, sv);
    }
    var corr = el("button", "boton secundario", ubicado(l) ? "Corregir ubicación" : "Ubicar");
    corr.type = "button";
    bs.append(corr);
    f.append(bs);
    if (l.precision === "aproximada") f.append(el("div", "aviso-ficha", "La ubicación es aproximada: revisala y, si hace falta, corregila."));
    if (!ubicado(l)) f.append(el("div", "aviso-ficha", "Todavía no está en el mapa: escribí su dirección (calle, número y ciudad)."));

    // Corrección: dirección o pin.
    var panel = el("div", "corregir");
    panel.hidden = ubicado(l) && !conPinMovido;
    var inp = el("input");
    inp.type = "text"; inp.placeholder = "Calle y número, ciudad"; inp.value = l.direccion || "";
    inp.setAttribute("aria-label", "Dirección");
    var fila = el("div", "botones");
    var buscar = el("button", "boton", "Buscar dirección");
    buscar.type = "button";
    var mover = el("button", "boton secundario", arrastrando === l ? "Guardar posición del pin" : "Mover el pin");
    mover.type = "button";
    if (ubicado(l)) fila.append(buscar, mover); else fila.append(buscar);
    var nota = el("div", "nota", arrastrando === l ? "Arrastrá el pin hasta el lugar exacto y tocá “Guardar posición del pin”." : "");
    panel.append(inp, fila, nota);
    f.append(panel);
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
