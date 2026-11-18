(() => {
  "use strict";

  const form = document.getElementById("femForm");
  if (!form) return;

  const ecc = document.getElementById("vECC");
  const documentInput = document.getElementById("vNro_doc");
  const comment = document.getElementById("vComentario");
  const docList = document.getElementById("docList");
  const docItems = document.getElementById("documentItems");
  const docCount = document.getElementById("docCount");
  const docsMessage = document.getElementById("docsMessage");
  const eccHelp = document.getElementById("eccHelp");
  const loadMore = document.getElementById("loadMore");
  const charCount = document.getElementById("charCount");
  const saveButton = document.getElementById("saveButton");
  const saveLabel = document.getElementById("saveLabel");
  const saveMessage = document.getElementById("saveMessage");
  const saveText = document.getElementById("saveText");

  // La URL del flujo Power Automate nunca debe estar en código público.
  const config = window.REGISTRO_FEM_PUBLIC_CONFIG || {};
  const safeGateway = value => {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const url = new URL(value.trim());
      if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) return "";
      if (/(^|\.)(powerplatform\.com|powerautomate\.com|logic\.azure\.com|logicapps\.azure\.com|flow\.microsoft\.com)$/i.test(url.hostname))
        return "";
      if (/(?:^|\.)github\.io$/i.test(url.hostname)) return "";
      return url.href;
    } catch {
      return "";
    }
  };
  const apiUrl = safeGateway(config.apiUrl);
  const catalogUrl = safeGateway(config.catalogUrl);
  const authUrl = safeGateway(config.authUrl);
  const authForm = document.getElementById("femAuthForm");
  const authUsuario = document.getElementById("femUsuario");
  const authClave = document.getElementById("femClave");
  const authStatus = document.getElementById("femAuthStatus");
  const loginButton = document.getElementById("femLoginBtn");
  const logoutButton = document.getElementById("femLogoutBtn");
  let authToken = ""; // Únicamente en memoria; no escribir a localStorage, cookies ni logs.
  const numberFormat = new Intl.NumberFormat("es-PE");
  const maxPage = 150;

  let docsAfter = "";
  let hasMore = false;
  let docLoaded = 0;
  let requestVersion = 0;
  let queryAbort = null;
  let searchTimer = null;
  let saving = false;
  let pendingSubmission = null;
  let savedSnapshot = null;

  function setStatus(message, kind = "") {
    saveText.textContent = message;
    saveMessage.className = "save-message" + (kind ? " " + kind : "");
  }

  function uuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    if (!window.crypto?.getRandomValues) throw new Error("El navegador no admite identificadores seguros.");
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const h = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join("-");
  }

  function payload() {
    return {
      vCodigo: "REGIS_FAME_COB",
      vECC: ecc.value.trim(),
      vNro_doc: documentInput.value.trim(),
      vEstado_Afectacion: form.querySelector('input[name="vEstado_Afectacion"]:checked')?.value || "",
      vComentario: comment.value.trim() || null
    };
  }

  function snapshot(body) {
    return JSON.stringify([body.vCodigo,body.vECC,body.vNro_doc,body.vEstado_Afectacion,body.vComentario]);
  }

  function validate(body) {
    if (!body.vECC) return "Selecciona o ingresa el vECC.";
    if (!body.vNro_doc) return "Ingresa o selecciona el documento del cliente.";
    if (body.vECC.length > 250 || body.vNro_doc.length > 40) return "Los campos vECC o vNro_doc superan el límite permitido.";
    if (!["Afectado","No Afectado"].includes(body.vEstado_Afectacion)) return "Selecciona Afectado o No Afectado.";
    if ((body.vComentario?.length || 0) > 2000) return "El comentario no puede superar 2000 caracteres.";
    return "";
  }

  function fillOptions(container, items) {
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      if (typeof item !== "string" || !item.trim()) continue;
      const option = document.createElement("option");
      option.value = item;
      fragment.appendChild(option);
    }
    container.replaceChildren(fragment);
  }

  function setAuthStatus(message, style = "") {
    authStatus.textContent = message;
    authStatus.className = "auth-status" + (style ? " " + style : "");
  }

  function resetAuth(reason = "Inicia sesión para acceder a los ECC.") {
    authToken = "";
    authForm.hidden = false;
    logoutButton.hidden = true;
    ecc.disabled = true;
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Acceso requerido";
    ecc.replaceChildren(empty);
    documentInput.value = "";
    resetDocs("Inicia sesión para consultar los documentos.");
    setAuthStatus(reason);
    eccHelp.textContent = "Solo usuarios autorizados pueden consultar nombres ECC y DNI.";
  }

  authForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!authUrl || !catalogUrl) {
      setAuthStatus("Servicio de consulta pendiente de configuración.", "error");
      return;
    }
    loginButton.disabled = true;
    setAuthStatus("Validando credenciales...");
    try {
      const response = await fetch(authUrl, {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          usuario: authUsuario.value.trim(),
          contrasena: authClave.value
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.bResultado !== true ||
          typeof data?.access_token !== "string" || !data.access_token) {
        setAuthStatus("Acceso no autorizado o servicio no disponible.", "error");
        return;
      }
      authToken = data.access_token;
      authClave.value = "";
      authForm.hidden = true;
      logoutButton.hidden = false;
      setAuthStatus("Sesión autorizada. Consultando los ECC...", "success");
      await loadEcc();
    } catch {
      setAuthStatus("No fue posible conectar con el servicio de autenticación.", "error");
    } finally {
      loginButton.disabled = false;
    }
  });

  logoutButton.addEventListener("click", () => {
    resetAuth("Sesión cerrada. Inicia sesión para consultar.");
  });

  // Se llama SOLO al proxy HTTPS autenticado. Nunca a la URL firmada de Power Automate.
  // El proxy conserva la firma como secreto y devuelve el contrato SQL ResultSets.Table1.
  async function queryCatalog(requestBody, signal) {
    if (!authToken) throw new Error("Se requiere autenticación.");
    const response = await fetch(catalogUrl, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + authToken
      },
      body: JSON.stringify(requestBody),
      signal
    });
    const body = await response.json().catch(() => null);
    if (response.status === 401) {
      resetAuth("La sesión expiró. Inicia sesión nuevamente.");
      throw new Error("Sesión vencida.");
    }
    if (!response.ok || !body || body.bResultado === false)
      throw new Error("No se pudo consultar el catálogo autorizado.");
    if (!Array.isArray(body?.ResultSets?.Table1))
      throw new Error("Formato de respuesta SQL inesperado.");
    return body.ResultSets.Table1;
  }

  function documentEmpty(message) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = message;
    docItems.replaceChildren(p);
  }

  function resetDocs(message) {
    requestVersion++;
    queryAbort?.abort();
    docsAfter = "";
    docLoaded = 0;
    hasMore = false;
    loadMore.hidden = true;
    docCount.textContent = "0 cargados";
    docsMessage.textContent = "";
    fillOptions(docList, []);
    documentEmpty(message);
  }

  function displayDocs(documents, append) {
    const list = append ? docItems.querySelector(".document-list") : null;
    const section = list || document.createElement("div");
    section.className = "document-list";
    for (const number of documents) {
      if (typeof number !== "string" || !number.trim()) continue;
      const label = document.createElement("label");
      label.className = "doc-choice";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "documentChoice";
      radio.value = number;
      radio.checked = documentInput.value === number;
      radio.addEventListener("change", () => {
        documentInput.value = number;
        refreshChanged();
      });
      const span = document.createElement("span");
      span.textContent = number;
      label.append(radio, span);
      section.appendChild(label);
    }
    if (!list) docItems.replaceChildren(section);
    const options = [...docList.querySelectorAll("option")].map(x => x.value).concat(documents);
    fillOptions(docList, [...new Set(options)]);
  }

  async function loadDocs(first = true) {
    const selectedECC = ecc.value.trim();
    if (!catalogUrl || !authToken || !selectedECC) return;
    const version = ++requestVersion;
    if (first) {
      queryAbort?.abort();
      queryAbort = new AbortController();
      docsAfter = "";
      docLoaded = 0;
      documentEmpty("Consultando documentos del ECC seleccionado...");
    } else if (!hasMore) return;

    loadMore.disabled = true;
    docsMessage.textContent = "Consultando documentos...";
    const requestBody = {
      vCodigo: "LISTA_ECC_FAME_COB",
      vModo: "DOCUMENTOS",
      vECC: selectedECC,
      iLimite: maxPage + 1
    };
    if (first && documentInput.value.trim())
      requestBody.vBuscar = documentInput.value.trim().slice(0, 40);
    if (!first && docsAfter) requestBody.vDespues = docsAfter;

    try {
      const rows = await queryCatalog(requestBody, queryAbort.signal);
      if (version !== requestVersion || ecc.value.trim() !== selectedECC) return;
      const numbers = rows
        .map(row => typeof row?.vNro_doc === "string" ? row.vNro_doc.trim() : "")
        .filter(Boolean);
      const page = numbers.slice(0, maxPage);
      hasMore = numbers.length > maxPage;
      docsAfter = page.length ? page[page.length - 1] : "";
      docLoaded += page.length;
      if (page.length) displayDocs(page, !first);
      else if (first) documentEmpty("No se encontraron documentos para este ECC.");
      docCount.textContent = numberFormat.format(docLoaded) +
        (hasMore ? "+ cargados" : " cargados");
      loadMore.hidden = !hasMore;
      docsMessage.textContent = hasMore ? "Puedes cargar más documentos." : "";
    } catch (error) {
      if (error?.name === "AbortError" || version !== requestVersion) return;
      docsMessage.textContent = "No se pudo consultar la lista de documentos.";
      if (first) documentEmpty("La consulta autorizada de documentos no está disponible.");
      loadMore.hidden = true;
    } finally {
      if (version === requestVersion) loadMore.disabled = false;
    }
  }

  async function loadEcc() {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecciona un ECC";
    ecc.replaceChildren(placeholder);
    ecc.disabled = true;
    if (!catalogUrl || !authUrl) {
      placeholder.textContent = "Catálogo ECC pendiente de conexión";
      eccHelp.textContent = "El catálogo seguro necesita configuración en el servidor.";
      return;
    }
    if (!authToken) {
      placeholder.textContent = "Inicia sesión para listar ECC";
      eccHelp.textContent = "Solo usuarios autorizados pueden consultar el catálogo ECC.";
      return;
    }
    placeholder.textContent = "Cargando ECC...";
    eccHelp.textContent = "Consultando cabeceras ECC autorizadas...";
    try {
      const rows = await queryCatalog({
        vCodigo: "LISTA_ECC_FAME_COB",
        vModo: "ECC",
        iLimite: 500
      });
      const unique = [...new Set(rows
        .map(row => typeof row?.vECC === "string" ? row.vECC.trim() : "")
        .filter(Boolean))];
      unique.forEach(value => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        ecc.appendChild(option);
      });
      if (!unique.length) {
        placeholder.textContent = "No hay ECC disponibles";
        eccHelp.textContent = "La consulta no devolvió cabeceras ECC.";
        return;
      }
      placeholder.textContent = "Selecciona un ECC de la lista";
      ecc.disabled = false;
      eccHelp.textContent = "Se cargaron " + numberFormat.format(unique.length) +
        " cabeceras autorizadas. Elige una para consultar sus documentos." +
        (rows.length >= 500 ? " La respuesta podría estar limitada a las primeras 500." : "");
    } catch {
      placeholder.textContent = "No fue posible cargar los ECC";
      eccHelp.textContent = "Error al consultar ECC. Revisa la conexión del proxy autorizado.";
    }
  }

  function refreshChanged() {
    if (saving) return;
    if (savedSnapshot !== null && snapshot(payload()) !== savedSnapshot) {
      savedSnapshot = null;
      saveButton.disabled = !apiUrl;
      setStatus(apiUrl ? "Cambios pendientes de guardar." : "Integración externa segura pendiente.");
    }
  }

  ecc.addEventListener("change", () => {
    documentInput.value = "";
    resetDocs(catalogUrl ? "Selecciona un vECC para consultar sus documentos." : "Catálogo de documentos pendiente de conexión.");
    refreshChanged();
    if (catalogUrl) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { void loadDocs(true); }, 450);
    }
  });

  documentInput.addEventListener("input", () => {
    refreshChanged();
    if (catalogUrl) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { void loadDocs(true); }, 450);
    }
  });
  form.addEventListener("change", refreshChanged);
  comment.addEventListener("input", () => {
    charCount.textContent = numberFormat.format(comment.value.length);
    refreshChanged();
  });
  loadMore.addEventListener("click", () => { void loadDocs(false); });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (saving || !apiUrl) return;
    const body = payload();
    const error = validate(body);
    if (error) { setStatus(error, "error"); return; }

    const signature = snapshot(body);
    if (savedSnapshot === signature) {
      setStatus("Esta evaluación ya fue registrada. Modifica un campo para registrar otra.", "success");
      return;
    }
    if (pendingSubmission?.signature !== signature)
      pendingSubmission = { id: uuid(), signature };
    const bodyToSend = { ...body, idSolicitud: pendingSubmission.id };

    saving = true;
    saveButton.disabled = true;
    saveLabel.textContent = "Guardando...";
    setStatus("Enviando registro a la API segura...");
    try {
      const response = await fetch(apiUrl, {
        method: "POST", credentials: "include", cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(bodyToSend)
      });
      const data = await response.json().catch(() => null);
      // No reportar éxito si el flujo no respondió con confirmación SQL real.
      if (!response.ok || !data || data.bResultado !== true)
        throw new Error(data?.vMensaje || "No hubo confirmación de guardado por SQL.");
      const code = Number(data.iCod_FEM);
      if (!Number.isSafeInteger(code) || code <= 0)
        throw new Error("No se recibió el código de registro confirmado por SQL.");

      pendingSubmission = null;
      if (snapshot(payload()) === signature) {
        savedSnapshot = signature;
        setStatus("Registro guardado correctamente. Código FEM: " + code + ".", "success");
      } else {
        savedSnapshot = null;
        setStatus("Registro " + code + " guardado. Hay cambios nuevos pendientes.", "success");
      }
    } catch {
      // Conservar el identificador original en reintentos para impedir duplicados.
      setStatus("No se pudo confirmar el registro. Comprueba la conexión antes de reintentar; el mismo envío reutilizará su identificador.", "error");
    } finally {
      saving = false;
      saveLabel.textContent = "Guardar";
      saveButton.disabled = !apiUrl || (savedSnapshot !== null && savedSnapshot === snapshot(payload()));
    }
  });

  if (apiUrl) {
    saveButton.disabled = false;
    setStatus("Formulario preparado para registrar por la API segura. Completa los campos.");
  } else {
    saveButton.disabled = true;
    setStatus("Formulario listo para revisar. El envío se habilitará al conectar una API segura que oculte Power Automate.");
  }
  resetDocs("El listado se mostrará al conectar el catálogo externo. Por ahora puedes escribir un documento.");
  if (!authUrl || !catalogUrl) {
    setAuthStatus("El acceso seguro está pendiente de habilitarse en Render.", "error");
  } else {
    setAuthStatus("Inicia sesión con una cuenta autorizada para consultar ECC y DNI.");
  }
  void loadEcc();
})();
