/*
  Registro FEM: formulario publico, sin usuario ni contrasena.
  eccOnlyFlowUrl: URL firmada del flujo seleccionado por el propietario.
                  El formulario invoca exclusivamente vModo=ECC.
  IMPORTANTE: la firma sera publica por alojarse en GitHub Pages.
  El enlace permite otros modos del mismo flujo aunque el formulario solo utilice ECC.
  El flujo exclusivo debe admitir CORS desde https://0xjuan-aux.github.io.
  apiUrl y catalogUrl permanecen vacios: el guardado y consulta DNI no se habilitan.
*/
window.REGISTRO_FEM_PUBLIC_CONFIG = Object.freeze({
  apiUrl: "",
  catalogUrl: "",
  eccOnlyFlowUrl: "https://eea38c4a2605e001a80d824ebc6876.13.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/13/workflows/f054803123fe4590b0701591f810f5b0/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=ulI2NMHlIpgHs0LTNCEY1Zqh5V3OHZOZ9v4ACmsLpio"
});
