/*
  Configuración pública sin credenciales.
  GitHub Pages es estático: NO colocar aquí URL del desencadenador HTTP de
  Power Automate, firmas, tokens, claves SQL ni contraseñas.
  apiUrl: solo endpoint HTTPS de un intermediario autenticado/validado que
          mantenga la URL real de Power Automate exclusivamente en el servidor.
  catalogUrl: endpoint HTTPS autenticado que devuelve vECC y vNro_doc.
  El botón Guardar permanece desactivado hasta disponer de apiUrl segura.
*/
window.REGISTRO_FEM_PUBLIC_CONFIG = Object.freeze({
  apiUrl: "",
  catalogUrl: ""
});
