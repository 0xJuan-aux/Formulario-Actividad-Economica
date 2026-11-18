/*
  Configuración pública SIN secretos.
  El ComboBox FEM se alimenta de la respuesta ResultSets.Table1 de Power Automate
  mediante un proxy HTTPS autenticado que retiene la firma del flujo en su servidor.

  apiUrl: endpoint HTTPS autorizado para GUARDAR FEM (pendiente).
  catalogUrl: endpoint HTTPS autorizado que ACEPTA POST JSON:
    { "vCodigo":"LISTA_ECC_FAME_COB", "vModo":"ECC", "iLimite":500 }
    { "vCodigo":"LISTA_ECC_FAME_COB", "vModo":"DOCUMENTOS",
      "vECC":"...", "vBuscar":null, "vDespues":null, "iLimite":151 }
  y DEVUELVE el cuerpo SQL:
    { "ResultSets": { "Table1": [{ "vECC":"...", "vNro_doc":null }] } }

  La URL firmada del desencadenador HTTP de Power Automate NO se coloca aquí.
  Sin catalogUrl, el ComboBox se muestra deshabilitado y no revela datos.
  Sin apiUrl, Guardar permanece deshabilitado.
*/
window.REGISTRO_FEM_PUBLIC_CONFIG = Object.freeze({
  apiUrl: "",
  catalogUrl: ""
});
