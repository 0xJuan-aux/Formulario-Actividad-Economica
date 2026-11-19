/*
  Registro FEM: formulario publico, sin usuario ni contrasena.
  eccOnlyFlowUrl: URL HTTPS de un flujo Power Automate EXCLUSIVO PARA ECC
                  (debe responder solo vECC y no permitir DOCUMENTOS/REGISTRO).
  NO reutilizar aqui el desencadenador multiproposito de prueba:
  esa misma firma tambien habilita solicitudes de DNI.
  GitHub Pages publica este archivo, incluida cualquier URL que se agregue.
  El flujo exclusivo debe admitir CORS desde https://0xjuan-aux.github.io.
  apiUrl y catalogUrl permanecen vacios: el guardado y consulta DNI no se habilitan.
*/
window.REGISTRO_FEM_PUBLIC_CONFIG = Object.freeze({
  apiUrl: "",
  catalogUrl: "",
  eccOnlyFlowUrl: ""
});
