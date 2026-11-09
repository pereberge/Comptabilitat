<template>
  <section ref="viewer" class="pdf-viewer" aria-label="Visor de la factura PDF">
    <div class="pdf-viewer__toolbar" role="group" aria-label="Controls del PDF">
      <button type="button" class="button button--secondary" :disabled="!documentReady || pageNumber <= 1" aria-label="Pàgina anterior" @click="pageNumber--">←</button>
      <span aria-live="polite">Pàgina {{ pageNumber }} de {{ pageCount || '—' }}</span>
      <button type="button" class="button button--secondary" :disabled="!documentReady || pageNumber >= pageCount" aria-label="Pàgina següent" @click="pageNumber++">→</button>
      <button type="button" class="button button--secondary" :disabled="!documentReady || zoom <= 0.5" aria-label="Reduir zoom" @click="changeZoom(-0.25)">−</button>
      <span>{{ Math.round(zoom * 100) }} %</span>
      <button type="button" class="button button--secondary" :disabled="!documentReady || zoom >= 3" aria-label="Ampliar zoom" @click="changeZoom(0.25)">+</button>
      <button type="button" class="button button--secondary" :disabled="!documentReady" @click="fitWidth">Ajustar amplada</button>
      <button type="button" class="button button--secondary" :disabled="!documentReady" @click="rotation = (rotation + 90) % 360">Girar</button>
      <button v-if="supportsFullscreen" type="button" class="button button--secondary" @click="fullscreen">Pantalla completa</button>
    </div>
    <p v-if="loading" class="pdf-viewer__status" role="status">Carregant PDF…</p>
    <p v-if="error" class="pdf-viewer__status form-error" role="alert">{{ error }}</p>
    <div ref="viewport" class="pdf-viewer__viewport" :aria-busy="loading || rendering">
      <canvas ref="canvas" v-show="documentReady && !error" role="img" :aria-label="`${title}, pàgina ${pageNumber} de ${pageCount}`"></canvas>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl
const props = defineProps({ src: { type: String, required: true }, title: { type: String, default: 'Factura PDF' } })
const viewer = ref(null), viewport = ref(null), canvas = ref(null)
const pageNumber = ref(1), pageCount = ref(0), zoom = ref(1), rotation = ref(0)
const loading = ref(false), rendering = ref(false), error = ref(''), documentReady = ref(false)
const supportsFullscreen = computed(() => Boolean(globalThis.document?.fullscreenEnabled))
let pdf, loadingTask, renderTask, observer, generation = 0, renderGeneration = 0, resizeTimer

async function dispose() {
  renderGeneration++
  const previousRender = renderTask
  renderTask = undefined
  previousRender?.cancel()
  await previousRender?.promise.catch(() => {})
  const previousLoad = loadingTask
  loadingTask = undefined; pdf = undefined
  await previousLoad?.destroy().catch(() => {})
}
async function load() {
  const current = ++generation
  documentReady.value = false; loading.value = true; error.value = ''; pageCount.value = 0
  await dispose()
  if (current !== generation) return
  pageNumber.value = 1; zoom.value = 1; rotation.value = 0
  if (!props.src) { loading.value = false; return }
  try {
    const task = getDocument({ url: props.src, isEvalSupported: false })
    loadingTask = task
    const loaded = await task.promise
    if (current !== generation) return
    pdf = loaded; pageCount.value = loaded.numPages; documentReady.value = true
    await nextTick(); await renderPage()
  } catch (e) {
    if (current === generation) error.value = e.name === 'PasswordException' ? 'Aquest PDF està protegit amb contrasenya i no es pot mostrar al visor.' : 'No s’ha pogut mostrar el PDF. Torna a obrir la factura.'
  } finally { if (current === generation) loading.value = false }
}
async function renderPage() {
  if (!pdf || !canvas.value || !viewport.value) return
  const current = ++renderGeneration, source = pdf
  const previous = renderTask; previous?.cancel()
  await previous?.promise.catch(() => {})
  if (current !== renderGeneration) return
  rendering.value = true
  try {
    const page = await source.getPage(pageNumber.value)
    if (current !== renderGeneration || source !== pdf) return
    const base = page.getViewport({ scale: 1, rotation: (page.rotate + rotation.value) % 360 })
    const availableWidth = Math.max(1, viewport.value.clientWidth - 32)
    const scale = availableWidth / base.width * zoom.value
    const view = page.getViewport({ scale, rotation: (page.rotate + rotation.value) % 360 })
    // Keep large invoices/zoom usable without allocating an unbounded canvas.
    const density = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16000000 / (view.width * view.height)))
    const target = canvas.value
    target.width = Math.floor(view.width * density); target.height = Math.floor(view.height * density)
    target.style.width = `${Math.floor(view.width)}px`; target.style.height = `${Math.floor(view.height)}px`
    const task = page.render({ canvasContext: target.getContext('2d'), viewport: view, transform: [density, 0, 0, density, 0, 0] })
    renderTask = task
    await task.promise
  } catch (e) {
    if (current === renderGeneration && e.name !== 'RenderingCancelledException') error.value = 'No s’ha pogut dibuixar aquesta pàgina del PDF.'
  } finally { if (current === renderGeneration) rendering.value = false }
}
function changeZoom(delta) { zoom.value = Math.min(3, Math.max(0.5, zoom.value + delta)) }
function fitWidth() { zoom.value = 1; void renderPage() }
async function fullscreen() {
  try {
    if (document.fullscreenElement === viewer.value) await document.exitFullscreen()
    else await viewer.value.requestFullscreen()
  } catch { /* The document remains usable if the browser denies fullscreen. */ }
}
watch(() => props.src, load)
watch([pageNumber, zoom, rotation], () => { error.value = ''; void renderPage() })
onMounted(() => {
  observer = new ResizeObserver(() => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => { if (documentReady.value) void renderPage() }, 100)
  })
  observer.observe(viewport.value)
  void load()
})
onBeforeUnmount(() => { generation++; observer?.disconnect(); clearTimeout(resizeTimer); void dispose() })
</script>

<style scoped>
.pdf-viewer{display:flex;flex-direction:column;min-width:0;border:1px solid var(--color-border,#e2e8f0);border-radius:8px;overflow:hidden;background:var(--color-surface,#fff)}
.pdf-viewer__toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px;border-bottom:1px solid var(--color-border,#e2e8f0);font-size:.875rem}.pdf-viewer__toolbar .button{padding:7px 10px;min-height:34px}
.pdf-viewer__viewport{height:75vh;min-height:320px;overflow:auto;padding:16px;background:#e9edf2;box-sizing:border-box}.pdf-viewer__viewport canvas{display:block;margin:0 auto;background:#fff;box-shadow:0 2px 8px #0002;max-width:none}
.pdf-viewer__status{padding:12px;margin:0}.pdf-viewer:fullscreen{border:0;border-radius:0;height:100vh}.pdf-viewer:fullscreen .pdf-viewer__viewport{height:auto;flex:1}
@media(max-width:700px){.pdf-viewer__viewport{height:55vh}.pdf-viewer__toolbar{gap:6px}}
</style>
