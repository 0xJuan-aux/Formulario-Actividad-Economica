const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

// DOM mínimo para probar el formulario y su contrato HTTP, sin datos ni servicios reales.
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.events = {}; this.attrs = {}; this.dataset = {}; this.value = ''; this.textContent = ''; this.checked = false; }
  appendChild(child) { if (child.tagName === 'fragment') this.children.push(...child.children); else this.children.push(child); return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  addEventListener(event, fn) { (this.events[event] ||= []).push(fn); }
  async fire(event) { for (const fn of this.events[event] || []) await fn({ preventDefault() {} }); }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  focus() {}
  get options() { return this.children.filter(x => x.tagName === 'option'); }
  querySelectorAll(selector) {
    const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    if (selector === '*') return all;
    if (selector === 'option') return all.filter(x => x.tagName === 'option');
    if (selector.includes('input[name=')) {
      const name = selector.match(/name="([^"]+)"/)[1];
      return all.filter(x => x.tagName === 'input' && x.name === name && (!selector.includes(':checked') || x.checked));
    }
    if (selector === '[aria-current="page"]') return all.filter(x => x.attrs['aria-current'] === 'page');
    return [];
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 180));
function setup({ repeatCursor = false, failOnce = false, delayA = false } = {}) {
  const ids = [...fs.readFileSync('registro-fem/index.html', 'utf8').matchAll(/id="([^"]+)"/g)].map(x => x[1]);
  const nodes = Object.fromEntries(ids.map(id => [id, new Element(id === 'vECC' ? 'select' : 'div')]));
  const state = new Element('input'); state.name = 'vEstado_Afectacion'; state.value = 'Afectado'; nodes.femForm.appendChild(state);
  const document = { getElementById: id => nodes[id], createElement: tag => new Element(tag), createDocumentFragment: () => new Element('fragment') };
  const rows = { A: Array.from({ length: 25 }, (_, i) => ({ vNro_doc: String(i + 1).padStart(8, '0'), vCliente: 'Cliente de prueba ' + (i + 1) })), B: [{ vNro_doc: '00000100', vCliente: 'Otra ECC' }] };
  const calls = [];
  const fetch = async (url, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    if (body.vCodigo === 'LISTA_ECC_FAME_COB') return { ok: true, json: async () => ({ ResultSets: { Table1: [{ vECC: 'A' }, { vECC: 'B' }] } }) };
    if (body.vCodigo === 'REGIS_FAME_COB') return { ok: true, json: async () => ({ ResultSets: { Table1: [{ bResultado: true, vEstado: 'REGISTRADO', iCod_FEM: 1 }] } }) };
    if (delayA && body.vECC === 'A') await new Promise(resolve => setTimeout(resolve, 80));
    if (options.signal?.aborted) { const error = new Error(); error.name = 'AbortError'; throw error; }
    if (failOnce) { failOnce = false; throw new Error('network'); }
    // Un flujo que entrega lotes de siete aunque el navegador solicite 500.
    const result = rows[body.vECC].filter(x => repeatCursor || !body.vDespues || x.vNro_doc > body.vDespues).slice(0, 7);
    return { ok: true, json: async () => ({ ResultSets: { Table1: result } }) };
  };
  const context = { document, window: { REGISTRO_FEM_PUBLIC_CONFIG: { eccOnlyFlowUrl: 'https://test.environment.api.powerplatform.com/powerautomate/test/invoke?sig=fixture' }, crypto: webcrypto }, URL, Intl, AbortController, setTimeout, clearTimeout, console, fetch };
  vm.runInNewContext(fs.readFileSync('registro-fem/app.js', 'utf8'), context);
  return { nodes, state, calls, async choose(ecc) { nodes.vECC.value = ecc; await nodes.vECC.fire('change'); await settle(); }, docCalls() { return calls.filter(x => x.vCodigo === 'LISTA_DNI_FAME_COB'); }, radios() { return nodes.documentItems.querySelectorAll('input[name="documentChoice"]'); } };
}

test('descarga hasta lote vacío; pagina y busca todo localmente; reutiliza ECC', async () => {
  const app = setup(); await settle(); await app.choose('A');
  assert.equal(app.nodes.docCount.textContent, '25 documentos');
  assert.equal(app.docCalls().length, 5);
  assert.equal(app.radios().length, 10);
  assert.match(app.nodes.docsMessage.textContent, /Página 1 de 3/);
  const calls = app.calls.length;
  await app.nodes.docPagination.children.find(x => x.textContent === '2').fire('click');
  assert.equal(app.radios()[0].value, '00000011');
  assert.equal(app.calls.length, calls);
  app.nodes.vNro_doc.value = '00000025'; await app.nodes.vNro_doc.fire('input');
  assert.equal(app.radios().length, 1); assert.equal(app.radios()[0].value, '00000025');
  assert.equal(app.calls.length, calls);
  app.nodes.vNro_doc.value = ''; await app.nodes.vNro_doc.fire('input');
  await app.choose('B'); const beforeReturn = app.calls.length; await app.choose('A');
  assert.equal(app.calls.length, beforeReturn);
  assert.equal(app.nodes.docCount.textContent, '25 documentos');
});

test('al guardar elimina el DNI confirmado de la copia local sin descargar todo otra vez', async () => {
  const app = setup(); await settle(); await app.choose('A');
  app.nodes.vNro_doc.value = '00000001'; await app.nodes.vNro_doc.fire('input');
  app.state.checked = true; app.nodes.vComentario.value = 'Observación de prueba';
  const before = app.docCalls().length; await app.nodes.femForm.fire('submit');
  assert.equal(app.docCalls().length, before);
  assert.equal(app.nodes.docCount.textContent, '24 documentos');
  assert(!app.radios().some(x => x.value === '00000001'));
  assert.equal(app.nodes.vNro_doc.value, ''); assert.equal(app.nodes.vComentario.value, '');
});

test('si el flujo ignora el cursor informa carga incompleta y no inventa un total', async () => {
  const app = setup({ repeatCursor: true }); await settle(); await app.choose('A');
  assert.equal(app.nodes.docCount.textContent, 'Carga incompleta');
  assert.match(app.nodes.docsMessage.textContent, /no está avanzando/);
  assert.equal(app.nodes.docPagination.hidden, true);
  assert.equal(app.docCalls().length, 2);
});

test('un fallo puede reintentarse con Actualizar lista', async () => {
  const app = setup({ failOnce: true }); await settle(); await app.choose('A');
  assert.equal(app.nodes.docCount.textContent, 'Carga incompleta');
  await app.nodes.refreshDocs.fire('click'); await settle();
  assert.equal(app.nodes.docCount.textContent, '25 documentos');
});

test('cambiar de ECC durante la descarga descarta la respuesta anterior', async () => {
  const app = setup({ delayA: true }); await settle();
  app.nodes.vECC.value = 'A'; await app.nodes.vECC.fire('change'); await settle();
  await app.choose('B'); await settle();
  assert.equal(app.nodes.docCount.textContent, '1 documento');
  assert.equal(app.radios()[0].value, '00000100');
});
