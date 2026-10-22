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
 * BGPSesion.salir()            Promise → cierra la sesión
 * BGPSesion.pedir(accion, d)   Promise → respuesta del servidor para una acción con sesión
 *                              (por ejemplo los datos de Propiedades). Falla con el motivo;
 *                              si la sesión venció, el error trae .sesion = false.
 */
(function () {
  // Si la URL /exec cambia algún día, actualizarla acá y en el iframe de index.html.
  var URL_APP = "https://script.google.com/macros/s/AKfycbzHN2YsUy94lXMT0RcSLfnuXQzx9j9ov4MleXNQhyPAKr7-tEwLIGEmnYcKaeA7pmh2IQ/exec";
  var CLAVE = "bgp-sesion";
  var CLAVE_USUARIO = "bgp-usuario";
  var ESPERA_MS = 15000;

  function leer(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function escribir(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }
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
    pedir: function (accion, datos) {
      return pedir(accion, datos).then(function (r) {
        if (r && r.ok !== false) return r;
        var err = new Error((r && r.error) || "Error del servidor.");
        if (r && r.sesion === false) { err.sesion = false; guardar("", null); }
        throw err;
      });
    },
    salir: function () {
      var t = leer(CLAVE);
      guardar("", null);
      if (!t) return Promise.resolve();
      return pedir("logout", { token: t }, t).then(function () {}, function () {});
    }
  };
})();
