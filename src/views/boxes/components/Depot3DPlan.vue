<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import * as THREE from "three"

const props = defineProps({
  boxes: { type: Array, default: () => [] },
  selectedBoxId: { type: String, default: "" },
})

const emit = defineEmits(["select"])

const wrapRef = ref(null)
const canvasRef = ref(null)
const hoveredBox = ref(null)
const joystickKnobStyle = ref({ transform: "translate(-50%, -50%) translate(0px, 0px)" })

let renderer
let scene
let camera
let raycaster
let pointer
let frameId = 0
let resizeObserver
let depotGroup
let boxMeshes = []
let dragStart = null
let cameraTarget = new THREE.Vector3(0, 0, 0)
let cameraZoom = 1
let cameraYaw = 0
let cameraPitch = 1.15
let joystickPointerId = null
let joystickVector = { x: 0, y: 0 }

const PLAN_SCALE = 20
const PLAN_CENTER_X = 587.5
const PLAN_CENTER_Y = 124.5
const DEPOT_WIDTH = 57.5
const DEPOT_DEPTH = 11.9

function planRect(code, x1, y1, x2, y2) {
  return {
    code,
    x: ((x1 + x2) / 2 - PLAN_CENTER_X) / PLAN_SCALE,
    z: ((y1 + y2) / 2 - PLAN_CENTER_Y) / PLAN_SCALE,
    w: (x2 - x1) / PLAN_SCALE,
    d: (y2 - y1) / PLAN_SCALE,
  }
}

const PLAN_SLOTS = [
  planRect("Z", 39, 10, 88, 107),
  planRect("Y", 22, 108, 88, 210),
  planRect("J", 89, 10, 151, 63),
  planRect("A", 89, 132, 153, 210),

  planRect("K", 219, 10, 286, 100),
  planRect("L", 287, 10, 357, 100),
  planRect("M", 358, 10, 432, 100),
  planRect("N", 516, 10, 593, 100),
  planRect("O", 594, 10, 672, 100),
  planRect("P", 673, 10, 746, 100),

  planRect("B", 219, 132, 287, 210),
  planRect("C", 288, 132, 358, 210),
  planRect("D", 359, 132, 432, 210),
  planRect("E", 433, 132, 515, 210),
  planRect("F", 516, 132, 593, 210),
  planRect("G", 594, 132, 672, 210),
  planRect("H", 673, 132, 746, 210),
  planRect("I-2", 747, 132, 820, 171),
  planRect("I-1", 747, 172, 820, 210),

  planRect("17", 219, 211, 287, 239),
  planRect("16", 288, 211, 358, 239),
  planRect("15", 359, 211, 432, 239),
  planRect("14", 433, 211, 515, 239),
  planRect("13", 516, 211, 593, 239),
  planRect("12", 594, 211, 672, 239),
  planRect("11", 673, 211, 746, 239),
  planRect("10", 747, 211, 820, 239),
  planRect("9", 895, 211, 964, 239),
  planRect("8", 965, 211, 1029, 239),
  planRect("7", 1030, 211, 1104, 239),
  planRect("6", 1105, 211, 1169, 239),
]

const STATIC_CELLS = [
  planRect("1", 89, 211, 153, 238),
  planRect("", 747, 10, 820, 100),
  planRect("", 964, 10, 1022, 113),
  planRect("", 1118, 10, 1169, 132),
  planRect("4", 895, 153, 962, 210),
  planRect("5", 963, 153, 1029, 210),
  planRect("1", 1064, 132, 1169, 158),
  planRect("2", 1064, 159, 1169, 185),
  planRect("3", 1064, 186, 1169, 210),
]

const LOGO_CELL = planRect("TRAVEL TO AFRICA", 1023, 16, 1117, 113)
const TOILETS_CELL = planRect("WC", 594, 62, 620, 100)
const RACK_CELL = planRect("RACK", 288, 172, 330, 210)

const INTERACTIVE_SLOTS = [...PLAN_SLOTS, ...STATIC_CELLS.filter((slot) => slot.code)]
const planSlotsByCode = new Map(INTERACTIVE_SLOTS.map((slot) => [codeKey(slot.code), slot]))

const legend = computed(() => [
  { label: "En retard", className: "bg-red-500" },
  { label: "Non loue", className: "bg-amber-500" },
  { label: "Loue", className: "bg-cyan-700" },
  { label: "Disponible", className: "bg-emerald-500" },
  { label: "Maintenance", className: "bg-slate-500" },
  { label: "Autres", className: "bg-purple-500" },
])

function norm(value = "") {
  return String(value || "").trim().toLowerCase()
}

function codeKey(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-")
    .replace(/^(BOXE?|BOX)-?/i, "")
}

function statusColor(status = "") {
  const value = norm(status)
  if (value === "late") return 0xef4444
  if (value === "unrented" || value === "reserved") return 0xf59e0b
  if (value === "available") return 0x10b981
  if (value === "rented") return 0x2563eb
  if (value === "maintenance") return 0x64748b
  return 0x8b5cf6
}

function boxVisualStatus(box = {}) {
  return box.operationalStatus || box.status || "other"
}

function boxDepth(box = {}) {
  const volume = Number(box.volumeM3 || 0)
  if (volume >= 20) return 4.8
  if (volume >= 12) return 4
  if (volume >= 6) return 3.2
  return 2.7
}

function slotForBox(box = {}) {
  const raw = String(box.code || "")
  const direct = planSlotsByCode.get(codeKey(raw))
  if (direct) return direct

  const parts = raw.match(/[A-Z]+-\d+|[A-Z]+|\d+/gi) || []
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const slot = planSlotsByCode.get(codeKey(parts[index]))
    if (slot) return slot
  }

  return null
}

function setupScene() {
  const canvas = canvasRef.value
  const wrap = wrapRef.value
  if (!canvas || !wrap) return

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf8fafc)

  camera = new THREE.OrthographicCamera(-30, 30, 15, -15, 0.1, 1000)
  raycaster = new THREE.Raycaster()
  pointer = new THREE.Vector2()

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const ambient = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 1.4)
  scene.add(ambient)

  const sun = new THREE.DirectionalLight(0xffffff, 2)
  sun.position.set(12, 24, 10)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  scene.add(sun)

  depotGroup = new THREE.Group()
  scene.add(depotGroup)

  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(wrap)

  resize()
  rebuildDepot()
  animate()
}

function resize() {
  if (!renderer || !camera || !wrapRef.value) return
  const rect = wrapRef.value.getBoundingClientRect()
  const width = Math.max(320, rect.width)
  const height = Math.max(360, rect.height)
  renderer.setSize(width, height, false)
  const aspect = width / height
  const baseViewHeight = Math.max(DEPOT_DEPTH + 8, DEPOT_WIDTH / aspect + 4)
  const viewHeight = baseViewHeight / cameraZoom
  const viewWidth = viewHeight * aspect
  camera.left = -viewWidth / 2
  camera.right = viewWidth / 2
  camera.top = viewHeight / 2
  camera.bottom = -viewHeight / 2
  camera.updateProjectionMatrix()
  updateCamera()
}

function updateCamera() {
  if (!camera) return
  const radius = 30
  const horizontalRadius = Math.cos(cameraPitch) * radius
  const offset = new THREE.Vector3(
    Math.sin(cameraYaw) * horizontalRadius,
    Math.sin(cameraPitch) * radius,
    Math.cos(cameraYaw) * horizontalRadius
  )
  camera.position.copy(cameraTarget).add(offset)
  camera.lookAt(cameraTarget)
}

function rebuildDepot() {
  if (!depotGroup) return

  depotGroup.clear()
  boxMeshes = []

  addFloor(DEPOT_WIDTH, DEPOT_DEPTH)
  addWalls(DEPOT_WIDTH, DEPOT_DEPTH)
  addDepotMarkers()

  ;[...PLAN_SLOTS, ...STATIC_CELLS].forEach((cell) => {
    const hasBox = props.boxes.some((box) => slotForBox(box)?.code === cell.code)
    if (!hasBox) addStaticCell(cell)
  })
  addStaticCell(LOGO_CELL, { color: 0x0f172a, labelColor: "#ffffff", height: 1.45 })
  addStaticCell(TOILETS_CELL, { color: 0xbfdbfe, labelColor: "#0b5776", height: 0.72 })
  addStaticCell(RACK_CELL, { color: 0xfacc15, labelColor: "#713f12", height: 1.15 })

  const placedKeys = new Set()
  props.boxes.forEach((box) => {
    const slot = slotForBox(box)
    if (!slot) return
    placedKeys.add(codeKey(slot.code))
    addBoxMesh(box, slot.x, slot.z, slot)
  })
}

function addFloor(width, depth) {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.18, depth),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.85 })
  )
  floor.receiveShadow = true
  floor.position.y = -0.1
  depotGroup.add(floor)

  const entrance = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.45, 0.04, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 })
  )
  entrance.position.set(0, 0.02, depth / 2 - 1.15)
  depotGroup.add(entrance)

  const exit = new THREE.Mesh(
    new THREE.BoxGeometry(3.1, 0.06, 1.15),
    new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 })
  )
  const exitRect = planRect("sortie", 153, 10, 218, 64)
  exit.position.set(exitRect.x, 0.05, exitRect.z)
  depotGroup.add(exit)
}

function addWalls(width, depth) {
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.75 })
  const wallH = 1.65
  addWallSegment(-width / 2 + 2.9, -depth / 2, 5.8, 0.24, wallH, wallMaterial)
  addWallSegment(-width / 2 + 11.7, -depth / 2, 5.3, 0.24, wallH, wallMaterial)
  addWallSegment(-width / 2 + 22.9, -depth / 2, 12.2, 0.24, wallH, wallMaterial)
  addWallSegment(2.7, -depth / 2, 16.3, 0.24, wallH, wallMaterial)
  addWallSegment(width / 2 - 5.2, -depth / 2, 10.4, 0.24, wallH, wallMaterial)

  addWallSegment(-width / 2, -3.4, 0.24, 5.1, wallH, wallMaterial)
  addWallSegment(-width / 2, 3.5, 0.24, 4.9, wallH, wallMaterial)

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.8, depth), wallMaterial)
  rightWall.position.set(width / 2, 0.8, 0)
  rightWall.castShadow = true
  depotGroup.add(rightWall)

  const frontWall = new THREE.Mesh(new THREE.BoxGeometry(width, 1.05, 0.18), wallMaterial)
  frontWall.position.set(0, 0.5, depth / 2)
  frontWall.castShadow = true
  depotGroup.add(frontWall)

  const slantShape = new THREE.Shape()
  slantShape.moveTo(-DEPOT_WIDTH / 2, -DEPOT_DEPTH / 2)
  slantShape.lineTo(-DEPOT_WIDTH / 2 + 1.35, -DEPOT_DEPTH / 2)
  slantShape.lineTo(-DEPOT_WIDTH / 2 + 0.55, DEPOT_DEPTH / 2)
  slantShape.lineTo(-DEPOT_WIDTH / 2 - 0.25, DEPOT_DEPTH / 2)
  slantShape.closePath()
  const slant = new THREE.Mesh(
    new THREE.ShapeGeometry(slantShape),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, side: THREE.DoubleSide, roughness: 0.8 })
  )
  slant.rotation.x = -Math.PI / 2
  slant.position.y = 0.03
  depotGroup.add(slant)
}

function addWallSegment(x, z, w, d, h, material) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  wall.position.set(x, h / 2, z)
  wall.castShadow = true
  wall.receiveShadow = true
  depotGroup.add(wall)
}

function addAisles(width, rows, cellD, aisleEvery, depth) {
  const material = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 })
  for (let row = aisleEvery; row < rows; row += aisleEvery) {
    const aisleOffset = Math.floor(row / aisleEvery) * 2.8
    const z = row * cellD + aisleOffset - depth / 2 + 2
    const aisle = new THREE.Mesh(new THREE.BoxGeometry(width - 2.2, 0.03, 1.3), material)
    aisle.position.set(0, 0.04, z)
    depotGroup.add(aisle)
  }
}

function addDepotMarkers() {
  const centerAisle = new THREE.Mesh(
    new THREE.BoxGeometry(42.8, 0.035, 1.55),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 })
  )
  centerAisle.position.set(-1.4, 0.04, planRect("", 154, 101, 894, 131).z)
  depotGroup.add(centerAisle)

  const leftQuai = new THREE.Mesh(
    new THREE.BoxGeometry(4.1, 0.06, 4.5),
    new THREE.MeshStandardMaterial({ color: 0xbfdbfe, roughness: 0.9, transparent: true, opacity: 0.9 })
  )
  const leftQuaiRect = planRect("quai", 433, 10, 515, 100)
  leftQuai.position.set(leftQuaiRect.x, 0.06, leftQuaiRect.z)
  depotGroup.add(leftQuai)

  const rightQuai = new THREE.Mesh(
    new THREE.BoxGeometry(7.2, 0.04, 1.1),
    new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.9 })
  )
  const rightQuaiRect = planRect("quai", 821, 10, 963, 100)
  rightQuai.position.set(rightQuaiRect.x, 0.06, rightQuaiRect.z)
  depotGroup.add(rightQuai)

  const exitRect = planRect("sortie", 153, 10, 218, 64)
  addStaticLabel("sortie", exitRect.x, exitRect.z - 0.8, "#ef4444", 2.8)
  addStaticLabel("quai", leftQuaiRect.x, leftQuaiRect.z - 1.9, "#ef4444", 2.8)
  addStaticLabel("quai", rightQuaiRect.x, rightQuaiRect.z - 2.7, "#ef4444", 2.8)
}

function addBoxMesh(box, x, z, slot = null) {
  const selected = box.id === props.selectedBoxId
  const height = selected ? 2.25 : 1.8
  const depth = slot?.d || boxDepth(box)
  const width = slot?.w || 2.45
  const material = new THREE.MeshStandardMaterial({
    color: statusColor(boxVisualStatus(box)),
    roughness: 0.62,
    metalness: 0.05,
    emissive: selected ? 0x1d4ed8 : 0x000000,
    emissiveIntensity: selected ? 0.18 : 0,
  })

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
  mesh.position.set(x, height / 2, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.box = box
  boxMeshes.push(mesh)
  depotGroup.add(mesh)

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: selected ? 0x0f172a : 0xffffff, transparent: true, opacity: selected ? 0.9 : 0.45 })
  )
  edge.position.copy(mesh.position)
  depotGroup.add(edge)

  const label = createLabelSprite(box.code || "Box", selected)
  label.position.set(x, height + 0.52, z)
  depotGroup.add(label)
}

function addStaticCell(cell, options = {}) {
  const height = options.height || 0.42
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(cell.w, height, cell.d),
    new THREE.MeshStandardMaterial({
      color: options.color || 0xe5e7eb,
      roughness: 0.8,
      metalness: 0.02,
      transparent: true,
      opacity: options.opacity || 0.88,
    })
  )
  mesh.position.set(cell.x, height / 2, cell.z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  depotGroup.add(mesh)

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.5 })
  )
  edge.position.copy(mesh.position)
  depotGroup.add(edge)

  if (cell.code) {
    const label = createLabelSprite(cell.code, false, {
      background: "rgba(255,255,255,0)",
      border: "rgba(255,255,255,0)",
      color: options.labelColor || "#0f172a",
      font: "800 20px Arial",
      width: Math.max(2.3, Math.min(5, cell.w * 0.65)),
      height: 0.8,
    })
    label.position.set(cell.x, height + 0.48, cell.z)
    depotGroup.add(label)
  }
}

function createLabelSprite(text, selected = false, options = {}) {
  const canvas = document.createElement("canvas")
  canvas.width = 256
  canvas.height = 96
  const ctx = canvas.getContext("2d")
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = options.background || (selected ? "#0f172a" : "#ffffff")
  roundRect(ctx, 18, 18, 220, 54, 14)
  ctx.fill()
  ctx.strokeStyle = options.border || (selected ? "#0f172a" : "#cbd5e1")
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.fillStyle = options.color || (selected ? "#ffffff" : "#0f172a")
  ctx.font = options.font || "700 30px Arial"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(String(text).slice(0, 12), 128, 46)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }))
  sprite.scale.set(options.width || 2.5, options.height || 0.95, 1)
  return sprite
}

function addStaticLabel(text, x, z, color = "#0f172a", width = 2.5, y = 0.18) {
  const label = createLabelSprite(text, false, {
    background: "rgba(255,255,255,0)",
    border: "rgba(255,255,255,0)",
    color,
    font: "800 30px Arial",
    width,
    height: 0.85,
  })
  label.position.set(x, y, z)
  depotGroup.add(label)
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function animate() {
  frameId = requestAnimationFrame(animate)
  if (joystickVector.x || joystickVector.y) {
    cameraYaw += joystickVector.x * 0.012
    cameraPitch = Math.min(1.45, Math.max(0.5, cameraPitch - joystickVector.y * 0.008))
    updateCamera()
  }
  renderer?.render(scene, camera)
}

function updatePointer(event) {
  if (!canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
}

function pickBox(event, commit = false) {
  if (!raycaster || !camera) return
  updatePointer(event)
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(boxMeshes, false)
  hoveredBox.value = hits[0]?.object?.userData?.box || null
  if (commit && hoveredBox.value) emit("select", hoveredBox.value)
}

function onPointerDown(event) {
  dragStart = {
    x: event.clientX,
    y: event.clientY,
    targetX: cameraTarget.x,
    targetZ: cameraTarget.z,
  }
}

function onPointerMove(event) {
  if (dragStart) {
    const dx = event.clientX - dragStart.x
    const dy = event.clientY - dragStart.y
    cameraTarget.x = dragStart.targetX - dx * 0.018 / cameraZoom
    cameraTarget.z = dragStart.targetZ - dy * 0.018 / cameraZoom
    updateCamera()
    return
  }
  pickBox(event)
}

function onPointerUp(event) {
  const moved = dragStart
    ? Math.abs(event.clientX - dragStart.x) + Math.abs(event.clientY - dragStart.y)
    : 0
  dragStart = null
  if (moved < 8) pickBox(event, true)
}

function onWheel(event) {
  event.preventDefault()
  cameraZoom = Math.min(2.4, Math.max(0.45, cameraZoom - event.deltaY * 0.001))
  resize()
}

function resetView() {
  cameraYaw = 0
  cameraPitch = 1.15
  cameraZoom = 1
  cameraTarget.set(0, 0, 0)
  stopJoystick()
  resize()
}

function zoomView(direction = "in") {
  const delta = direction === "in" ? 0.15 : -0.15
  cameraZoom = Math.min(2.4, Math.max(0.45, cameraZoom + delta))
  resize()
}

function panView(direction = "right") {
  const step = 1.2 / cameraZoom
  if (direction === "left") cameraTarget.x -= step
  if (direction === "right") cameraTarget.x += step
  if (direction === "up") cameraTarget.z -= step
  if (direction === "down") cameraTarget.z += step
  updateCamera()
}

function updateJoystick(event) {
  const target = event.currentTarget
  const rect = target.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const max = rect.width * 0.32
  const rawX = event.clientX - centerX
  const rawY = event.clientY - centerY
  const distance = Math.min(max, Math.hypot(rawX, rawY))
  const angle = Math.atan2(rawY, rawX)
  const x = Math.cos(angle) * distance
  const y = Math.sin(angle) * distance

  joystickVector = {
    x: max ? x / max : 0,
    y: max ? y / max : 0,
  }
  joystickKnobStyle.value = {
    transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
  }
}

function startJoystick(event) {
  joystickPointerId = event.pointerId
  event.currentTarget.setPointerCapture?.(event.pointerId)
  updateJoystick(event)
}

function stopJoystick() {
  joystickPointerId = null
  joystickVector = { x: 0, y: 0 }
  joystickKnobStyle.value = { transform: "translate(-50%, -50%) translate(0px, 0px)" }
}

function moveJoystick(event) {
  if (joystickPointerId !== event.pointerId) return
  updateJoystick(event)
}

onMounted(async () => {
  await nextTick()
  setupScene()
})

watch(
  () => [props.boxes, props.selectedBoxId],
  () => rebuildDepot(),
  { deep: true }
)

onBeforeUnmount(() => {
  cancelAnimationFrame(frameId)
  resizeObserver?.disconnect()
  renderer?.dispose()
  scene?.traverse((object) => {
    object.geometry?.dispose?.()
    if (object.material) {
      if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose?.())
      else object.material.dispose?.()
    }
  })
})
</script>

<template>
  <section class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
    <div class="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p class="text-xs font-bold uppercase tracking-wide text-cyan-800">Plan dépôt</p>
        <h3 class="mt-1 text-lg font-bold text-slate-950">Vue 3D interactive</h3>
      </div>
      <div class="flex flex-wrap gap-2">
        <span v-for="item in legend" :key="item.label" class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
          <span class="h-2.5 w-2.5 rounded-full" :class="item.className"></span>
          {{ item.label }}
        </span>
      </div>
    </div>

    <div
      ref="wrapRef"
      class="relative h-[420px] min-h-[360px] bg-slate-50 lg:h-[560px]"
    >
      <canvas
        ref="canvasRef"
        class="block h-full w-full cursor-grab active:cursor-grabbing"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="dragStart = null"
        @wheel="onWheel"
      ></canvas>

      <div class="pointer-events-none absolute left-4 top-4 rounded-lg bg-white/90 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
        Glisser pour déplacer · molette pour zoomer · cliquer un box
      </div>

      <div class="absolute right-4 top-4 rounded-2xl bg-white/95 p-3 shadow-sm ring-1 ring-slate-200">
        <div
          class="relative h-28 w-28 touch-none rounded-full border border-slate-200 bg-slate-100 shadow-inner"
          title="Molette tactile"
          @pointerdown="startJoystick"
          @pointermove="moveJoystick"
          @pointerup="stopJoystick"
          @pointercancel="stopJoystick"
          @pointerleave="stopJoystick"
        >
          <div class="absolute left-1/2 top-2 h-2 w-2 -translate-x-1/2 rounded-full bg-slate-400"></div>
          <div class="absolute bottom-2 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-slate-400"></div>
          <div class="absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-slate-400"></div>
          <div class="absolute right-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-slate-400"></div>
          <div class="absolute left-1/2 top-1/2 h-11 w-11 rounded-full bg-slate-950 shadow-lg ring-4 ring-white" :style="joystickKnobStyle"></div>
        </div>

        <div class="mt-2 grid grid-cols-3 gap-1">
          <button class="h-9 rounded-lg border border-slate-200 text-base font-bold text-slate-700 hover:bg-slate-50" type="button" title="Dézoomer" @click="zoomView('out')">
            -
          </button>
          <button class="h-9 rounded-lg bg-slate-950 text-xs font-bold text-white hover:bg-slate-800" type="button" title="Recentrer" @click="resetView">
            0
          </button>
          <button class="h-9 rounded-lg border border-slate-200 text-base font-bold text-slate-700 hover:bg-slate-50" type="button" title="Zoomer" @click="zoomView('in')">
            +
          </button>
        </div>

        <div class="mt-3 border-t border-slate-200 pt-2">
          <p class="mb-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">Déplacer</p>
          <div class="grid grid-cols-3 gap-1">
            <span></span>
            <button class="h-8 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50" type="button" title="Déplacer en haut" @click="panView('up')">
              H
            </button>
            <span></span>
            <button class="h-8 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50" type="button" title="Déplacer à gauche" @click="panView('left')">
              G
            </button>
            <span></span>
            <button class="h-8 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50" type="button" title="Déplacer à droite" @click="panView('right')">
              D
            </button>
            <span></span>
            <button class="h-8 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50" type="button" title="Déplacer en bas" @click="panView('down')">
              B
            </button>
            <span></span>
          </div>
        </div>
      </div>

      <div v-if="hoveredBox" class="pointer-events-none absolute bottom-4 left-4 max-w-[calc(100%-2rem)] rounded-lg bg-slate-950 px-4 py-3 text-sm text-white shadow-lg">
        <p class="font-bold">{{ hoveredBox.code || "Box" }}</p>
        <p class="mt-1 text-white/75">
          {{ hoveredBox.currentClientName || "Aucun client" }} · {{ Number(hoveredBox.priceMonthly || 0).toLocaleString("fr-FR") }} €/mois
        </p>
      </div>
    </div>
  </section>
</template>
