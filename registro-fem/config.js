/*
  Registro FEM: formulario publico, sin usuario ni contrasena.
  eccOnlyFlowUrl: enlace firmado del desencadenador Power Automate existente.
  El formulario realiza dos llamadas de lectura diferenciadas:
    - LISTA_ECC_FAME_COB, vModo=ECC: lista cabeceras
    - LISTA_DNI_FAME_COB, vModo=DOCUMENTOS: documentos del vECC elegido
  AVISO: el enlace firmado es publico al estar en GitHub Pages.
  Se requiere CORS compatible con https://0xjuan-aux.github.io.
  apiUrl y catalogUrl siguen vacios; Guardar NO esta habilitado.
*/
window.REGISTRO_FEM_PUBLIC_CONFIG = Object.freeze({
  apiUrl: "",
  catalogUrl: "",
  eccOnlyFlowUrl: "https://eea38c4a2605e001a80d824ebc6876.13.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/13/workflows/f054803123fe4590b0701591f810f5b0/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=ulI2NMHlIpgHs0LTNCEY1Zqh5V3OHZOZ9v4ACmsLpio"
});
