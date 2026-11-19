# Registro FEM externo — formulario público

Ruta: `/registro-fem/` en GitHub Pages. Página independiente del formulario principal Actividad Económica.

## Estado actual (18 de noviembre de 2026)

- **Sin usuario ni contraseña en la página pública**: se retiró el bloque de autenticación a solicitud del propietario.
- `vECC`: **ComboBox HTML `<select>` sencillo**, sin login, sin opción de escritura manual y sin modalidades adicionales. Sus opciones provendrán del catálogo cuando esté conectado.
- `vNro_doc`: campo editable para escribir el documento manualmente.
- **ComboBox ECC conectado a la URL en el código de GitHub Pages**: `app.js` realiza `POST` con `vCodigo=LISTA_ECC_FAME_COB`, `vModo=ECC`, `iLimite=500` e interpreta solo `ResultSets.Table1[].vECC`. `config.js` contiene la URL firmada proporcionada por el propietario (no reproducirla en documentación). **La respuesta desde navegador y CORS aún no están verificados**.
- **Guardar** continúa deshabilitado porque `apiUrl: ""`; no se realiza ninguna inserción.
- **Advertencia**: la URL firmada fue agregada a `registro-fem/config.js` por autorización expresa del propietario; al ser pública, cualquier visitante puede inspeccionarla y activar cualquier modalidad que admita el mismo flujo. No hay consulta de DNI habilitada en la interfaz, pero eso no restringe el uso de la URL fuera de la interfaz.

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

El usuario confirmó que el modo `ECC` fue corregido en el SP para devolver **solo `vECC`**. La salida esperada es `{"ResultSets":{"Table1":[{"vECC":"..."}]},"OutputParameters":{}}`. La otra modalidad, `DOCUMENTOS`, sigue permitiendo consultar DNI en el mismo desencadenador multipropósito. Las pruebas PowerShell no certifican CORS ni conexión desde un navegador.

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

Por ahora el formulario permanece público, con un ComboBox ECC sin datos reales y sin login. Para activar la **opción 1 directa**, crear en Power Automate un flujo HTTP exclusivo para listar ECC, sin ramas `DOCUMENTOS`, `REGIS_FAME_COB` ni otros códigos, y comprobar que responde a preflight CORS desde GitHub Pages. Configurar exclusivamente la URL de ese nuevo flujo en `eccOnlyFlowUrl` para activar la carga; la URL será visible públicamente y debe considerarse autorizada para acceso anónimo. No reutilizar el flujo actual multipropósito.

ATD-Relay dispone de un módulo de proxy FEM de lectura en código, pero **no está conectado a la página actual** ni se declara activo; su activación requeriría autorización y configuración separadas.

Archivos: `index.html`, `styles.css`, `app.js`, `config.js`.

## Actualización 18/11/2026 — conexión directa del ComboBox ECC

La página pública se conectó directamente con el flujo existente únicamente para cargar el select `vECC`. Los campos `vNro_doc` y Guardar no fueron conectados. El servidor de Power Automate debe admitir CORS desde `https://0xjuan-aux.github.io` para que JavaScript pueda leer la respuesta; HTTP 200 desde PowerShell no demuestra CORS. **No hay verificación real desde navegador.** La firma expuesta permite otras modalidades del flujo que pudieran estar habilitadas, por lo que se recomienda rotarla y reemplazarla por un endpoint exclusivo del catálogo público cuando se complete la prueba.
