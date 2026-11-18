# Registro FEM externo (GitHub Pages)

Ruta de la página: `/registro-fem/`.

Este formulario está aislado del formulario principal Actividad Económica: no edita `/index.html` ni sus scripts.

## Contrato para Power Automate

El formulario genera un UUID nuevo para cada envío y reutiliza el mismo UUID al repetir un envío sin cambios después de un error de red.

```json
{
  "vCodigo": "REGIS_FAME_COB",
  "idSolicitud": "<GUID generado por navegador>",
  "vECC": "<cabecera seleccionada>",
  "vNro_doc": "<documento seleccionado>",
  "vEstado_Afectacion": "Afectado",
  "vComentario": "Observación opcional"
}
```

`vCodigo` sirve **para el Switch**, no para autenticar.

En el caso `REGIS_FAME_COB`, el flujo debe validar formato, integridad y pertenencia de `vECC` y `vNro_doc` frente al origen `DB_CRE_BI.dbo.vw_reporte_diario_operacion` con `vAfectacion='Si'` y `u_CodGes_call IN ('SC','SG')`. Esta validación **no está dentro** del SP.

El paso SQL Server llama:
`DB_MAESTRO_BI.frm.SP_COB_Registro_FEM_Registrar`

Mapeo:
- `@idSolicitud` ← JSON `idSolicitud`.
- `@vECC` ← JSON `vECC`.
- `@vNro_doc` ← JSON `vNro_doc`.
- `@vEstado_Afectacion` ← JSON `vEstado_Afectacion`.
- `@vComentario` ← JSON `vComentario` o NULL.
- `@vUsuario_Registro` ← identidad **verificada por la API** (no una cadena elegida por navegador).
- `@vCanal_Registro` ← valor fijo `EXTERNO`.

En Power Automate agregar una acción **Respuesta** que entregue `HTTP 200` exclusivamente si el SP confirmó escritura:

```json
{"bResultado": true, "vEstado": "REGISTRADO", "iCod_FEM": 123, "vMensaje": "Registro FEM guardado correctamente."}
```

En caso de validación fallida / error de escritura, responder con código 4xx/5xx y `bResultado:false`. No devolver éxito basándose solo en que el flujo se disparó.

## Seguridad imprescindible para habilitar Guardar

GitHub Pages aloja HTML, CSS y JavaScript públicos: **no se puede ocultar allí una URL HTTP firmada de Power Automate ni credenciales SQL**.

- El desencadenador Power Automate visto en el diseño permite `Cualquiera`; **no enviarlo ni pegarlo en `config.js` ni en ninguna URL de navegador**. Configurar acceso autenticado donde sea viable; no interpretar el código `REGIS_FAME_COB` como secreto.
- Exponer una **API intermedia segura HTTPS** con autorización, controles anti-abuso, validaciones de los campos y autenticación del usuario. Guardar la URL del flujo de Power Automate únicamente en variables/secrets del servidor de esa API.
- En `config.js`, configurar solamente la URL pública del **proxy autorizado**, por ejemplo `https://<dominio-del-proxy>/api/fem/guardar`; el ejemplo es una forma de URL, no un servicio desplegado.
- El endpoint `catalogUrl` también debe requerir autorización antes de devolver cabeceras y documentos. No poner listas reales de DNI en el repositorio.
- CORS no constituye autenticación. Si se usa sesión/cookie, exigir protección CSRF y cookies seguras; de lo contrario usar un flujo de identidad autenticado adecuado al proxy.
- Nunca escribir datos personales o respuestas SQL en GitHub, logs de consola ni almacenamiento del navegador.

El guardado permanece **deshabilitado** hasta configurar `apiUrl` en `config.js` apuntando a un proxy seguro. El `vECC` y `vNro_doc` se pueden escribir para previsualización, pero su validación definitiva debe ser de servidor.

## Archivos

- `index.html`: diseño y controles accesibles.
- `styles.css`: tema AtencionDigital y adaptación móvil.
- `app.js`: validaciones cliente, consulta opcional de catálogos, envío idempotente y confirmación real.
- `config.js`: contiene solo direcciones **públicas no secretas** de proxy/catálogo, inicialmente vacías.

## Estado

Página versionada en GitHub, pendiente de comprobación efectiva de publicación Pages, configuración de API segura, prueba de catálogos, ejecución HTTP real, autorización SQL y respuesta real del SP.

## ComboBox ECC — integración con Power Automate (18/11/2026)

La página ahora tiene un `<select id="vECC">` en lugar de una caja de texto libre. Está preparado para cargar automáticamente los valores de `vECC` mediante una petición POST al **proxy autenticado** configurado en `config.js` (`catalogUrl`).

El contrato coincide con el flujo HTTP probado en PowerShell, sin revelar la URL firmada:

**Solicitud para listar ECC:**

```json
{
  "vCodigo": "LISTA_ECC_FAME_COB",
  "vModo": "ECC",
  "iLimite": 500
}
```

**Solicitud para listar DNI del ECC seleccionado:**

```json
{
  "vCodigo": "LISTA_ECC_FAME_COB",
  "vModo": "DOCUMENTOS",
  "vECC": "<ECC seleccionado>",
  "iLimite": 151
}
```

La respuesta del proxy debe conservar el cuerpo JSON confirmado del conector SQL en Power Automate:

```json
{
  "ResultSets": {
    "Table1": [
      { "vECC": "ECC DEMO", "vNro_doc": null }
    ]
  },
  "OutputParameters": {}
}
```

En modo `DOCUMENTOS`, `Table1` trae `vNro_doc` como texto. La interfaz carga 150 filas por página y usa el último documento mostrado como `vDespues` en la siguiente consulta. El SP limita resultados a 500; el catálogo ECC presenta las primeras 500 cabeceras si hubiese más.

**Observación de prueba del usuario:** en PowerShell, la llamada POST real `LISTA_ECC_FAME_COB` respondió HTTP 200 y `ResultSets.Table1` con 6 ECC; otra llamada modo `DOCUMENTOS` respondió HTTP 200 con 6 documentos para una cabecera de prueba. Estos ensayos son evidencia de Power Automate desde la máquina del usuario, **no** de una conexión operativa de la página.

**Pendiente:** aprovisionar y configurar la API intermedia HTTPS autenticada, guardar la URL firmada de Power Automate como secreto en el servidor, autorizar acceso por usuario, definir CORS para GitHub Pages y cargar el `catalogUrl` público sin firma. El formulario público **no** debe divulgar nombres de clientes ni DNI sin permisos adecuados. Hasta ese momento el ComboBox queda deshabilitado. El código `LISTA_ECC_FAME_COB` no es una credencial.

