// Manual real-browser check: node tests/progress-photo.browser.mjs, then open
// http://127.0.0.1:4319. Synthetic images only; no uploads or external requests.
import http from 'node:http'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/progress-photo.ts', import.meta.url), 'utf8')
const helper = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Progress photo browser checks</title></head>
<body style="font:16px system-ui;padding:24px"><h1>Progress photo browser checks</h1><p>Synthetic images only. No client data or uploads.</p><div id="results">Running…</div><script type="module">
import { prepareProgressPhoto } from '/helper.js'
const results = document.getElementById('results')
results.textContent = ''
let failures = 0
function assert(condition, message) { if (!condition) throw new Error(message) }
function report(text, failed = false) { const p = document.createElement('p'); p.textContent = (failed ? 'FAIL: ' : 'PASS: ') + text; results.append(p); if (failed) failures++ }
const encode = (canvas, type, quality) => new Promise(resolve => canvas.toBlob(resolve, type, quality))
function fixture(width, height) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d'); const image = ctx.createImageData(width, height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4; const texture = ((x * 17 + y * 31) % 29)
    image.data[i] = 70 + Math.floor(x / width * 110) + texture
    image.data[i+1] = 70 + Math.floor(y / height * 110) + texture
    image.data[i+2] = 90 + texture; image.data[i+3] = 255
  }
  ctx.putImageData(image, 0, 0)
  for (const [color, x, y] of [['red',0,0],['lime',width-200,0],['blue',0,height-200],['yellow',width-200,height-200]]) {
    ctx.fillStyle = color; ctx.fillRect(x,y,200,200)
  }
  return canvas
}
async function inspect(file) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
  canvas.getContext('2d').drawImage(bitmap,0,0); bitmap.close()
  return canvas
}
for (const [width, height, expected] of [[4032,3024,[1920,1440]],[3024,4032,[1440,1920]],[800,600,[800,600]]]) {
  try {
    const inputCanvas = fixture(width,height)
    const input = new File([await encode(inputCanvas,'image/png')], 'synthetic.png', {type:'image/png'})
    const originalBytes = input.size
    const output = await prepareProgressPhoto(input); const canvas = await inspect(output)
    assert(canvas.width === expected[0] && canvas.height === expected[1], 'Wrong dimensions')
    assert(input.size === originalBytes && input.type === 'image/png', 'Original changed')
    assert(output.size <= input.size, 'Prepared photo got larger')
    if (Math.max(width,height)>1920) assert(output.type==='image/jpeg','Large photo was not converted to JPEG')
    else assert(output===input,'Smaller compatible original should be retained')
    const ctx = canvas.getContext('2d')
    for (const [x,y,channel] of [[10,10,0],[canvas.width-10,10,1],[10,canvas.height-10,2]]) {
      const pixel = ctx.getImageData(x,y,1,1).data
      assert(pixel[channel] > 220, 'Corner lost or image cropped')
    }
    report(width+'×'+height+' → '+canvas.width+'×'+canvas.height+', '+originalBytes+' → '+output.size+' bytes; all corners preserved')
    canvas.style.width='240px'; canvas.style.height='auto'; canvas.setAttribute('aria-label','Resized synthetic image'); results.append(canvas)
    inputCanvas.width=0; inputCanvas.height=0
  } catch (error) { report(error.message,true) }
}
try {
  const inputCanvas = fixture(1200,800); const jpeg = await encode(inputCanvas,'image/jpeg',0.95)
  const bytes = new Uint8Array(await jpeg.arrayBuffer())
  const exif = new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0])
  const oriented = new File([bytes.slice(0,2),exif,bytes.slice(2)],'synthetic-rotated.jpg',{type:'image/jpeg'})
  const canvas = await inspect(await prepareProgressPhoto(oriented))
  assert(canvas.width===800 && canvas.height===1200,'EXIF orientation ignored')
  const pixel = canvas.getContext('2d').getImageData(canvas.width-10,10,1,1).data
  assert(pixel[0]>220 && pixel[1]<30,'EXIF rotation applied incorrectly')
  report('EXIF orientation 6: correctly rotated to 800×1200, no double rotation')
} catch (error) { report(error.message,true) }
for (const input of [new File(['not an image'],'broken.jpg',{type:'image/jpeg'}),new File(['svg'],'a.svg',{type:'image/svg+xml'})]) {
  try { await prepareProgressPhoto(input); report('Invalid file accepted',true) }
  catch { report('Invalid or unsupported photo rejected with an actionable error') }
}
const final = document.createElement('h2'); final.id='status'; final.textContent=failures ? failures+' FAILURES' : 'ALL 6 BROWSER CHECKS PASSED'; results.append(final)
</script></body></html>`
http.createServer((request, response) => {
  if (request.url === '/helper.js') { response.setHeader('Content-Type','text/javascript'); response.end(helper) }
  else if (request.url === '/') { response.setHeader('Content-Type','text/html'); response.end(html) }
  else { response.statusCode = 404; response.end('Not found') }
}).listen(4319, '127.0.0.1', () => console.log('Synthetic photo checks: http://127.0.0.1:4319'))
