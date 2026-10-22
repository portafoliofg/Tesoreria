/*
 * Sesión de bgpsammar.com · B.G.P Sammar
 *
 * El ingreso usa los mismos usuarios de la app de Tesorería: se valida en Apps
 * Script (doPost de src/Código.gs) y el token queda guardado en este navegador.
 * La página de inicio se lo pasa a la app de Tesorería para no pedirlo dos veces.
 *
 * BGPSesion.token()            token guardado ("" si no hay)
 * BGPSesion.consultar()        Promise → usuario {usuario, nombre} o null si no hay sesión válida
 * BGPSesion.ingresar(u, clave) Promise → usuario (o error con el motivo)
 * BGPSesion.salir()            Promise → cierra la sesión
 */
(function () {
  // Si la URL /exec cambia algún día, actualizarla acá y en el iframe de index.html.
  var URL_APP = "https://script.google.com/macros/s/AKfycbzHN2YsUy94lXMT0RcSLfnuXQzx9j9ov4MleXNQhyPAKr7-tEwLIGEmnYcKaeA7pmh2IQ/exec";
  var CLAVE = "bgp-sesion";

  function leer() { try { return localStorage.getItem(CLAVE) || ""; } catch (e) { return ""; } }
  function guardar(t) {
    try { if (t) localStorage.setItem(CLAVE, t); else localStorage.removeItem(CLAVE); } catch (e) {}
  }

  // text/plain: así el navegador no hace la consulta previa de CORS, que Apps Script no responde.
  function pedir(accion, datos) {
    return fetch(URL_APP, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ accion: accion, datos: datos || {}, token: leer() })
    })
      .then(function (r) { if (!r.ok) throw new Error("El servidor respondió " + r.status + "."); return r.json(); })
      .catch(function (err) {
        if (err instanceof SyntaxError || err instanceof TypeError) throw new Error("No se pudo conectar con el servidor. Revisá la conexión y probá de nuevo.");
        throw err;
      });
  }

  window.BGPSesion = {
    token: leer,
    consultar: function () {
      if (!leer()) return Promise.resolve(null);
      return pedir("estado").then(function (r) {
        if (!r.usuario) guardar("");
        return r.usuario || null;
      });
    },
    ingresar: function (usuario, clave) {
      return pedir("login", { usuario: usuario, clave: clave }).then(function (r) {
        if (!r.ok) throw new Error(r.error || "No se pudo ingresar.");
        guardar(r.token);
        return r.usuario;
      });
    },
    salir: function () {
      var t = leer();
      guardar("");
      if (!t) return Promise.resolve();
      return fetch(URL_APP, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ accion: "logout", datos: { token: t }, token: t })
      }).then(function () {}, function () {});
    }
  };
})();
