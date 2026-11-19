# Registro FEM externo — formulario público

Ruta: `/registro-fem/` en GitHub Pages. Página independiente del formulario principal Actividad Económica.

## Estado actual (18 de noviembre de 2026)

- **Sin usuario ni contraseña en la página pública**: se retiró el bloque de autenticación a solicitud del propietario.
- `vECC`: **ComboBox HTML `<select>`** con flecha desplegable, siempre habilitado y sin login. La opción «Otra cabecera — escribir manualmente» muestra un campo adicional. Cuando se disponga de un catálogo público autorizado, las opciones se añadirán al desplegable.
- `vNro_doc`: campo editable para escribir el documento manualmente.
- **No se muestran datos reales de ECC ni DNI automáticamente**: `config.js` mantiene `catalogUrl: ""`. El desplegable funciona con selección manual; aún no recibe listas reales desde Power Automate.
- **Guardar** continúa deshabilitado porque `apiUrl: ""`; no se realiza ninguna inserción.
- La firma HTTP de Power Automate nunca se guardó en el repositorio ni en GitHub Pages.

## Contrato Power Automate ya probado desde PowerShell

Para listar ECC:

```json
{
  "vCodigo": "LISTA_ECC_FAME_COB",
  "vModo": "ECC",
  "iLimite": 10
}
```

Para DNI de un ECC:

```json
{
  "vCodigo": "LISTA_ECC_FAME_COB",
  "vModo": "DOCUMENTOS",
  "vECC": "ECC SELECCIONADO",
  "iLimite": 10
}
```

El SP `DB_MAESTRO_BI.frm.SP_COB_Registro_FEM_Consultar` respondió en ambas modalidades con HTTP 200 y forma `{"ResultSets":{"Table1":[{"vECC":"...","vNro_doc":null}]},"OutputParameters":{}}` (para `DOCUMENTOS`, `vNro_doc` es el DNI). Estas pruebas son del flujo desde PowerShell; **no certifican acceso desde el navegador**.

Para registrar FEM, el botón Guardar debe usar el flujo `REGIS_FAME_COB` mediante un endpoint autorizado:

```json
{
  "vCodigo": "REGIS_FAME_COB",
  "idSolicitud": "<UUID generado en navegador>",
  "vECC": "<ECC>",
  "vNro_doc": "<documento>",
  "vEstado_Afectacion": "Afectado",
  "vComentario": "Opcional"
}
```

El SP `DB_MAESTRO_BI.frm.SP_COB_Registro_FEM_Registrar` requiere validar pertenencia ECC/documento en el servidor, usuario de registro confiable y confirmar `iCod_FEM` antes de mostrar éxito. `vCodigo` es para el Switch, **no** autentica.

## Seguridad y conexión futura

GitHub Pages sirve código público: una URL con parámetro `sig` quedaría al alcance de cualquiera si se pegara en HTML o JS. Además de posible bloqueo CORS, permitiría consultar nombres y DNI reales. La autorización para usar la URL durante pruebas **no** convierte los datos de clientes en información pública.

Por ahora el formulario está abierto y editable, con listas automáticas desactivadas; si se requiere consulta real en web, acordar un endpoint que limite lo que se muestra sin divulgar la firma ni los DNI de terceros.

ATD-Relay dispone de un módulo de proxy FEM de lectura en código, pero **no está conectado a la página actual** ni se declara activo; su activación requeriría autorización y configuración separadas.

Archivos: `index.html`, `styles.css`, `app.js`, `config.js`.
