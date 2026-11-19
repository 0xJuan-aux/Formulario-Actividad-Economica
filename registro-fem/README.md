# Registro FEM externo — formulario público

Ruta: `/registro-fem/` en GitHub Pages. Página independiente del formulario principal Actividad Económica.

## Estado actual (18 de noviembre de 2026)

- **Sin usuario ni contraseña en la página pública**: se retiró el bloque de autenticación a solicitud del propietario.
- `vECC`: **ComboBox HTML `<select>` sencillo**, sin login, sin opción de escritura manual y sin modalidades adicionales. Sus opciones provendrán del catálogo cuando esté conectado.
- `vNro_doc`: campo con sugerencias y listado de documentos cargados al elegir `vECC`; continúa admitiendo escritura según su diseño anterior.
- **ComboBox ECC**: se confirmó desde el navegador del propietario que carga los ECC mediante `vCodigo=LISTA_ECC_FAME_COB`, `vModo=ECC` y `ResultSets.Table1[].vECC`. La URL firmada está en `config.js` por elección del propietario.
- **Guardar habilitado para la primera prueba**: utiliza el mismo desencadenador Power Automate ya configurado, con `vCodigo=REGIS_FAME_COB`; el código interpreta `ResultSets.Table1[0]` y exige `bResultado=true`, `vEstado=REGISTRADO` o `YA_REGISTRADO` e `iCod_FEM` positivo. No se ejecutó ningún registro desde este desarrollo.
- **Prueba DOCUMENTOS habilitada en frontend**: al seleccionar `vECC`, el código envía `LISTA_DNI_FAME_COB`, `vModo=DOCUMENTOS` y `vECC` seleccionado (hasta 10 documentos por página, solicitando 11 para detectar siguiente página). El SP requiere `@vECC`; Power Automate debe mapear esa entrada desde `triggerBody()?["vECC"]`. No está comprobado todavía que este código Switch exista y responda en navegador. La URL firmada es públicamente visible y puede habilitar consultas de datos personales.

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
  "vCodigo": "LISTA_DNI_FAME_COB",
  "vModo": "DOCUMENTOS",
  "vECC": "ECC SELECCIONADO",
  "iLimite": 10
}
```

El usuario confirmó que el modo `ECC` fue corregido en el SP para devolver **solo `vECC`**. La salida esperada es `{"ResultSets":{"Table1":[{"vECC":"..."}]},"OutputParameters":{}}`. La otra modalidad, `DOCUMENTOS`, sigue permitiendo consultar DNI en el mismo desencadenador multipropósito. Las pruebas PowerShell no certifican CORS ni conexión desde un navegador.

Para registrar FEM, el botón Guardar envía directamente al caso `REGIS_FAME_COB` del flujo Power Automate:

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

El SP `DB_MAESTRO_BI.frm.SP_COB_Registro_FEM_Registrar` requiere validar pertenencia ECC/documento y controlar acceso en el servidor; **la versión actual del flujo en la captura utiliza `vUsuario_Registro = usuario` como literal**, por lo que no atribuye el registro a una persona autenticada. El frontend confirma éxito únicamente con los datos de resultado SQL. `vCodigo` sirve para el Switch, **no** autentica.

## Seguridad y conexión futura

GitHub Pages sirve código público: una URL con parámetro `sig` quedaría al alcance de cualquiera si se pegara en HTML o JS. Además de posible bloqueo CORS, permitiría consultar nombres y DNI reales. La autorización para usar la URL durante pruebas **no** convierte los datos de clientes en información pública.

El formulario es público y las consultas ECC y DOCUMENTOS se han programado para usar la misma URL firmada. Esto implica que un visitante puede copiarla y consultar registros fuera de la página. Para uso real con DNI de clientes, sustituir por un proxy con control de acceso y rotar la firma expuesta.

ATD-Relay dispone de un módulo de proxy FEM de lectura en código, pero **no está conectado a la página actual** ni se declara activo; su activación requeriría autorización y configuración separadas.

Archivos: `index.html`, `styles.css`, `app.js`, `config.js`.

## Actualización 18/11/2026 — conexión directa del ComboBox ECC

La página pública cargó los ECC reales desde el flujo existente según confirmación del propietario. Se programó después la consulta de documentos `LISTA_DNI_FAME_COB` al cambiar `vECC`; el propietario verificó que muestra documentos en el navegador. El botón Guardar se activó para prueba con `REGIS_FAME_COB`, pendiente de su primera confirmación SQL real. La firma expuesta permite ejecutar las modalidades que tenga habilitadas el flujo, por lo que se recomienda sustituirla por un endpoint con autorización y rotarla.

## Búsqueda por coincidencia en `vNro_doc` (19/11/2026)

El campo de texto existente `vNro_doc` también funciona como buscador de coincidencias parciales: al escribir uno o varios caracteres se realiza, tras una breve pausa, una consulta `LISTA_DNI_FAME_COB` con `vModo=DOCUMENTOS`, `vECC` del ComboBox y `vBuscar` igual al texto introducido. SQL usa `CHARINDEX(@buscar, resultado.vNro_doc) > 0`, por lo que compara cualquier posición, no solo el comienzo. Si se borra el texto se vuelve a consultar la lista inicial del ECC. `Cargar más documentos` conserva `vBuscar` y agrega `vDespues` para paginación. La lista visible también filtra localmente cualquier fila que no contenga la coincidencia, pero **para buscar en todos los documentos** es imprescindible que el caso Power Automate pase `triggerBody()?['vBuscar']` al parámetro SQL `@vBuscar`; en caso contrario solo podría examinar los documentos de la página que devolvió el flujo.

No se modifican el SP, el ComboBox ECC, ni Guardar. La URL firmada en el frontend sigue siendo pública; la consulta de DNI debería protegerse mediante control de acceso para producción.

## Optimización del buscador DNI (19/11/2026)

En una página pública, cargar todos los DNI para cada ECC no es recomendable por privacidad, consumo de datos y tiempo de primera carga. La búsqueda se optimizó sin modificar el diseño:

- Se conserva temporalmente **en memoria** el lote de documentos ya consultados de la cabecera ECC, no se escribe en almacenamiento persistente.
- Cada tecla filtra inmediatamente solo los documentos ya cargados en el navegador, sin llamar a Power Automate.
- Al escribir **cuatro o más dígitos** y dejar de teclear 850 ms, se consulta con `LISTA_DNI_FAME_COB`, `vModo=DOCUMENTOS`, `vECC` y `vBuscar` para encontrar también los documentos que aún no se cargaron. Por debajo de cuatro dígitos se muestran únicamente coincidencias locales.
- Al borrar la búsqueda, se restaura el lote en memoria sin solicitarlo nuevamente. «Cargar más documentos» conserva la paginación de la lista base.

El caso de Power Automate debe mapear `vBuscar` a `@vBuscar`; de lo contrario la consulta SQL no buscará en la totalidad del ECC. No se modificaron el SP, la URL, el ComboBox ni Guardar.

## Primera prueba de Guardar — 19/11/2026

El caso Power Automate de la captura se llama `REGIS_FAME_COB`, llama `SP_COB_Registro_FEM_Registrar`, y su respuesta HTTP `200` contiene el **Cuerpo** del conector SQL. El JavaScript envía `idSolicitud` UUID, `vECC`, `vNro_doc`, `vEstado_Afectacion` y `vComentario`. Los otros dos parámetros SQL se asignan en el flujo: `vUsuario_Registro` es literalmente `usuario`, `vCanal_Registro` es `Externo`. El SP normaliza el canal a `EXTERNO`.

La página interpreta la respuesta SQL en `ResultSets.Table1[0]`, o el formato aplanado, y no informa éxito únicamente por HTTP 200: exige un resultado positivo, `iCod_FEM` válido y `REGISTRADO` o `YA_REGISTRADO`. Reutiliza el UUID si una solicitud no obtuvo confirmación y se reintenta sin cambios, para evitar insertar duplicados. El éxito real sigue **pendiente de prueba por usuario**.

**Seguridad antes de producción:** la URL del desencadenador con firma ya está publicada en GitHub Pages. Con el caso de escritura habilitado, terceros que copien la firma pueden intentar insertar registros y no existe un usuario verificado en el flujo mostrado. Se debe proteger la escritura, validar en el servidor que el documento pertenezca al ECC, atribuir cada registro a una identidad confiable y rotar la URL firmada expuesta. La autorización de una prueba funcional no reemplaza estas medidas.
