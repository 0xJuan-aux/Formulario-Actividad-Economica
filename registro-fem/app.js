(() => {
  "use strict";

  const form = document.getElementById("femForm");
  if (!form) return;

  const ecc = document.getElementById("vECC");
  const documentInput = document.getElementById("vNro_doc");
  const comment = document.getElementById("vComentario");
  const eccList = document.getElementById("eccList");
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
      if (url.protocol !== "https:" || url.username || url.password || url.hash) return "";
      if (/(^|\.)((?:powerplatform|logic|flow)\.microsoft\.com|powerautomate\.com|logic\.azure\.com)$/i.test(url.hostname))
        return "";
      if (/(?:^|\.)github\.io$/i.test(url.hostname)) return "";
      return url.href;
    } catch {
      return "";
    }
  };
  const apiUrl = safeGateway(config.apiUrl);
  const catalogUrl = safeGateway(config.catalogUrl);
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

  async function getJSON(url, signal) {
    const response = await fetch(url, {
      method: "GET", credentials: "include", cache: "no-store",
      headers: { Accept: "application/json" }, signal
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.bResultado !== true)
      throw new Error(body?.vMensaje || "No se pudo consultar el catálogo autorizado.");
    return body;
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
    if (!catalogUrl || !ecc.value.trim()) return;
    const version = ++requestVersion;
    if (first) {
      queryAbort?.abort();
      queryAbort = new AbortController();
      docsAfter = "";
      docLoaded = 0;
      documentEmpty("Consultando documentos...");
    } else if (!hasMore) return;

    loadMore.disabled = true;
    const params = new URLSearchParams({
      tipo: "documentos", vECC: ecc.value.trim()
    });
    if (first && documentInput.value.trim()) params.set("buscar", documentInput.value.trim().slice(0, 40));
    if (!first && docsAfter) params.set("despues", docsAfter);
    docsMessage.textContent = "Consultando documentos...";
    try {
      const data = await getJSON(catalogUrl + (catalogUrl.includes("?") ? "&" : "?") + params, queryAbort.signal);
      if (version !== requestVersion) return;
      if (!Array.isArray(data.documentos) || typeof data.hayMas !== "boolean")
        throw new Error("El catálogo no devolvió una lista válida.");

      const numbers = data.documentos.filter(s => typeof s === "string");
      hasMore = data.hayMas;
      docsAfter = typeof data.siguiente === "string" ? data.siguiente : "";
      docLoaded += numbers.length;
      if (numbers.length) displayDocs(numbers, !first);
      else if (first) documentEmpty("No se encontraron documentos para ese vECC.");
      docCount.textContent = numberFormat.format(docLoaded) + (hasMore ? "+ cargados" : " cargados");
      loadMore.hidden = !hasMore;
      docsMessage.textContent = hasMore ? "Puedes cargar más documentos." : "";
    } catch(error) {
      if (error?.name === "AbortError" || version !== requestVersion) return;
      docsMessage.textContent = "No se pudo obtener la lista de documentos.";
      if (first) documentEmpty("El catálogo externo no está disponible. Puedes ingresar el documento manualmente.");
      loadMore.hidden = true;
    } finally {
      if (version === requestVersion) loadMore.disabled = false;
    }
  }

  async function loadEcc() {
    if (!catalogUrl) {
      eccHelp.textContent = "Catálogo externo no conectado. Puedes escribir vECC; la API deberá validar su pertenencia antes de guardar.";
      return;
    }
    eccHelp.textContent = "Consultando cabeceras ECC autorizadas...";
    try {
      const data = await getJSON(catalogUrl + (catalogUrl.includes("?") ? "&" : "?") + "tipo=ecc");
      if (!Array.isArray(data.valores)) throw new Error("Catálogo ECC inválido.");
      fillOptions(eccList, data.valores);
      eccHelp.textContent = data.valores.length
        ? "Selecciona una de las cabeceras disponibles."
        : "No hay cabeceras disponibles para el filtro de afectación.";
    } catch {
      eccHelp.textContent = "No fue posible consultar las cabeceras. Puedes escribir el valor manualmente.";
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

  ecc.addEventListener("input", () => {
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
  void loadEcc();
})();
