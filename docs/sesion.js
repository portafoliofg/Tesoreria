/*
 * Sesión de bgpsammar.com · Andrés Sammartino
 *
 * El ingreso usa los mismos usuarios de la app de Tesorería: se valida en Apps
 * Script (doPost de src/Código.gs) y el token queda guardado en este navegador,
 * junto con el usuario, para mostrar las páginas al instante sin esperar al servidor.
 * La página de inicio se lo pasa a la app de Tesorería para no pedirlo dos veces.
 *
 * BGPSesion.token()            token guardado ("" si no hay)
 * BGPSesion.usuario()          usuario guardado {usuario, nombre} o null
 * BGPSesion.consultar()        Promise → usuario si la sesión sigue vigente, null si venció.
 *                              Si el servidor no responde (red, demora), la promesa falla:
 *                              eso NO significa que la sesión venció.
 * BGPSesion.ingresar(u, clave) Promise → usuario (o error con el motivo)
 * BGPSesion.ingresarGoogle(c)  Promise → usuario, con la credencial (ID token) del botón de Google.
 *                              La credencial queda en sessionStorage ("bgp-gid") para pasársela
 *                              a la plataforma de Inversiones sin pedir otro ingreso.
 * BGPSesion.credencialGoogle(maxMs) credencial de Google guardada si tiene menos de maxMs, o "".
 * BGPSesion.salir()            Promise → cierra la sesión
 * BGPSesion.pedir(accion, d)   Promise → respuesta del servidor para una acción con sesión
 *                              (por ejemplo los datos de Propiedades). Falla con el motivo;
 *                              si la sesión venció, el error trae .sesion = false.
 * BGPSesion.pedirConMemoria(accion, d, alLlegar, soloServidor)
 *                              Para las acciones que responden comprimido (formato "gz", por ejemplo
 *                              obtenerPropiedades). Llama a alLlegar(datos, true) al instante con lo
 *                              último guardado en este navegador (salvo con soloServidor) y a
 *                              alLlegar(datos, false) cuando responde el servidor, solo si cambió algo.
 *                              Promise → la respuesta del servidor; falla igual que pedir().
 *                              Lo guardado se borra al salir.
 */
(function () {
  // Si la URL /exec cambia algún día, actualizarla acá y en el iframe de index.html.
  var URL_APP = "https://script.google.com/macros/s/AKfycbzHN2YsUy94lXMT0RcSLfnuXQzx9j9ov4MleXNQhyPAKr7-tEwLIGEmnYcKaeA7pmh2IQ/exec";
  var CLAVE = "bgp-sesion";
  var CLAVE_USUARIO = "bgp-usuario";
  var CLAVE_GOOGLE = "bgp-gid";
  var ESPERA_MS = 15000;

  function leer(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function escribir(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }
  // La credencial de Google vive solo en esta pestaña (sessionStorage), con la hora en que llegó.
  function guardarGoogle(credencial) {
    try {
      if (credencial) sessionStorage.setItem(CLAVE_GOOGLE, JSON.stringify({ c: credencial, t: Date.now() }));
      else sessionStorage.removeItem(CLAVE_GOOGLE);
    } catch (e) {}
  }
  function guardar(token, usuario) {
    escribir(CLAVE, token);
    escribir(CLAVE_USUARIO, token && usuario ? JSON.stringify(usuario) : "");
  }

  // text/plain: así el navegador no hace la consulta previa de CORS, que Apps Script no responde.
  function pedir(accion, datos, token) {
    var control = typeof AbortController !== "undefined" ? new AbortController() : null;
    var reloj = setTimeout(function () { if (control) control.abort(); }, ESPERA_MS);
    return fetch(URL_APP, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ accion: accion, datos: datos || {}, token: token === undefined ? leer(CLAVE) : token }),
      signal: control ? control.signal : undefined
    })
      .then(function (r) { if (!r.ok) throw new Error("El servidor respondió " + r.status + "."); return r.json(); })
      .catch(function (err) {
        if (err && /^El servidor/.test(err.message)) throw err;
        throw new Error("No se pudo conectar con el servidor. Revisá la conexión y probá de nuevo.");
      })
      .then(function (r) { clearTimeout(reloj); return r; }, function (err) { clearTimeout(reloj); throw err; });
  }

  // ----- Memoria de este navegador (IndexedDB) -----
  // Si el navegador no deja guardar, leer devuelve null y todo sigue andando sin memoria.
  var memoria = (function () {
    var base = null;
    function abrir() {
      if (!base) base = new Promise(function (resolve) {
        try {
          var req = indexedDB.open("bgp-memoria", 1);
          req.onupgradeneeded = function () { req.result.createObjectStore("datos"); };
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = req.onblocked = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
      return base;
    }
    function operar(modo, fn) {
      return abrir().then(function (db) {
        if (!db) return null;
        return new Promise(function (resolve) {
          try {
            var t = db.transaction("datos", modo);
            var pedido = fn(t.objectStore("datos"));
            t.oncomplete = function () { resolve(pedido && pedido.result !== undefined ? pedido.result : null); };
            t.onerror = t.onabort = function () { resolve(null); };
          } catch (e) { resolve(null); }
        });
      }).catch(function () { return null; });
    }
    return {
      leer: function (k) { return operar("readonly", function (s) { return s.get(k); }); },
      guardar: function (k, v) { return operar("readwrite", function (s) { return s.put(v, k); }); },
      borrar: function () { return operar("readwrite", function (s) { return s.clear(); }); }
    };
  })();

  function descomprimir(gz) {
    var bin = atob(gz), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text().then(JSON.parse);
  }

  window.BGPSesion = {
    token: function () { return leer(CLAVE); },
    usuario: function () {
      if (!leer(CLAVE)) return null;
      try { return JSON.parse(leer(CLAVE_USUARIO)) || { usuario: "", nombre: "" }; } catch (e) { return { usuario: "", nombre: "" }; }
    },
    consultar: function () {
      var t = leer(CLAVE);
      if (!t) return Promise.resolve(null);
      return pedir("estado", {}, t).then(function (r) {
        if (!r || r.ok === false) throw new Error((r && r.error) || "Respuesta inválida del servidor.");
        // Solo se borra si sigue siendo el mismo token (pudo haber otro ingreso mientras tanto).
        if (leer(CLAVE) === t) guardar(r.usuario ? t : "", r.usuario);
        return r.usuario || null;
      });
    },
    ingresar: function (usuario, clave) {
      return pedir("login", { usuario: usuario, clave: clave }, "").then(function (r) {
        if (!r.ok) throw new Error(r.error || "No se pudo ingresar.");
        guardar(r.token, r.usuario);
        return r.usuario;
      });
    },
    ingresarGoogle: function (credencial) {
      return pedir("loginGoogle", { credential: credencial }, "").then(function (r) {
        if (!r.ok) throw new Error(r.error || "No se pudo ingresar con Google.");
        guardar(r.token, r.usuario);
        guardarGoogle(credencial);
        return r.usuario;
      });
    },
    credencialGoogle: function (maxMs) {
      try {
        var g = JSON.parse(sessionStorage.getItem(CLAVE_GOOGLE) || "null");
        if (g && g.c && typeof g.t === "number" && Date.now() - g.t < maxMs) return g.c;
      } catch (e) {}
      return "";
    },
    pedir: function (accion, datos) {
      return pedir(accion, datos).then(function (r) {
        if (r && r.ok !== false) return r;
        var err = new Error((r && r.error) || "Error del servidor.");
        if (r && r.sesion === false) { err.sesion = false; guardar("", null); }
        throw err;
      });
    },
    pedirConMemoria: function (accion, datos, alLlegar, soloServidor) {
      var api = this;
      if (typeof DecompressionStream === "undefined" || typeof indexedDB === "undefined") {
        return api.pedir(accion, datos).then(function (r) { alLlegar(r, false); return r; });
      }
      var u = api.usuario();
      var k = (u && u.usuario || "") + "|" + accion;
      return memoria.leer(k).then(function (g) {
        // A la vista lo guardado (si hay) mientras se espera al servidor.
        var mostrado = g && !soloServidor
          ? descomprimir(g.gz).then(function (o) { alLlegar(o, true); return true; }, function () { return false; })
          : Promise.resolve(false);
        function pedirServidor(clave) {
          return api.pedir(accion, Object.assign({}, datos, { formato: "gz", clave: clave }));
        }
        return pedirServidor(g ? g.clave : "").then(function (r) {
          return mostrado.then(function (ok) {
            if (!r.igual) return procesar(r);
            if (ok) return r;
            // No cambió, pero lo guardado no estaba a la vista (soloServidor o no se pudo leer).
            return descomprimir(g.gz).then(function (o) { alLlegar(o, false); return r; },
              function () { return pedirServidor("").then(procesar); });
          });
        });
        function procesar(r) {
          if (r.gz === undefined) { alLlegar(r, false); return r; }
          if (r.clave) memoria.guardar(k, { clave: r.clave, gz: r.gz });
          return descomprimir(r.gz).then(function (o) { alLlegar(o, false); return r; });
        }
      });
    },
    salir: function () {
      var t = leer(CLAVE);
      guardar("", null);
      guardarGoogle("");
      memoria.borrar();
      if (!t) return Promise.resolve();
      return pedir("logout", { token: t }, t).then(function () {}, function () {});
    }
  };
})();
