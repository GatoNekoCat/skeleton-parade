// The parade, as one SVG string: a synthwave dusk, a neon grid, and a band of
// 3D wireframe skeletons marching in step behind their drum major.
//
// Every skeleton is modelled in 3D (x forward, y up, z toward the viewer) out of
// rings, cones, spheres and knuckled bones, then projected through one fixed
// three-quarter camera into SVG paths. Limbs swing about their true 3D joint axis:
// the keyframes are that rotation carried through the camera as a 2D matrix.
// Everything moves by CSS in the SVG's own <style>; there is no script.

const CYAN = '#3ff3ff'
const PINK = '#ff4fd8'
const VIOLET = '#b98cff'
const GOLD = '#ffd75e'
const BRASS = '#ffeaa0'
const BONE = '#f2fbff'
const DARK = '#0a0118'

// ---------- camera ----------

type V = readonly [number, number, number]
type Line = { pts: V[]; closed?: boolean }

const YAW = (45 * Math.PI) / 180 // the band is turned this far toward the viewer
const PITCH = (18 * Math.PI) / 180 // and seen from this far above
const CY = Math.cos(YAW)
const SY = Math.sin(YAW)
const CP = Math.cos(PITCH)
const SP = Math.sin(PITCH)

const O: V = [0, 0, 0]
// TURN turns the model about the vertical before it is projected (radians;
// positive swings its front toward the viewer), for the colour guard turning
// round to walk backwards mid-toss.
let TURN = 0
const turned = (p: V): V => {
  if (!TURN) {
    return p
  }
  const c = Math.cos(TURN)
  const s = Math.sin(TURN)
  return [p[0] * c - p[2] * s, p[1], p[0] * s + p[2] * c]
}
const sx = (p: V): number => {
  const q = turned(p)
  return q[0] * CY - q[2] * SY
}
const sy = (p: V): number => {
  const q = turned(p)
  return -q[1] * CP + (q[0] * SY + q[2] * CY) * SP
}
/** Builds markup with the model turned `deg` degrees about the vertical. */
const facing = <T>(deg: number, build: () => T): T => {
  TURN = (deg * Math.PI) / 180
  try {
    return build()
  } finally {
    TURN = 0
  }
}
const f = (n: number): string => String(Math.round(n * 10) / 10).replace(/^(-?)0./, '$1.')
const xy = (p: V, o: V = O): string => `${f(sx(p) - sx(o))} ${f(sy(p) - sy(o))}`
const at = (p: V): string => `translate(${f(sx(p))},${f(sy(p))})`

/** Numbers as SVG path data, as short as they go: no leading zero, no separator before a sign or a second point. */
const nums = (ns: readonly number[]): string => {
  let out = ''
  let prev = ''
  for (const n of ns) {
    const t = f(n).replace(/^(-?)0./, '$1.')
    out += prev && !t.startsWith('-') && !(t.startsWith('.') && prev.includes('.')) ? ` ${t}` : t
    prev = t
  }
  return out
}
/** Lines to one path's `d`, drawn relative to `o`: each line a move, then relative steps between rounded points. */
const d = (lines: readonly Line[], o: V = O): string =>
  lines
    .map(l => {
      const pts = l.pts.map(p => [Math.round((sx(p) - sx(o)) * 10) / 10, Math.round((sy(p) - sy(o)) * 10) / 10] as const)
      const first = pts[0] ?? [0, 0]
      const steps: number[] = []
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1] ?? first
        const b = pts[i] ?? first
        steps.push(b[0] - a[0], b[1] - a[1])
      }
      return `M${nums(first)}${steps.length ? `l${nums(steps)}` : ''}${l.closed ? 'z' : ''}`
    })
    .join('')

// ---------- vectors and primitives ----------

const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s]
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V): V => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1))
const pick = (pts: readonly V[], i: number): V => pts[((i % pts.length) + pts.length) % pts.length] ?? O
const seg = (...pts: V[]): Line => ({ pts })

/** An ellipse around `c` with semi-axes `u` and `v`. */
const ell = (c: V, u: V, v: V, n = 10): Line => ({
  closed: true,
  pts: Array.from({ length: n }, (_, i) => {
    const t = (i / n) * 2 * Math.PI
    return add(c, add(mul(u, Math.cos(t)), mul(v, Math.sin(t))))
  }),
})

/** A level ring: `rx` front to back, `rz` side to side. */
const ring = (c: V, rx: number, rz: number, n = 10): Line => ell(c, [rx, 0, 0], [0, 0, rz], n)

const basis = (axis: V): [V, V] => {
  const a = norm(axis)
  const u = norm(cross(a, Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
  return [u, cross(a, u)]
}

/** Two rings joined by spars: a tube, a bell, a hat. */
const cone = (a: V, b: V, ra: number, rb: number, n = 8, spars = 4): Line[] => {
  const [u, v] = basis(sub(b, a))
  const r1 = ell(a, mul(u, ra), mul(v, ra), n)
  const r2 = ell(b, mul(u, rb), mul(v, rb), n)
  const out = [r1, r2]
  for (let i = 0; i < spars; i++) {
    const k = Math.round((i * n) / spars)
    out.push(seg(pick(r1.pts, k), pick(r2.pts, k)))
  }
  return out
}

/** Rings stacked up an axis and joined by spars: a lathed shell. */
const lathe = (rings: readonly Line[], spars: number): Line[] => {
  const out = [...rings]
  const n = rings[0]?.pts.length ?? 0
  for (let i = 0; i < spars; i++) {
    const k = Math.round((i * n) / spars)
    out.push({ pts: rings.map(r => pick(r.pts, k)) })
  }
  return out
}

const sphere = (c: V, r: number, n = 12): Line[] => {
  const out: Line[] = [ring(c, r, r, n)]
  for (const h of [-0.58, 0.58]) {
    const rr = r * Math.sqrt(1 - h * h)
    out.push(ring(add(c, [0, r * h, 0]), rr, rr, n))
  }
  for (const deg of [0, 60, 120]) {
    const t = (deg * Math.PI) / 180
    out.push(ell(c, [0, r, 0], [r * Math.cos(t), 0, r * Math.sin(t)], n))
  }
  return out
}

const box = (a: V, b: V): Line[] => {
  const c = (i: number, j: number, k: number): V => [i ? b[0] : a[0], j ? b[1] : a[1], k ? b[2] : a[2]]
  return [
    { pts: [c(0, 0, 0), c(1, 0, 0), c(1, 0, 1), c(0, 0, 1)], closed: true },
    { pts: [c(0, 1, 0), c(1, 1, 0), c(1, 1, 1), c(0, 1, 1)], closed: true },
    seg(c(0, 0, 0), c(0, 1, 0)),
    seg(c(1, 0, 0), c(1, 1, 0)),
    seg(c(1, 0, 1), c(1, 1, 1)),
    seg(c(0, 0, 1), c(0, 1, 1)),
  ]
}

/** The outline of a shape as seen: the convex hull of its projected points. */
const hull = (lines: readonly Line[]): string => {
  const pts = lines
    .flatMap(l => l.pts)
    .map(p => [sx(p), sy(p)] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const turn = (o: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: readonly (readonly [number, number])[]): (readonly [number, number])[] => {
    const out: (readonly [number, number])[] = []
    for (const p of list) {
      for (;;) {
        const a = out[out.length - 2]
        const b = out[out.length - 1]
        if (a === undefined || b === undefined || turn(a, b, p) > 0) {
          break
        }
        out.pop()
      }
      out.push(p)
    }
    out.pop()
    return out
  }
  const loop = [...half(pts), ...half([...pts].reverse())]
  return `M${loop.map(p => `${f(p[0])} ${f(p[1])}`).join('L')}z`
}

const path = (lines: readonly Line[], attrs = '', o: V = O): string => `<path${attrs ? ` ${attrs}` : ''} d="${d(lines, o)}"/>`

// LIGHT draws the same figures with fewer lines, for the small far files:
// one shaft a long bone, plain knuckles, fewer ribs and vertebrae.
let LIGHT = false
const lightly = <T>(build: () => T): T => {
  const was = LIGHT
  LIGHT = true
  try {
    return build()
  } finally {
    LIGHT = was
  }
}

// ---------- the skeleton ----------
// Anatomy, not a mannequin: long bones are thin shafts with a knob at each
// end, forearms and shins are twin bones, the ribs hang off a spine of
// separate vertebrae, and nothing but that spine crosses the waist.

// What makes a skeleton read at a glance, behind a veil and at backdrop size:
// a big skull with a clean outline and dark eye holes, separate ribs on a
// beaded spine, a butterfly pelvis, and long bones that are a shaft with a knob
// at each end. So each bone is a few bold strokes, and the wire that only
// muddied the read (construction rings, triple shafts, the wired cranium) is gone.

// The direction the camera looks along, in the model's own frame (it turns
// with TURN), and the side of a bone that faces the camera.
const VIEW: V = norm([SY, SP / CP, CY])
const viewDir = (): V => {
  const c = Math.cos(TURN)
  const s = Math.sin(TURN)
  return [VIEW[0] * c + VIEW[2] * s, VIEW[1], -VIEW[0] * s + VIEW[2] * c]
}
const sideOf = (axis: V): V => {
  const s = cross(axis, viewDir())
  return Math.hypot(s[0], s[1], s[2]) < 1e-6 ? basis(axis)[0] : norm(s)
}
/** A knob: a little ring around `c` facing the camera. */
const knob = (c: V, r: number, n: number): Line => {
  const w = viewDir()
  const [u, v] = basis(w)
  return ell(c, mul(u, r), mul(v, r), n)
}
/** The outline of an ellipsoid as the camera sees it (its silhouette), as a closed line. */
const contour = (c: V, a: number, b: number, cc: number, n: number): Line => {
  const w = viewDir()
  const m = norm([w[0] / a, w[1] / b, w[2] / cc])
  const e1 = norm(cross(m, Math.abs(m[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
  const e2 = cross(m, e1)
  return {
    closed: true,
    pts: Array.from({ length: n }, (_, i) => {
      const t = (i / n) * 2 * Math.PI
      const q = add(mul(e1, Math.cos(t)), mul(e2, Math.sin(t)))
      return add(c, [a * q[0], b * q[1], cc * q[2]])
    }),
  }
}

/** A long bone: a shaft of two strokes from `a` to `b`, a knob at each end. */
const limb = (a: V, b: V, shaft = 1.5, r = 3.6): Line[] => {
  const s = sideOf(norm(sub(b, a)))
  if (LIGHT) {
    return [seg(a, b), knob(a, r * 0.8, 4), knob(b, r * 0.8, 4)]
  }
  return [seg(add(a, mul(s, shaft)), add(b, mul(s, shaft))), seg(add(a, mul(s, -shaft)), add(b, mul(s, -shaft))), knob(a, r, 6), knob(b, r, 6)]
}

/** A forearm or a shin: two thin bones side by side, a knob at the far end. */
const twin = (a: V, b: V, r = 3.2): Line[] => {
  const s = sideOf(norm(sub(b, a)))
  const pair = [-1, 1].map(side => seg(add(a, mul(s, side * 2)), add(b, mul(s, side * 1.5))))
  return LIGHT ? pair : [...pair, knob(b, r * 0.8, 5)]
}

/** Finger or toe bones splayed from a wrist or ankle along `dir`. */
const digits = (root: V, dir: V, spread: V, len: number, count = 3): Line[] => {
  const n = LIGHT ? 2 : Math.min(count, 3)
  return Array.from({ length: n }, (_, i) => {
    const s = n === 1 ? 0 : (i / (n - 1)) * 2 - 1
    const tip = add(root, add(mul(dir, len), mul(spread, s)))
    return LIGHT ? seg(root, tip) : seg(root, add(root, add(mul(dir, len * 0.55), mul(spread, s * 0.6))), tip)
  })
}

/** Is a point on the model's side `z` turned away from the camera? */
const isAway = (z: number): boolean => turned([0, 0, z])[2] < 0

const HIP_Y = 92
const LIMB = 46
// The head rides a short neck above the shoulders: skull and hat are drawn
// at their modelled height and lifted by NECK as one, so the mouth is too.
const NECK_Y = 4
const MOUTH: V = [19, 168 + NECK_Y, 0]
const NECK = `<g transform="${at([0, NECK_Y, 0])}">`

// The walk is baked, not rigged: each pose of the step is drawn as static
// legs, the femur turned at the hip and the shin at the knee about the body's
// side-to-side axis, and the poses are flipped through like a flip-book.
const KNEE: V = [0, -LIMB, 0]
const femur = (): Line[] => [
  ...limb(O, KNEE, 1.7, 4.2),
  // the kneecap, riding in front of the joint
  ell([5, -LIMB + 1.5, 0], [0, 3.4, 0], [0, 0, 2.6], LIGHT ? 4 : 6),
]
// In the shin's own frame the knee is the origin.
const shin = (): Line[] => [
  ...twin(O, KNEE),
  // the foot: toes splayed down to the ground, and a heel bone behind the ankle
  ...digits(KNEE, [1, -0.2, 0], [0, 0, 4.6], 16, 4),
  ell([-3.5, -LIMB - 2, 0], [3.2, 0.6, 0], [0, 2.1, 0], LIGHT ? 4 : 6),
]
const rotZ = (p: V, deg: number): V => {
  const t = (deg * Math.PI) / 180
  return [p[0] * Math.cos(t) - p[1] * Math.sin(t), p[0] * Math.sin(t) + p[1] * Math.cos(t), p[2]]
}
const moved = (lines: readonly Line[], fn: (p: V) => V): Line[] => lines.map(l => ({ closed: l.closed, pts: l.pts.map(fn) }))

/** One leg at the hip on side `z`, the thigh at `th` degrees and the knee bent `sh` more. */
const legLines = (z: number, th: number, sh: number): Line[] => {
  const hip: V = [2, HIP_Y, z]
  return [
    ...moved(femur(), p => add(hip, rotZ(p, th))),
    ...moved(shin(), p => add(hip, rotZ(add(KNEE, rotZ(p, sh)), th))),
  ]
}

/** An arc of the jaw line: around the front of the face at height `y`. */
const jawArc = (y: number, r: number, rz: number, reach = 70): V[] =>
  [-reach, -reach * 0.72, -reach * 0.43, -reach * 0.14, reach * 0.14, reach * 0.43, reach * 0.72, reach].map(deg => {
    const t = (deg * Math.PI) / 180
    return [2 + r * Math.cos(t), y, rz * Math.sin(t)] as V
  })

// The cranium: an egg, longer front to back than side to side, its wires kept
// to the vault and the back of the head so the face below the brow stays open.
const CRAN: V = [-1, 188, 0]
const CA = 19 // half length, front to back
const CB = 16 // half height
const CC = 15 // half width
const deg = (n: number): number => (n * Math.PI) / 180
const arcPts = (from: number, to: number, n: number, at: (t: number) => V): V[] =>
  Array.from({ length: n + 1 }, (_, i) => at(deg(from + ((to - from) * i) / n)))
/** A level line round the cranium at height `y`, from `from`° to `to`° (0° is the face). */
const level = (y: number, from: number, to: number, n: number): Line => {
  const k = Math.sqrt(Math.max(0, 1 - ((y - CRAN[1]) / CB) ** 2))
  return { pts: arcPts(from, to, n, t => [CRAN[0] + CA * k * Math.cos(t), y, CC * k * Math.sin(t)]) }
}
/** An arc over the top of the cranium from ear to ear, `x` from the centre. */
const coronal = (x: number): Line => {
  const k = Math.sqrt(1 - (x / CA) ** 2)
  return { pts: arcPts(-25, 205, 8, t => [CRAN[0] + x, CRAN[1] + CB * k * Math.sin(t), CC * k * Math.cos(t)]) }
}

// The far leg and arm, dimmed per path.
const DIM = 'stroke-opacity=".5" stroke-width="1.2"'

const UPPER_TEETH = jawArc(171, 16, 11.5)
const LOWER_TEETH = jawArc(165, 15.5, 11)
const CHIN = jawArc(159, 13, 9.5, 55)

// Bold outlines (skull, jaw, sternum, pelvis) carry the shape; the skull's
// outline is filled dark so what is behind it does not show through; detail
// strokes inside it are a style of their own (drawn after that fill); the eye
// holes and nose are dark fills on top.
const BOLD = 'stroke-width="1.8"'
const SKULL_FILL = `stroke-width="1.8" fill="${DARK}" fill-opacity=".55"`
const DETAIL = 'stroke-linejoin="round"'
const JAW = 'stroke-width="1.7"'
// the cranium outline sits a little high, so the face and jaw show below it
const SKULL_C: V = [CRAN[0], CRAN[1] + 2, CRAN[2]]
const HOLES = `fill="${DARK}"`

// The skull is drawn a little larger than life, about the mouth.
const SKULL_K = 1.15
const SKULL_AT: V = [6, 172, 0]
const big = (lines: readonly Line[]): Line[] => moved(lines, p => add(SKULL_AT, mul(sub(p, SKULL_AT), SKULL_K)))

const skull = (): string => {
  const holes = big([
    ...[-1, 1].map(s => ell([16.2, 182, s * 6.2], [0, 6.6, 0], [-s * 1.4, 0, 5.6], LIGHT ? 6 : 8)),
    // the nasal notch, wide at the bottom
    { pts: [[19, 178.5, 0], [18.4, 172, -3], [18.8, 171.2, 0], [18.4, 172, 3]], closed: true },
  ])
  if (LIGHT) {
    return (
      path(big([contour(SKULL_C, CA, CB - 1, CC, 10)]), SKULL_FILL) +
      path(big([seg(...UPPER_TEETH), seg(...CHIN), ...[-1, 1].map(s => seg(pick(CHIN, s < 0 ? 0 : 7), [0, 163, s * 10.5], [-2, 176, s * 12]))]), JAW) +
      path(holes, HOLES)
    )
  }
  return (
    // the cranium as the camera sees it, a clean filled outline
    path(big([contour(SKULL_C, CA, CB - 1, CC, 16)]), SKULL_FILL) +
    path(
      big([
        // the brow over the eyes, the cheekbones, the line of the upper teeth and each tooth
        level(188.5, -50, 50, 4),
        ...[-1, 1].map(s => seg([16.5, 177, s * 10], [7, 177, s * 14], [-2, 177, s * 13])),
        seg(...UPPER_TEETH),
        ...UPPER_TEETH.slice(1, 7).map((p, i) => seg(p, pick(LOWER_TEETH, i + 1))),
        seg(...LOWER_TEETH),
      ]),
      DETAIL,
    ) +
    // the jaw: chin, and a ramus up to each ear
    path(big([seg(...CHIN), ...[-1, 1].map(s => seg(pick(CHIN, s < 0 ? 0 : 7), [0, 163, s * 10.5], [-2, 176, s * 12]))]), JAW) +
    path(holes, HOLES)
  )
}

// The spine: one bead a vertebra, chunkier at the waist, from the sacrum up into the skull.
const SPINE_STOPS: readonly (readonly [number, number])[] = [
  [104, -6],
  [114, -4],
  [126, -8],
  [140, -12],
  [156, -9],
  [168, -3],
]
const spineX = (y: number): number => {
  for (let i = 1; i < SPINE_STOPS.length; i++) {
    const a = SPINE_STOPS[i - 1]
    const b = SPINE_STOPS[i]
    if (a !== undefined && b !== undefined && y <= b[0]) {
      return a[1] + ((b[1] - a[1]) * (y - a[0])) / (b[0] - a[0])
    }
  }
  return -3
}
const beads = (step: number): Line[] => {
  const out: Line[] = []
  for (let y = 106; y <= 172; y += step) {
    out.push(knob([spineX(y), y, 0], y < 130 ? 3.4 : 2.4, 4))
  }
  return out
}

// The sternum's front edge at height `y`.
const sternumX = (y: number): number => 10.5 + ((154 - y) * 5) / 21

// Ribs leave the spine, sweep round and slope down to the sternum, one curve a
// side, evenly spaced with daylight between them; the lowest floats free. The
// far side's ribs are dimmed so the near ones read in front.
const ribs = (rows: readonly (readonly [number, number, number, boolean])[], n: number): string => {
  const side = (far: boolean): Line[] =>
    rows.flatMap(([y, rx, rz, floating]) =>
      [-1, 1]
        .filter(s => isAway(s) === far)
        .map(s => {
          const pts = arcPts(180, floating ? 62 : 22, n, t => [1 + rx * Math.cos(t), y - 5 * Math.cos(t), s * rz * Math.sin(t)] as V)
          if (!floating) {
            pts.push([sternumX(y - 3), y - 3, s * 2.4])
          }
          return { pts }
        }),
    )
  return path(side(true), DIM) + path(side(false))
}

// The pelvis as a butterfly: an iliac wing each side, the sacrum between, the
// pubic arch below.
const pelvis = (): Line[] => [
  ...[-1, 1].map(s => ({ pts: [[-7, 104, s * 5], [-3, 110, s * 13], [5, 109, s * 19], [9, 101, s * 16], [5, 93, s * 11], [-6, 97, s * 5]] as V[], closed: !LIGHT })),
  { pts: [[-7, 105, -6], [-7, 105, 6], [-9, 91, 0]], closed: true },
  ...(LIGHT ? [] : [seg([5, 92, -11], [9, 85, -3], [9, 85, 3], [5, 92, 11])]),
]

const SH_NEAR: V = [0, 158, 25]
const SH_FAR: V = [0, 158, -25]

const torso = (): string =>
  ribs(LIGHT ? [[154, 11, 18, false], [142, 14, 24, false], [130, 12, 21, true]] : [[155, 10, 17, false], [147, 13, 22, false], [139, 14, 24, false], [131, 13, 23, false], [124, 11, 20, true]], LIGHT ? 3 : 5) +
  path([
    ...beads(LIGHT ? 11 : 5.5),
    // collarbones, from the top of the sternum out to each shoulder
    seg([10.5, 155, 0], [4, 159, 12], SH_NEAR),
    seg([10.5, 155, 0], [4, 159, -12], SH_FAR),
  ]) +
  path([{ pts: [[10.5, 155, -3], [10.5, 155, 3], [15.5, 133, 2], [15.5, 133, -2]], closed: true }, ...pelvis()], BOLD)

const SKULL = skull()
const TORSO = torso()


// The far arm is dimmed behind the body, so it is drawn with the light bones.
const arm = (shoulder: V, elbow: V, hand: V, isFar = false): string => {
  const reach = norm(sub(hand, elbow))
  const [, v] = basis(reach)
  const lines = (): Line[] => [...limb(shoulder, elbow, 1.4, 3.4), ...twin(elbow, hand, 2.8), ...digits(hand, reach, mul(v, 4), 9, 4)]
  return path(isFar ? lightly(lines) : lines(), isFar ? DIM : '')
}

const HAT_BASE: V = [2, 202, 0]

const brim = (r: number): Line => ({
  pts: [-70, -35, 0, 35, 70].map(deg => {
    const t = (deg * Math.PI) / 180
    return add(HAT_BASE, [r * Math.cos(t), 0, r * Math.sin(t)])
  }),
})

const plume = (base: V, pts: readonly V[], attrs: string): string =>
  `<g transform="${at(base)}"><path ${attrs} d="${d([{ pts: [base, ...pts] }], base)}"/></g>`

// Figures are drawn once in <defs> and stamped out with <use>, so their colours
// come from the <use>: bone is the inherited stroke, the hat is currentColor,
// and the feather is the --f custom property (see the file classes in STYLE).
const shako = (): string =>
  path([...cone(HAT_BASE, [2, 221, 0], 10, 8.5, LIGHT ? 6 : 8, LIGHT ? 2 : 4), brim(14.5)], 'stroke="currentColor"') +
  plume([2, 221, 0], [[0, 233, 0], [4, 243, 0], [11, 248, 0]], 'class="fe" stroke-width="1.9"')

// The colour guard wear no shako: a headband round the temple and a short plume behind.
const headband = (): string =>
  path([level(193, 0, 360, 10)], 'stroke="currentColor" stroke-width="1.8"') +
  plume([-12, 196, 0], [[-17, 205, 0], [-15, 216, 0], [-9, 222, 0]], 'class="fe" stroke-width="1.9"')

type Horn = 'trumpet' | 'trombone' | 'horn' | 'sousaphone'
type Kind = Horn | 'flute' | 'clarinet' | 'sax' | 'drum'

const doot = (bell: V, x: number, word = 'doot'): string =>
  `<text x="${f(sx(bell) + 8 + x)}" y="${f(sy(bell) - 24)}">${word}</text>`

// Brass is drawn hot and pale; the glow round it comes out gold. Flutes and
// clarinet keys are silver; a clarinet's body is dark wood, its outline in the
// file's own violet-dark.
const gold = (lines: readonly Line[], cls = ''): string => path(lines, `${cls ? `class="${cls}" ` : ''}stroke="${BRASS}"`)
const SILVER = '#e6f2ff'
const silver = (lines: readonly Line[], w = ''): string => path(lines, `stroke="${SILVER}"${w ? ` stroke-width="${w}"` : ''}`)
const WOOD = '#5a3f8a'
/** Fewer facets on the light bodies' instruments. */
const facets = (n: number): number => (LIGHT ? Math.max(4, Math.round(n * 0.6)) : n)
const spars = (n: number): number => (LIGHT ? Math.min(n, 2) : n)

// The drummer's sticks are drawn on groups of their own (they beat), from the hand.
const STICK_HANDS: readonly [V, V] = [[18, 122, -9], [20, 121, 9]]
const STICK = (hand: V): Line[] => [seg(add(hand, [-3, 2, 0]), add(hand, [15, -12, hand[2] < 0 ? 5 : -5]))]

// Each instrument: the far arm, the instrument and the near arm. Doots, the
// trombone's slide and the drumsticks are drawn on layers of their own.
const horns = (): Record<Kind, string> => ({
  trumpet:
    arm(SH_FAR, [14, 138, -30], [38, 166, -5], true) +
    gold([
      seg(MOUTH, [66, 168, 0]),
      ...cone([64, 168, 0], [92, 168, 0], 1.5, 11, facets(8), spars(4)),
      { pts: [[34, 168, 0], [34, 160, 0], [60, 160, 0], [60, 168, 0]] },
      ...(LIGHT ? [] : [seg([41, 168, 0], [41, 177, 0]), seg([47, 168, 0], [47, 177, 0]), seg([53, 168, 0], [53, 177, 0])]),
    ]) +
    arm(SH_NEAR, [16, 136, 30], [47, 166, 5]),
  trombone:
    arm(SH_FAR, [14, 140, -30], [28, 172, -12], true) +
    gold([
      seg(MOUTH, [34, 168, 4]),
      seg([6, 176, -14], [-2, 172, -10], [8, 168, -4], MOUTH),
      seg([6, 176, -14], [74, 176, -14]),
      ...cone([72, 176, -14], [108, 176, -14], 2, 13, facets(8), spars(4)),
    ]) +
    arm(SH_NEAR, [22, 138, 30], [52, 164, 6]),
  horn:
    arm(SH_FAR, [10, 134, -28], [24, 150, 2], true) +
    gold([
      seg(MOUTH, [24, 160, 5], [28, 156, 10]),
      ell([28, 141, 10], [15, 0, 0], [0, 15, 0], facets(12)),
      ...(LIGHT ? [] : [ell([28, 141, 10], [12, 0, 0], [0, 12, 0], 10)]),
      ell([28, 141, 10], [8, 0, 0], [0, 8, 0], facets(8)),
      ...cone([36, 131, 12], [26, 113, 28], 3, 14, facets(8), spars(4)),
    ]) +
    arm(SH_NEAR, [10, 130, 32], [36, 137, 16]),
  sousaphone:
    arm(SH_FAR, [12, 138, -28], [26, 150, -12], true) +
    gold([
      ell([-2, 134, 2], [0, 34, -30], [32, 0, 0], facets(14)),
      ...(LIGHT ? [] : [ell([-2, 134, 2], [0, 28.9, -25.5], [27.2, 0, 0], 14)]),
      seg([-2, 168, -28], [-14, 206, -24], [-10, 238, -10], [2, 250, 0]),
    ]) +
    gold([...cone([2, 250, 0], [26, 258, 0], 7, 32, facets(12), spars(6)), ...(LIGHT ? [] : cone([12, 253.3, 0], [18, 255.3, 0], 13, 22, 12, 0))]) +
    arm(SH_NEAR, [14, 136, 31], [29, 140, 14]),
  // A flute held level out to the player's right, both hands up: a thin silver
  // tube with a lip plate at the mouth and a few keys.
  flute:
    arm(SH_FAR, [14, 146, -24], [21, 170, 4], true) +
    silver([
      ...cone([20, 173, -6], [12, 177, 46], 1.5, 1.3, 4, LIGHT ? 0 : 2),
      ell([20.5, 173, 0], [1.4, 0, 0], [0, 0, 3], LIGHT ? 4 : 6),
      ...(LIGHT ? [] : [14, 22, 30, 38].map(z => seg(lerp([20, 173, -6], [12, 177, 46], (z + 6) / 52), add(lerp([20, 173, -6], [12, 177, 46], (z + 6) / 52), [0, 2.4, 0])))),
    ]) +
    arm(SH_NEAR, [14, 150, 36], [15, 175, 34]),
  // A clarinet from the mouth down and forward at about 40 degrees, both hands
  // on it: a dark wooden body, bright key rings, a flared bell.
  clarinet:
    arm(SH_FAR, [12, 140, -24], [30, 160, -2], true) +
    path(cone([20, 170, 0], [48, 140, 0], 1.6, 1.9, 4, LIGHT ? 0 : 2), `stroke="${WOOD}" stroke-width="2"`) +
    silver([
      ...cone([48, 140, 0], [55, 132, 0], 2, 5.5, facets(8), spars(4)),
      ...(LIGHT ? [] : [0.3, 0.5, 0.7].map(t => ring(lerp([20, 170, 0], [48, 140, 0], t), 2.2, 2.2, 5))),
    ]) +
    arm(SH_NEAR, [14, 134, 30], [40, 150, 3]),
  // An alto saxophone: a curved neck from the mouth, the body hanging across
  // the chest on a neck strap, a U-bow at the hip and an upturned bell.
  sax:
    arm(SH_FAR, [12, 138, -26], [24, 146, 6], true) +
    path([{ pts: [[28, 163, 6], [24, 150, 8], [18, 134, 10], [12, 118, 11], [10, 110, 12], [14, 106, 13], [20, 109, 13], [24, 118, 13]] }], `stroke="${BRASS}" stroke-width="3"`) +
    gold([
      seg(MOUTH, [26, 170, 3], [28, 163, 6]),
      { pts: [[28, 163, 6], [24, 150, 8], [18, 134, 10], [12, 118, 11], [10, 110, 12], [14, 106, 13], [20, 109, 13], [24, 118, 13]] },
      { pts: [[31, 163, 6], [27, 150, 8], [21, 134, 10], [15, 118, 11]] },
      ...cone([24, 118, 13], [29, 130, 13], 3, 7.5, facets(8), spars(4)),
      ...(LIGHT ? [] : [0.25, 0.45, 0.65].map(t => ring(lerp([28, 163, 6], [12, 118, 11], t), 2.6, 2.6, 5))),
    ]) +
    path([seg([2, 168, -6], [16, 158, 4], [27, 160, 6]), seg([2, 168, 6], [27, 160, 6])], `stroke="${CYAN}" stroke-opacity=".6"`) +
    arm(SH_NEAR, [12, 132, 30], [20, 130, 12]),
  // A snare drum on a harness at the waist: the shell in the file's colour,
  // brass rims, the straps over the shoulders. The sticks beat on their own.
  drum:
    arm(SH_FAR, [6, 132, -26], STICK_HANDS[0], true) +
    path(
      [ring([25, 113, 0], 14, 14, facets(12)), ring([25, 103, 0], 14, 14, facets(12)), ...(LIGHT ? [] : [0, 90, 180, 270, 45, 135, 225, 315].map(a => seg([25 + 14 * Math.cos(deg(a)), 113, 14 * Math.sin(deg(a))], [25 + 14 * Math.cos(deg(a)), 103, 14 * Math.sin(deg(a))])))],
      'stroke="currentColor"',
    ) +
    gold([ring([25, 113.5, 0], 14.6, 14.6, facets(12))]) +
    path([seg(SH_NEAR, [14, 140, 14], [24, 113, 11]), seg(SH_FAR, [14, 140, -14], [24, 113, -11])], `stroke="${CYAN}" stroke-opacity=".6"`) +
    arm(SH_NEAR, [6, 132, 26], STICK_HANDS[1]),
})
const BELLS: Record<Kind, V> = {
  trumpet: [92, 174, 0],
  trombone: [108, 184, -14],
  horn: [44, 150, 10],
  sousaphone: [40, 282, 0],
  flute: [12, 190, 46],
  clarinet: [55, 140, 0],
  sax: [29, 140, 13],
  drum: [24, 136, 0],
}
const SLIDE_LINES: Line[] = [{ pts: [[32, 171, 4], [100, 171, 4], [100, 162, 4], [32, 162, 4]] }]

// ---------- how it is drawn ----------
// The host draws this as one plain SVG. Chromium hands a CSS animation of
// transform or opacity on a plain SVG group to its compositor, which moves the
// already-painted group without the page doing any work; but one animation of
// anything else (visibility, a geometry property) makes the page redo style
// and repaint the whole drawing every frame. So every animation here is a
// transform or an opacity on a group whose contents never change, and nothing
// inside a <use> or a filter animates.
//
// The band marches in step, so the walk is a flip-book: K poses of the legs on
// a film strip, stepped through by one transform. And every animation steps on
// one shared clock, TICK times a second, holding still in between, so the
// compositor has a new picture to make only TICK times a second.

const TICK = 20 // pictures a second
const STEP_EVERY = 0.1 // keyframes of the step this far apart, stepped on the tick between

const angleAt = (stops: readonly (readonly [number, number])[], pct: number): number => {
  const p = ((pct % 100) + 100) % 100
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]
    const b = stops[i]
    if (a !== undefined && b !== undefined && p <= b[0]) {
      return a[1] + ((b[1] - a[1]) * (p - a[0])) / (b[0] - a[0])
    }
  }
  return stops[stops.length - 1]?.[1] ?? 0
}
// A high step: the thigh drives up and forward, the shin folds under it.
const THIGH: readonly (readonly [number, number])[] = [[0, -22], [30, 78], [50, 20], [100, -22]]
const SHIN_BEND: readonly (readonly [number, number])[] = [[0, -12], [15, -70], [30, -88], [50, 0], [100, -12]]



// The colour guard: both fists on a pole, which spins about the grip on a
// layer of its own; arms up to catch it; arms down while it is in the air.
const GRIP: V = [30, 140, 6]
const CATCH: V = [23, 222, 0]
const armsHold = (): string => arm(SH_FAR, [8, 131, -26], add(GRIP, [-2, -2, -4]), true) + arm(SH_NEAR, [12, 128, 28], GRIP)
const armsUp = (): string => arm(SH_FAR, [10, 186, -24], [22, 222, -5], true) + arm(SH_NEAR, [12, 184, 24], [24, 222, 5])
const armsDown = (): string =>
  [-1, 1].map(s => arm([0, 158, s * 25], [-2, 128, s * 29], [4, 104, s * 25], isAway(s))).join('')
const guardBody = (): string => `${torso()}${NECK}${skull()}${headband()}</g>`
/** The guard turned part way round, mid-turn: standing legs, arms down. */
const guardTurned = (deg: number): string =>
  facing(deg, () =>
    [-12, 12].map(z => path(legLines(z, 0, 0), isAway(z) ? DIM : '')).join('') + guardBody() + armsDown(),
  )

const lerp = (a: V, b: V, t: number): V => add(a, mul(sub(b, a), t))
// A banner bearer: both fists on a tall gold pole, a finial on top.
const POLE_AT: V = [24, 0, 8]
const POLE_TOP = 350
const CLOTH_TOP = 334
const CLOTH_BOTTOM = 230
// (the bearer's body is the colour guard's, placed with it)
const bearer = (): string =>
  arm(SH_FAR, [10, 136, -18], [POLE_AT[0] - 2, 176, POLE_AT[2] - 3], true) +
  arm(SH_NEAR, [12, 130, 28], [POLE_AT[0], 150, POLE_AT[2] + 2]) +
  gold([
    seg([POLE_AT[0], 70, POLE_AT[2]], [POLE_AT[0], POLE_TOP, POLE_AT[2]]),
    { pts: [[POLE_AT[0], POLE_TOP, POLE_AT[2]], [POLE_AT[0] + 3.5, POLE_TOP + 6, POLE_AT[2]], [POLE_AT[0], POLE_TOP + 15, POLE_AT[2]], [POLE_AT[0] - 3.5, POLE_TOP + 6, POLE_AT[2]]], closed: true },
    seg([POLE_AT[0] - 3, CLOTH_TOP, POLE_AT[2]], [POLE_AT[0] + 3, CLOTH_TOP, POLE_AT[2]]),
  ])

// A majorette: a tall white shako with a pink plume, a short flared pink
// skirt, little white epaulettes, a white glove on the raised hand, the other
// fist on the hip. Her baton spins in the raised hand on a group of its own,
// and her boots are drawn on her shins (see the rig).
const BATON_HAND: V = [14, 236, 36]
const majorette = (): string =>
  `${torso()}${NECK}${skull()}` +
  path([...cone(HAT_BASE, [2, 232, 0], 9.5, 8, LIGHT ? 6 : 8, LIGHT ? 2 : 4), brim(13)], 'stroke="#fff4fb"') +
  plume([2, 232, 0], [[-3, 246, 0], [2, 258, 0], [8, 250, 0]], `stroke="${PINK}" stroke-width="2"`) +
  '</g>' +
  path(cone([1, 112, 0], [1, 88, 0], 11, 25, LIGHT ? 6 : 10, LIGHT ? 3 : 5), `stroke="${PINK}" fill="${PINK}" fill-opacity=".22"`) +
  path([ring([0, 161, 26], 6, 4, 6), ring([0, 161, -26], 6, 4, 6)], 'stroke="#fff4fb"') +
  arm(SH_FAR, [-8, 132, -42], [6, 110, -26], true) +
  arm(SH_NEAR, [6, 194, 36], BATON_HAND) +
  path(cone(lerp([6, 194, 36], BATON_HAND, 0.72), BATON_HAND, 3.2, 4.6, 6, 0), 'stroke="#fff4fb"')
const BATON =
  `<path stroke="${GOLD}" stroke-width="2" d="M-24 0H24"/><circle r="3.6" cx="-24" fill="${GOLD}" stroke="none"/><circle r="3.6" cx="24" fill="#fff4fb" stroke="none"/>`

const FLAG =
  `<path stroke="currentColor" fill="currentColor" fill-opacity=".12" d="M0 -64L38 -58L36 -30L0 -34z"/>` +
  `<path stroke="${BRASS}" d="M0 34V-66M-2.5 34h5"/>`

// ---------- the drum major ----------
// Still all bone, in full parade dress: a tall busby with a badge plate, a
// chin strap and a big plume; a braided jacket (rows of gold frogging loops
// with buttons, a high collar, braided cuffs) you can glimpse the ribs
// through; fringed epaulettes; a sash; a short cape and tails; white gauntlet
// cuffs over bony hands; white spats; and the mace, with a big head and a
// cord, pumping on the beat.

const JACKET = lathe(
  [ring([1, 160, 0], 13, 27), ring([2, 142, 0], 16, 26), ring([1, 122, 0], 13.5, 21), ring([1, 102, 0], 16, 24)],
  5,
)
// Frogging: a row of gold loops across the chest, a button at each end and in the middle.
const FROGS: readonly (readonly [number, number, number])[] = [
  [154, 14.5, 25],
  [146, 16, 26],
  [138, 16.5, 25],
  [130, 15.5, 23],
  [122, 14, 21],
]
const FROGGING: Line[] = FROGS.map(([y, rx, rz]) => ell([rx + 1.5, y, 0], [0, 0, rz * 0.62], [0, 2.4, 0], 10))
const BUTTONS = FROGS.flatMap(([y, rx, rz]) => [-0.62, 0, 0.62].map(k => [rx + 1.5, y, rz * k] as V))
  .map(p => `<circle cx="${f(sx(p))}" cy="${f(sy(p))}" r="1.9"/>`)
  .join('')
const epaulette = (z: number): Line[] => {
  const out: Line[] = [ring([0, 162, z], 10, 7, 10)]
  for (const dx of [-7, -4.5, -2, 0.5, 3, 5.5, 8]) {
    out.push(seg([dx, 162, z + Math.sign(z) * 6], [dx, 151, z + Math.sign(z) * 7.5]))
  }
  return out
}
const BUSBY_TOP: V = [2, 252, 0]
const BUSBY = cone(HAT_BASE, BUSBY_TOP, 11.5, 13.5, 10, 5)
const MACE_X = 54
const MACE_Z = 22
const MAJOR_SCALE = 1.25
// his arms: the far fist on the hip, the near hand on the mace
const FAR_ARM: readonly [V, V, V] = [[0, 158, -27], [-6, 130, -46], [6, 108, -26]]
const NEAR_ARM: readonly [V, V, V] = [[0, 158, 27], [26, 148, 34], [MACE_X, 178, MACE_Z]]
/** Braided cuff and white gauntlet over a forearm from `elbow` to `hand`. */
const cuffs = ([, elbow, hand]: readonly [V, V, V]): { cuff: Line[]; glove: Line[] } => ({
  cuff: cone(lerp(elbow, hand, 0.55), lerp(elbow, hand, 0.74), 3.6, 4.2, 8, 4),
  glove: cone(lerp(elbow, hand, 0.74), lerp(elbow, hand, 0.92), 4.2, 6.2, 8, 0),
})
const FAR_CUFF = cuffs(FAR_ARM)
const NEAR_CUFF = cuffs(NEAR_ARM)

const MAJOR_BODY =
  `<g transform="scale(${MAJOR_SCALE})" stroke="${BONE}">` +
  // tails and a short cape behind
  path(
    [-1, 1].map(s => ({ pts: [[-14, 104, s * 4], [-24, 60, s * 13], [-9, 104, s * 19]] as V[], closed: true })),
    `stroke="${PINK}" fill="#ff2e97" fill-opacity=".1"`,
  ) +
  path([{ pts: [[-4, 162, -27], [-15, 150, -31], [-21, 120, -27], [-21, 120, 27], [-15, 150, 31], [-4, 162, 27]], closed: true }], `stroke="${PINK}" stroke-opacity=".6" fill="#ff2e97" fill-opacity=".08"`) +
  arm(...FAR_ARM, true) +
  path([...FAR_CUFF.cuff], `stroke="${GOLD}" stroke-width="1.6"`) +
  path([...FAR_CUFF.glove], `fill="#fff" fill-opacity=".12"`) +
  // the jacket shade goes under the bones so the ribs show bright through it
  `<path d="${hull(JACKET)}" fill="#ff2e97" fill-opacity=".1" stroke="none"/>` +
  TORSO +
  path(JACKET, `stroke="${PINK}" stroke-width=".9" stroke-opacity=".33"`) +
  // the high collar, the frogging and its buttons, the gold placket down the front
  path([...cone([1, 157, 0], [0, 166, 0], 11, 9.5, 12, 6), seg([15, 156, 0], [16.5, 138, 0], [15, 104, 0]), ...FROGGING], `stroke="${GOLD}" stroke-width="1.6"`) +
  `<g fill="${GOLD}" stroke="none">${BUTTONS}</g>` +
  // the sash, from the near shoulder to the far hip, with a knot and tassel
  path(
    [seg([3, 161, 25], [14, 150, 15], [16.5, 136, 2], [14, 120, -10], [5, 103, -22])],
    `stroke="${CYAN}" stroke-width="3.2" stroke-opacity=".33"`,
  ) +
  path([ell([5, 103, -22], [0, 3, 0], [0, 0, 3], 6), seg([5, 100, -22], [4, 88, -21]), seg([5, 100, -22], [6, 89, -24]), seg([5, 100, -22], [3, 90, -19])], `stroke="${CYAN}"`) +
  path([...epaulette(-30), ...epaulette(30)], `stroke="${GOLD}" fill="${GOLD}" fill-opacity=".2"`) +
  NECK +
  SKULL +
  `<path d="${hull(BUSBY)}" fill="#ff2e97" fill-opacity=".14" stroke="none"/>` +
  path(
    [
      ...BUSBY,
      brim(16),
      ring([2, 207, 0], 12, 11.8, 12),
      // the chin strap, from the hat down round the jaw
      seg([2, 203, -12], [6, 184, -13.5], [12, 165, -9], [16, 157, 0], [12, 165, 9], [6, 184, 13.5], [2, 203, 12]),
    ],
    `stroke="${GOLD}"`,
  ) +
  // the badge plate on the front of the hat
  path(
    [{ pts: [[14.6, 238, 0], [14.3, 230, 5.5], [14, 218, 4], [13.9, 213, 0], [14, 218, -4], [14.3, 230, -5.5]], closed: true }, ell([14.4, 226, 0], [0, 3, 0], [0, 0, 3], 6)],
    `stroke="${GOLD}" fill="${GOLD}" fill-opacity=".3"`,
  ) +
  plume(
    BUSBY_TOP,
    [[-9, 274, 0], [-5, 300, 0], [5, 318, 0], [15, 300, 0], [14, 272, 0], BUSBY_TOP],
    `stroke="${CYAN}" fill="${CYAN}" fill-opacity=".12"`,
  ) +
  '</g>' +
  arm(...NEAR_ARM) +
  path([...NEAR_CUFF.cuff], `stroke="${GOLD}" stroke-width="1.6"`) +
  path([...NEAR_CUFF.glove], `fill="#fff" fill-opacity=".12"`) +
  '</g>'
// The mace: a long staff, a big round head, a ferrule, and a cord wound down
// the staff ending in a tassel.
const MACE =
  `<g transform="scale(${MAJOR_SCALE})">` +
  gold([
    seg([MACE_X, 138, MACE_Z], [MACE_X, 270, MACE_Z]),
    ring([MACE_X, 142, MACE_Z], 2.6, 2.6, 6),
    ring([MACE_X, 150, MACE_Z], 4, 4, 6),
    ...sphere([MACE_X, 280, MACE_Z], 10, 10),
    seg([MACE_X, 290, MACE_Z], [MACE_X, 300, MACE_Z]),
    {
      pts: Array.from({ length: 25 }, (_, i) => {
        const t = (i / 24) * Math.PI * 7
        return [MACE_X + 3 * Math.cos(t), 268 - i * 3.4, MACE_Z + 3 * Math.sin(t)] as V
      }),
    },
    ...[-2, 0, 2].map(dx => seg([MACE_X + dx * 0.5, 186, MACE_Z], [MACE_X + dx, 178, MACE_Z + dx * 0.5])),
  ]) +
  '</g>'

// ---------- the formation ----------
// Six files abreast, each a column of ranks: the colour guard in front, then
// trombones, trumpets, trumpets, French horns and sousaphones, with the drum
// major alone ahead of the middle. Each file stands at its own depth on the
// perspective floor: deeper files stand higher, smaller and dimmer, and step a
// little left so every head in a rank shows.

type Kit = { bone: string; hat: string; feather: string }

// Bones stay bone-pale, tinted by the lights; the hats carry the neon.
const KITS: readonly Kit[] = [
  { bone: '#d6fcff', hat: CYAN, feather: PINK },
  { bone: '#ffe0f7', hat: PINK, feather: CYAN },
  { bone: '#ece2ff', hat: VIOLET, feather: GOLD },
]

const RANK = 250 // front to back between ranks, in units at scale 1
// behind the colour guard, front to back: woodwinds, then brass, the drumline last
const BAND: readonly Kind[] = ['flute', 'clarinet', 'sax', 'trumpet', 'trumpet', 'horn', 'trombone', 'sousaphone', 'drum']
const HORIZON = 520
// The camera stands well back and a little high: the files' scales run from
// 0.65 to 1 (the near file crosses the screen about 1.5 times as fast as the
// far one), and the ground falls 340 px from the horizon to the near file's
// feet, so the five files stay apart on the floor.
const NEAR_Y = 860 // the nearest file's feet; scale 1 there, and the floor's scale falls off to the horizon
const DEPTHS = [0.65, 0.7375, 0.825, 0.9125, 1] // far file to near file; the middle one is the centre of the band
// How far back each deeper file stands. A file at scale s is drawn about the
// vanishing point, so a rank stays one straight line on screen only if its
// files step back in proportion to 1/s (their depth), not evenly per file;
// even steps bowed every rank by up to 40 px at the middle file.
const STAGGER_TOTAL = 300 // the farthest file stands this much behind the nearest
const fileShift = (i: number): number => {
  const far = DEPTHS[0] ?? 0.65
  const s = DEPTHS[i] ?? MAJOR_DEPTH
  return (STAGGER_TOTAL * (1 / s - 1)) / (1 / far - 1)
}
const LOOP = 2632.5 // half the distance between one band and the next (about 3.2 ranks of clear floor behind the rear guard before the next drum major)
// The two speeds, in ground units a second. The band marches at VM, set by
// its stride (a planted foot sweeps 52.6 units back in the half second it is
// down, so at VM it stays put on the ground). The camera travels the same way
// at VC. So on screen, at a file of scale s, the band moves at s * (VM - VC)
// and the ground under it at -s * VC: the band overtakes the camera and the
// floor slides back.
// (VC is set so the floor's rails fall a whole 202 px apart at the bottom edge,
// sliding one spacing every GRID_S = 3 s; see the floor.)
const GRID_S = 3
const RAIL = 202 // rail spacing along the bottom edge
const VC = (RAIL * (NEAR_Y - HORIZON)) / (GRID_S * (900 - HORIZON)) // 60.25
const VM = VC + 45 // 105.25
const SPEED = VM - VC // 45: how fast the band overtakes the camera, units a second at scale 1
const LOOP_S = LOOP / SPEED // 58.5 s; the band repeats every 2 * LOOP_S = 117 s
const MASTER_S = 4 * LOOP_S // 234 s: every motion in the scene, the slowest hills included, repeats exactly within this
const FRONT = 1290 // where the colour guard of the nearest file stands as the loop starts
// the drum major marches alone ahead of the centre file; his row comes after the files
const MAJOR_DEPTH = 0.825
const MAJOR_ROW = DEPTHS.length

// The toss, once every TOSS_S (13 a master loop): wind up, throw the flag high,
// turn round and walk backwards under it, turn back, catch it with arms up.
const TOSS_S = 18
const T_RELEASE = 0.35
const T_CATCH = 3.35
const T_LOWERED = 3.75
const T_TURN = 0.2 // how long the guard shows side-on, turning round
const T_AWAY = 0.6 // starts turning away
const T_BACK = 2.6 // starts turning back to the front
const TOSS_HEIGHT = 420 // how far above the release the flag climbs

const groundY = (s: number): number => HORIZON + (NEAR_Y - HORIZON) * s
// A third colour guard marches inside the band, a rank of its own just ahead
// of the French horns; the ranks behind it stand one rank further back.
const MID_AT = BAND.indexOf('horn')
const MID_X = -(MID_AT + 1) * RANK
const FILE_SPAN = (BAND.length + 1) * RANK + 90
// Behind the drumline, the rear colour guard as the five on a die: two in front
// on files 1 and 3, the centre on the middle file, two behind on files 1 and 3.
const REAR_FRONT = -(BAND.length + 2) * RANK
const REAR_GUARD: Readonly<Record<number, readonly number[]>> = { 1: [REAR_FRONT, REAR_FRONT - RANK], 2: [REAR_FRONT - RANK / 2], 3: [REAR_FRONT, REAR_FRONT - RANK] }
const REAR_SPAN = -(REAR_FRONT - RANK) + 90
// Between the drum major and the colour guard, the banner party: a bearer on
// each outer file and the banner between their poles.
// The majorettes march two ranks ahead of the colour guard (so the flags have
// clear floor in front of them), the banner party one rank ahead of the
// majorettes.
// The majorettes stand as the five on a die, on the rear guard's sub-grid:
// the back pair on files 1 and 3 two ranks ahead of the colour guard, the
// centre one half a rank further on, the front pair half a rank further.
const MAJORETTE_X = 2 * RANK
const MAJORETTES: Readonly<Record<number, readonly number[]>> = { 1: [MAJORETTE_X, MAJORETTE_X + RANK], 2: [MAJORETTE_X + RANK / 2], 3: [MAJORETTE_X, MAJORETTE_X + RANK] }
const BANNER_X = MAJORETTE_X + 2 * RANK
const MAJOR_LEAD = BANNER_X + 1.5 * RANK // he leads alone, a rank and a half of clear floor ahead of the banner


/** Copies of something at `anchor`, a LOOP apart: enough that one loop never shows an edge at scale `s`. */
const copies = (s: number, anchor: number, back: number, front: number): number[] => {
  const lo = 800 - 840 / s
  const hi = 800 + 840 / s
  const xs: number[] = []
  for (let k = -4; k <= 6; k++) {
    const x = anchor - k * LOOP
    if (x - back < hi && x + front + LOOP > lo) {
      xs.push(x)
    }
  }
  return xs
}

const hex = (c: string): number[] => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
const mix = (a: string, b: string, t: number): string =>
  `#${hex(a)
    .map((v, i) => Math.round(v + ((hex(b)[i] ?? 0) - v) * t).toString(16).padStart(2, '0'))
    .join('')}`

// ---------- the pieces ----------
// The app stops a scene that draws too much linework (about half a million
// characters of path data, counting every use of a path, freezes it). So the
// parade is built to a budget: every piece is cut into single paths, one per
// style (bone, dimmed far limbs, dark holes, hat, feather, brass), merged across
// the whole file and placed with uses of those paths alone; the small far files
// can use lighter bodies; and the glow, which draws a line three times, can be
// limited to some files or to the hats and brass. See build() for the options.

const RANK_XS = BAND.map((_, i) => -(i + 1 + (i >= MID_AT ? 1 : 0)) * RANK)

type Piece = { id: string }[]

/** Moves path data by (dx, dy): every subpath starts with an absolute move, the rest is relative. */
const shift = (dd: string, dx: number, dy: number): string =>
  dx === 0 && dy === 0
    ? dd
    : dd.replace(/M([^A-Za-z]*)/g, (_, xy: string) => {
        const [x = 0, y = 0] = (xy.match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? []).map(Number)
        return `M${nums([x + dx, y + dy])}`
      })

/** Path data re-drawn on whole units, dropping steps that come to nothing (a skeleton's line is wider than the error). */
const whole = (dd: string): string => {
  let out = ''
  let cx = 0
  let cy = 0
  let ax = 0
  let ay = 0
  for (const sg of dd.match(/[Mlz][^Mlz]*/g) ?? []) {
    const ns = (sg.slice(1).match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? []).map(Number)
    if (sg[0] === 'M') {
      cx = ns[0] ?? 0
      cy = ns[1] ?? 0
      ax = Math.round(cx)
      ay = Math.round(cy)
      out += `M${nums([ax, ay])}`
    } else if (sg[0] === 'l') {
      const steps: number[] = []
      for (let i = 0; i + 1 < ns.length; i += 2) {
        cx += ns[i] ?? 0
        cy += ns[i + 1] ?? 0
        const rx = Math.round(cx)
        const ry = Math.round(cy)
        if (rx !== ax || ry !== ay) {
          steps.push(rx - ax, ry - ay)
        }
        ax = rx
        ay = ry
      }
      out += steps.length ? `l${nums(steps)}` : 'l0 0'
    } else {
      out += 'z'
    }
  }
  return out
}

// ---------- motion, on one clock ----------
// Every animation is sampled on the same TICK and holds still in between, so
// the compositor has a new picture to make only TICK times a second.

const pc = (x: number): string => String(Math.round(x * 10000) / 10000)
/** Keyframes for `name` over `period` seconds, one sample a tick, each held until the next. */
const baked = (name: string, period: number, at: (t: number) => string): string => {
  const n = Math.round(period * TICK)
  let out = `@keyframes ${name}{`
  let last = ''
  for (let i = 0; i < n; i++) {
    const v = at(i / TICK)
    if (v !== last) {
      out += `${pc((i / n) * 100)}%{${v}}`
      last = v
    }
  }
  return `${out}}`
}
/** Keyframes every `every` seconds over `period`, to be run with steps(every * TICK): straight lines between them, stepped on the tick. */
const coarse = (name: string, period: number, every: number, at: (t: number) => string, until = period): string => {
  let out = `@keyframes ${name}{`
  const n = Math.round(until / every)
  for (let i = 0; i <= n; i++) {
    out += `${pc(((i * every) / period) * 100)}%{${at(i * every)}}`
  }
  return until < period ? `${out}100%{${at(period)}}}` : `${out}}`
}
const ty = (y: number): string => `transform:translateY(${f(y)}px)`

// A turn of the leg by `deg` about the body's side-to-side axis, as the camera
// sees it: the 3D rotation carried through the projection as a 2D matrix.
const swing = (deg: number): string => {
  const t = (deg * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  const a11 = CY
  const a21 = SY * SP
  const a22 = -CP
  // A = [[a11, 0], [a21, a22]]; the matrix is A * R * inverse(A).
  const det = a11 * a22
  const r11 = a11 * c
  const r12 = -a11 * s
  const r21 = a21 * c + a22 * s
  const r22 = -a21 * s + a22 * c
  const r = (n: number): string => String(Math.round(n * 100) / 100).replace(/^(-?)0./, '$1.')
  return `transform:matrix(${r((r11 * a22 - r12 * a21) / det)},${r((r21 * a22 - r22 * a21) / det)},${r((r12 * a11) / det)},${r((r22 * a11) / det)},0,0)`
}
// The step: walking forwards, and (turned round) the same step run backwards.
const STEP =
  coarse('qt', 1, STEP_EVERY, t => swing(angleAt(THIGH, t * 100))) +
  coarse('qn', 1, STEP_EVERY, t => swing(angleAt(SHIN_BEND, t * 100))) +
  coarse('qr', 1, STEP_EVERY, t => swing(-angleAt(THIGH, -t * 100))) +
  coarse('nr', 1, STEP_EVERY, t => swing(-angleAt(SHIN_BEND, -t * 100)))

// The majorettes' prance: the same step with the knee lifted higher.
// (The planted half of the step is left as it is, so the foot does not slide.)
const lift = (t: number): number => (t % 1 < 0.5 ? Math.sin((Math.PI * (t % 1)) / 0.5) : 0)
const PRANCE =
  coarse('pt', 1, STEP_EVERY, t => swing(angleAt(THIGH, t * 100) + 30 * lift(t))) +
  coarse('pn', 1, STEP_EVERY, t => swing(angleAt(SHIN_BEND, t * 100) - 30 * lift(t))) +
  // The drum major is drawn 1.25 times as big, so his step is swung 0.79 as
  // far to sweep the same ground.
  coarse('mt', 1, STEP_EVERY, t => swing(0.79 * angleAt(THIGH, t * 100))) +
  coarse('mn', 1, STEP_EVERY, t => swing(0.79 * angleAt(SHIN_BEND, t * 100)))
// The majorettes' baton: now and then thrown high straight up from the raised
// hand and caught there, spinning all the while, half a toss cycle after the
// colour guard's flags.
const BATON_TOSS = coarse('bz', TOSS_S, 0.25, t => {
  const u = t < 1.6 ? t / 1.6 : 1
  return `transform:translateY(${f(-4 * 300 * u * (1 - u))}px)`
}, 2)

// The body bobs on each step (twice a second); the toss timeline switches looks
// on and off; the flag's flight is a throw on a falling-off climb and a faster
// fall to the raised hands, then down to the grip, spinning all the way.
const BOB = coarse('bob', 1, 0.1, t => ty(-3 + 3 * Math.cos(4 * Math.PI * t)))
// the banner bobs with its bearers, at the scale of the middle of the band
const BANNER_BOB = coarse('bb', 1, 0.1, t => ty(MAJOR_DEPTH * (-3 + 3 * Math.cos(4 * Math.PI * t))))
const between = (spans: readonly (readonly [number, number])[]): ((t: number) => boolean) => t =>
  spans.some(([a, b]) => t >= a - 1e-9 && t < b - 1e-9)
const vis = (name: string, spans: readonly (readonly [number, number])[]): string =>
  baked(name, TOSS_S, t => `opacity:${between(spans)(t) ? 1 : 0}`)
const TIMELINE =
  vis('vF', [[0, T_AWAY], [T_BACK + T_TURN, TOSS_S]]) + // walking forwards
  vis('rear', [[T_AWAY + T_TURN, T_BACK]]) + // backwards: body and legs
  vis('vT', [[0, T_AWAY], [T_BACK + T_TURN, TOSS_S]]) + // facing front
  vis('vH', [[0, T_RELEASE], [T_LOWERED, TOSS_S]]) + // arms holding the pole
  vis('vU', [[T_RELEASE, T_AWAY], [T_BACK + T_TURN, T_LOWERED]]) + // arms up
  vis('v9', [[T_AWAY, T_AWAY + T_TURN], [T_BACK, T_BACK + T_TURN]]) // side-on, turning
const CATCH_DX = sx(CATCH) - sx(GRIP)
const CATCH_DY = sy(CATCH) - sy(GRIP)
const TOSS_EVERY = 0.25
const TOSS = coarse('toss', TOSS_S, TOSS_EVERY, t => {
  let x = 0
  let y = 0
  let r = 0
  if (t < T_RELEASE) {
    y = 10 * Math.sin((Math.PI * t) / T_RELEASE)
    r = -25 * Math.sin((Math.PI * t) / T_RELEASE)
  } else if (t < T_CATCH) {
    const u = (t - T_RELEASE) / (T_CATCH - T_RELEASE)
    x = CATCH_DX * u
    y = CATCH_DY * u - 4 * TOSS_HEIGHT * u * (1 - u)
    r = 1080 * u
  } else if (t < T_LOWERED) {
    const u = (t - T_CATCH) / (T_LOWERED - T_CATCH)
    x = CATCH_DX * (1 - u)
    y = CATCH_DY * (1 - u)
  }
  return `transform:translate(${f(x)}px,${f(y)}px) rotate(${f(r)}deg)`
}, 4)
// the drumstick: up and down on each beat, about the hand
const BEAT = baked('beat', 0.5, t => `transform:rotate(${f(-28 * (0.5 + 0.5 * Math.cos(4 * Math.PI * t)))}deg)`)
// After the big toss, the front guard pops its flags in a phrase: one after
// another near to far, back far to near, the outer two, the inner two, and the
// centre, a little higher. Each pop is the same short throw (POP), placed in
// the toss cycle by a delay on one of three nested groups round the flag.
// Patterns z0-z6 are the three release times of one twirler. The front and
// middle guards use z<file>: near to far (4, 3, 2, 1, 0), far to near, the
// outer two (0 and 4), the inner two (1 and 3), the centre (2). The rear guard,
// five on a die on files 1-3, runs the same phrase by depth: near front (z4),
// near back (z5), centre (z2), far front (z1), far back (z6), then back again,
// then the near pair, the far pair, and the centre.
const POP_AT: Readonly<Record<number, readonly [number, number, number]>> = {
  4: [4.8, 9.0, 9.6],
  3: [5.25, 8.55, 10.15],
  2: [5.7, 8.1, 10.7],
  1: [6.15, 7.65, 10.15],
  0: [6.6, 7.2, 9.6],
  5: [5.25, 8.55, 9.6],
  6: [6.6, 7.2, 10.15],
}
const pop = (name: string, height: number, air: number): string => {
  let out = `@keyframes ${name}{`
  for (let t = 0; t <= air + 1e-9; t += 0.1) {
    const u = t / air
    out += `${pc((t / TOSS_S) * 100)}%{transform:translateY(${f(-4 * height * u * (1 - u))}px) rotate(${Math.round(360 * u)}deg)}`
  }
  return `${out}${pc(((air + 0.05) / TOSS_S) * 100)}%,100%{transform:none}}`
}
// Each pattern is one keyframe block holding its three pops (the centre's last
// one higher), so a flag needs a single group for all of them.
let POP = ''
let POP_CSS = ''
for (const [pat, times] of Object.entries(POP_AT)) {
  let kf = `@keyframes pz${pat}{0%{transform:none}`
  times.forEach((t0, k) => {
    const hi = pat === '2' && k === 2
    const height = hi ? 240 : 170
    const air = hi ? 0.7 : 0.6
    for (let t = 0; t <= air + 1e-9; t += 0.1) {
      const u = t / air
      kf += `${pc(((t0 + t) / TOSS_S) * 100)}%{transform:translateY(${f(-4 * height * u * (1 - u))}px) rotate(${Math.round(360 * u)}deg)}`
    }
    kf += `${pc(((t0 + air + 0.05) / TOSS_S) * 100)}%{transform:none}`
  })
  POP += `${kf}}`
  POP_CSS += `.z${pat}{animation:pz${pat} ${TOSS_S}s steps(${TOSS_S * TICK}) infinite}`
}
// The majorettes' pirouette: a quick turn on the spot, drawn as the figure
// narrowing to edge-on, showing its back (mirrored), and opening again, with a
// small rise. Two a cycle, 4.4 s apart: the front pair first, the centre and
// the back pair a beat (0.4 s) after each other, both clear of the baton toss.
const SPIN_AT = [10.6, 11.0, 11.4] // first turn of w0 (front pair), w1 (centre), w2 (back pair)
const turn = (t: number): string => {
  const u = Math.min(1, Math.max(0, t / 0.8))
  return `transform:translateY(${f(-6 * Math.sin(Math.PI * u))}px) scaleX(${f(Math.cos(2 * Math.PI * u))})`
}
let PIROUETTE = '@keyframes pir{'
for (const t0 of [0, 4.4]) {
  for (let t = 0; t <= 0.8 + 1e-9; t += 0.1) {
    PIROUETTE += `${pc(((t0 + t) / TOSS_S) * 100)}%{${turn(t)}}`
  }
}
PIROUETTE += '100%{transform:none}}'
PIROUETTE += `.pr{transform-origin:${f(sx([2, 0, 0]))}px 0;animation:pir ${TOSS_S}s steps(${TOSS_S * TICK}) infinite}`
SPIN_AT.forEach((t, k) => {
  PIROUETTE += `.w${k}{animation-delay:-${f(TOSS_S - t)}s}`
})
const SLIDE_V: V = [26, 0, 0]
const SLIDE = coarse('slide', 1, 0.1, t => {
  const k = (1 - Math.cos(2 * Math.PI * t)) / 2
  return `transform:translate(${f(sx(SLIDE_V) * k)}px,${f(sy(SLIDE_V) * k)}px)`
})
const MACE_BEAT = coarse('mace', 1, 0.1, t => ty(MAJOR_SCALE * (6 - 22 * ((1 - Math.cos(4 * Math.PI * t)) / 2))))
const DOOT = coarse('doot', 2, 0.2, t => {
  const u = t / 2
  const o = u < 0.1 ? u / 0.1 : u < 0.35 ? 1 - ((u - 0.1) / 0.25) * 0.1 : u < 0.6 ? 0.9 * (1 - (u - 0.35) / 0.25) : 0
  const p = 1 - (1 - Math.min(u / 0.6, 1)) ** 2
  return `opacity:${f(o)};transform:translate(${f(34 * p)}px,${f(-46 * p)}px)`
})

// ---------- the stage ----------

// Stars from a fixed seed, so the sky is the same every load.
const STARS = ['', '', '']
{
  let seed = 1984
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  for (let i = 0; i < 70; i++) {
    const x = Math.round(rand() * 1600)
    const y = Math.round(rand() * 430)
    const r = (0.6 + rand() * 1.4).toFixed(1)
    STARS[i % 3] += `<circle cx="${x}" cy="${y}" r="${r}"/>`
  }
}

// The striped sun: one path of slices of the disc, no mask.
const SUN = (() => {
  const cx = 800
  const cy = 390
  const r = 200
  const half = (y: number): number => Math.sqrt(Math.max(0, r * r - (y - cy) ** 2))
  const slices: readonly (readonly [number, number])[] = [[cy - r, 392], [397, 420], [428, 450], [461, 482], [496, 512]]
  return slices
    .map(([a, b]) => {
      const ha = half(a)
      const hb = half(b)
      return `M${f(cx - ha)} ${a}H${f(cx + ha)}A${r} ${r} 0 0 1 ${f(cx + hb)} ${b}H${f(cx - hb)}A${r} ${r} 0 0 1 ${f(cx - ha)} ${a}z`
    })
    .join('')
})()

// The floor slides back under the band. The rails running toward the vanishing
// point scroll as a shear about the horizon (a point slides in proportion to its
// depth below it), looping after exactly one rail spacing; the cross lines
// don't move at all when the floor slides sideways.
// One rail spacing passes a point on the floor every GRID_S. A floor point at
// height y below the horizon lies at the depth of a file of scale
// (y - HORIZON) / (NEAR_Y - HORIZON) and must slide back at VC times that, so
// the rails' spacing at the bottom edge is set to make that true.
// (GRID_S, RAIL and VC are set with the speeds, above.)
let RAILS = ''
for (let k = -14; k <= 15; k++) {
  RAILS += `M800 ${HORIZON}L${800 + k * RAIL} 900`
}
let RUNGS = ''
for (let j = 1; j <= 11; j++) {
  RUNGS += `M0 ${Math.round(HORIZON + 380 * (j / 11) ** 2.2)}H1600`
}
const RAIL_ANGLE = (Math.atan(RAIL / (900 - HORIZON)) * 180) / Math.PI

// The stage glows too, but softly: each wire is laid over a wide faint copy of
// itself, so the skeletons stay the brightest thing.
const halo = (dd: string, attrs: string, k = 1): string =>
  `<path d="${dd}" stroke-width="6" stroke-opacity="${f(0.16 * k)}"/><path d="${dd}" ${attrs}/>`

// Hills in layers, far to near, each drifting by at its own pace: a low pale
// range, a middle range, and a taller dark near range with facets. Each is a
// tile 1600 wide whose ends meet at the same height, drawn twice side by side
// and slid one tile along in its period, which divides the master loop.
type Hills = { name: string; period: number; base: number; lo: number; hi: number; peaks: number; seed: number; fill: string; edge: string; facets: boolean }
const HILLS: readonly Hills[] = [
  { name: 'hl1', period: MASTER_S, base: 472, lo: 458, hi: 412, peaks: 9, seed: 7, fill: '#2b0f52', edge: VIOLET, facets: false },
  { name: 'hl2', period: MASTER_S / 2, base: 492, lo: 474, hi: 434, peaks: 7, seed: 31, fill: '#1c0739', edge: PINK, facets: false },
  { name: 'hl3', period: MASTER_S / 3, base: 512, lo: 502, hi: 456, peaks: 5, seed: 1984, fill: '#0b0220', edge: CYAN, facets: true },
]
const hillTile = (h: Hills): string => {
  let seed = h.seed
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  // valleys and peaks alternate; the tile starts and ends on the same valley
  const pts: [number, number][] = [[0, h.base]]
  const step = 1600 / (h.peaks * 2)
  for (let i = 1; i < h.peaks * 2; i++) {
    const x = Math.round(i * step + (rand() - 0.5) * step * 0.6)
    const y = i % 2 ? Math.round(h.hi + rand() * (h.lo - h.hi) * 0.6) : Math.round(h.lo - rand() * (h.lo - h.hi) * 0.25)
    pts.push([x, y])
  }
  pts.push([1600, h.base])
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('')
  let facets = ''
  if (h.facets) {
    pts.forEach(([x, y], i) => {
      if (i % 2 && i < pts.length - 1) {
        facets += `M${x} ${y}L${Math.round(x + (rand() - 0.5) * step)} ${HORIZON + 1}`
      }
    })
  }
  return (
    `<path fill="${h.fill}" stroke="none" d="${line}V${HORIZON + 1}H0z"/>` +
    `<path fill="none" stroke="${h.edge}" stroke-opacity=".75" stroke-width="1.4" stroke-linejoin="round" d="${line}${facets}"/>`
  )
}
// each tile is drawn once in <defs> and placed twice
const HILL_DEFS = HILLS.map(h => `<g id="t${h.name}">${hillTile(h)}</g>`).join('')
const HILL_LAYERS = HILLS.map(h => `<g class="${h.name}"><use href="#t${h.name}"/><use href="#t${h.name}" x="1600"/></g>`).join('')
const HILL_CSS = HILLS.map(h => `.${h.name}{animation:hill ${f(h.period)}s steps(${Math.round(h.period * TICK)}) infinite}`).join('')

const steps = (s: number): string => `${f(s)}s steps(${Math.round(s * TICK)}) infinite`
const held = (s: number): string => `${f(s)}s step-end infinite`
/** For keyframes a tenth of a second apart: two steps each, so every change lands on the shared tick. */
const tenths = (s: number): string => `${f(s)}s steps(${Math.round(0.1 * TICK)}) infinite`

// ---------- the scene, to a budget ----------

/** How much a scene draws: rows 0 to 5 are the files from far to near, row 6 the drum major. */
export type SceneOptions = {
  /** How far apart the band repeats; one march loop is this over SPEED, and must divide MASTER_S. */
  spacing: number
  /** Rows drawn with the light bodies. */
  light: readonly number[]
  /** How many colour guards turn and walk backwards in the toss: 1 the front, 2 and the middle, 3 and the rear; the others toss their flags only. */
  routine?: 1 | 2 | 3
  /** Files whose legs are the true rig (two turning groups a leg); the others walk by swapping whole-file poses. */
  rig?: readonly number[]
}

/**
 * The path data a scene draws: every <use> outside <defs> counts what it
 * points at (a path's data, or all the path data inside a group), and every
 * path drawn in place outside <defs> counts its own.
 */
export const drawnChars = (svg: string): number => {
  const paths = new Map<string, number>()
  for (const m of svg.matchAll(/<path id="([^"]+)"[^>]*? d="([^"]*)"/g)) {
    paths.set(m[1] ?? '', (m[2] ?? '').length)
  }
  const groups = new Map<string, number>()
  for (const m of svg.matchAll(/<g id="([^"]+)"/g)) {
    const tag = /<(\/?)g[ >]/g
    tag.lastIndex = m.index
    let depth = 0
    let end = m.index
    for (let t = tag.exec(svg); t; t = tag.exec(svg)) {
      depth += t[1] ? -1 : 1
      if (depth === 0) {
        end = t.index
        break
      }
    }
    let n = 0
    for (const p of svg.slice(m.index, end).matchAll(/ d="([^"]*)"/g)) {
      n += (p[1] ?? '').length
    }
    groups.set(m[1] ?? '', n)
  }
  const body = svg.slice(svg.indexOf('</defs>'))
  let n = 0
  for (const m of body.matchAll(/<use[^>]*href="#([^"]+)"/g)) {
    n += groups.get(m[1] ?? '') ?? paths.get(m[1] ?? '') ?? 0
  }
  for (const m of body.matchAll(/<path(?! id=)[^>]*? d="([^"]*)"/g)) {
    n += (m[1] ?? '').length
  }
  return n
}

export const build = (o: SceneOptions): string => {
  let DEFS = ''
  let CSS = ''
  let shapes = 0
  const loopS = o.spacing / SPEED

  /**
   * Cuts drawings (markup of paths, inside translate groups) into one path per
   * style, each drawing moved by its offset, and puts those paths in <defs>.
   */
  const piece = (parts: readonly (readonly [string, number])[]): Piece => {
    const byStyle = new Map<string, string>()
    for (const [markup, ox] of parts) {
      const offsets: [number, number][] = [[ox, 0]]
      const re = /<g transform="translate\((-?[\d.]+),(-?[\d.]+)\)">|<\/g>|<path([^>]*?) d="([^"]*)"\/>/g
      let m: RegExpExecArray | null
      while ((m = re.exec(markup))) {
        const top = offsets[offsets.length - 1] ?? [0, 0]
        if (m[1] !== undefined) {
          offsets.push([top[0] + Number(m[1]), top[1] + Number(m[2])])
        } else if (m[0] === '</g>') {
          offsets.pop()
        } else {
          const style = (m[3] ?? '').trim()
          byStyle.set(style, (byStyle.get(style) ?? '') + shift(m[4] ?? '', top[0], top[1]))
        }
      }
    }
    // The paths of a piece go in one group, placed whole with a single <use>.
    const id = `p${shapes++}`
    DEFS += `<g id="${id}">`
    for (const [style, dd] of byStyle) {
      // only move-and-relative-line data is re-drawn on whole units (the flag is drawn by hand)
      DEFS += `<path${style ? ` ${style}` : ''} d="${/^[Mlz\d.\s-]*$/.test(dd) ? whole(dd) : dd}"/>`
    }
    DEFS += '</g>'
    return [{ id }]
  }

  // A copy of a piece is one translate group of plain uses (no glow passes).
  const uses = (ids: readonly string[]): string => ids.map(id => `<use href="#${id}"/>`).join('')
  const place = (p: Piece, x: number, _row: number): string => {
    const X = Math.round(x)
    // a copy of one or two paths takes its place on the uses; more share a translate group
    if (X && p.length <= 2) {
      return p.map(q => `<use href="#${q.id}" x="${X}"/>`).join('')
    }
    const body = uses(p.map(q => q.id))
    return X ? `<g transform="translate(${X})">${body}</g>` : body
  }

  // A file's band, ranks 1 to 5, as one set of paths; the guard's body, its arms
  // holding the pole or raised, its back and its side; the flag; a trombone
  // slide. Full and light versions, as the rows need them.
  const anyLight = o.light.length > 0
  type Kit2 = { band: Piece; bearer: Piece; majorette: Piece; looks: Record<'vT' | 'vH' | 'vU' | 'rear' | 'v9', Piece> }
  // The guard's brief looks (turning, walking backwards under the flag, arms up
  // for the catch) are drawn once, with the light bones, and shared by both kits.
  const BRIEF = lightly(() => ({
    vU: piece([[armsUp(), 0]]),
    rear: piece([[facing(180, () => guardBody() + armsDown()), 0]]),
    v9: piece([[guardTurned(90), 0]]),
  }))
  const kitFor = (): Kit2 => ({
    band: piece(BAND.map((h, i) => [`${torso()}${NECK}${skull()}${shako()}</g>${horns()[h]}`, RANK_XS[i] ?? 0] as const)),
    bearer: piece([[bearer(), 0]]),
    majorette: piece([[majorette(), 0]]),
    looks: {
      vT: piece([[guardBody(), 0]]),
      vH: piece([[armsHold(), 0]]),
      ...BRIEF,
    },
  })
  const FULL = o.light.length < DEPTHS.length ? kitFor() : undefined
  const LIGHTKIT = anyLight ? lightly(kitFor) : undefined
  const FLAG_P = piece([[FLAG, 0]])
  DEFS += `<g id="BT">${BATON}</g>`
  const SLIDE_P = piece([[gold(SLIDE_LINES), 0]])
  // a drumstick, drawn from its hand
  const STICK_P = STICK_HANDS.map(hand => piece([[path(STICK(hand).map(l => ({ pts: l.pts.map(p => sub(p, hand)) })), `stroke="#fff2d0" stroke-width="1.8"`), 0]]))

  // The legs are a rig: each leg a thigh group turning at the hip and, inside it,
  // a shin group turning at the knee, both on the compositor (never inside a
  // <use>: an animation in a use clone runs on the main thread). Each of the
  // four legs (near and far, forwards and turned round) has its femur and shin
  // drawn in place once, full and light; the far leg is dimmed and has no glow.
  let RIG_CSS = ''
  // the drum major's spats: a white cover round each ankle and over the instep
  const SPAT: Line[] = [...cone([0, -LIMB + 11, 0], [0, -LIMB - 1, 0], 4.2, 5.4, 8, 4), seg([2, -LIMB - 1, -3], [9, -LIMB - 3, 0], [2, -LIMB - 1, 3])]
  // the majorettes' tall boots, with a tassel at the top front
  const BOOT: Line[] = [...cone([0, -LIMB + 24, 0], [0, -LIMB - 1, 0], 3.8, 5, 6, 3), seg([3.5, -LIMB + 24, 0], [6, -LIMB + 17, 0])]
  const rig = (sfx: string, isLight: boolean, spats = false, boots = false): { n: string; far: boolean; parts: [string, string] }[] =>
    (spats || boots ? (['a', 'b'] as const) : (['a', 'b', 'c', 'd'] as const)).map((n, i) => {
      const rear = i > 1
      const z = i % 2 ? -12 : 12
      return facing(rear ? 180 : 0, () => {
        const hip: V = [2, HIP_Y, z]
        const hx = sx(hip)
        const hy = sy(hip)
        const far = isAway(z)
        const dim = far ? ' stroke-opacity=".5"' : ''
        const [fm, sn0] = isLight ? lightly(() => [femur(), shin()] as const) : [femur(), shin()]
        const sn = spats ? [...sn0, ...SPAT] : boots ? [...sn0, ...(isLight ? lightly(() => BOOT.slice(0, 2)) : BOOT)] : sn0
        DEFS += `<path id="f${n}${sfx}"${dim} d="${whole(shift(d(fm), hx, hy))}"/><path id="s${n}${sfx}"${dim} d="${whole(shift(d(sn), hx + sx(KNEE), hy + sy(KNEE)))}"/>`
        if (spats && !RIG_CSS.includes(`.mj${n}{`)) {
          const delay = z < 0 ? ';animation-delay:-.5s' : ''
          const st = `1s steps(${Math.round(STEP_EVERY * TICK)}) infinite${delay}`
          RIG_CSS += `.mj${n}{transform-origin:${f(hx)}px ${f(hy)}px;animation:mt ${st}}`
          RIG_CSS += `.mq${n}{transform-origin:${f(hx + sx(KNEE))}px ${f(hy + sy(KNEE))}px;animation:mn ${st}}`
        }
        if (boots && !RIG_CSS.includes(`.ph${n}{`)) {
          // the majorettes prance: the same step, knees higher, on the same beat
          const delay = z < 0 ? ';animation-delay:-.5s' : ''
          const st = `1s steps(${Math.round(STEP_EVERY * TICK)}) infinite${delay}`
          RIG_CSS += `.ph${n}{transform-origin:${f(hx)}px ${f(hy)}px;animation:pt ${st}}`
          RIG_CSS += `.pk${n}{transform-origin:${f(hx + sx(KNEE))}px ${f(hy + sy(KNEE))}px;animation:pn ${st}}`
        }
        if (!sfx || !RIG_CSS.includes(`.t${n}{`)) {
          const delay = z < 0 ? ';animation-delay:-.5s' : ''
          const st = `1s steps(${Math.round(STEP_EVERY * TICK)}) infinite${delay}`
          RIG_CSS += `.t${n}{transform-origin:${f(hx)}px ${f(hy)}px;animation:${rear ? 'qr' : 'qt'} ${st}}`
          RIG_CSS += `.k${n}{transform-origin:${f(hx + sx(KNEE))}px ${f(hy + sy(KNEE))}px;animation:${rear ? 'nr' : 'qn'} ${st}}`
        }
        return { n, far, parts: [`f${n}${sfx}`, `s${n}${sfx}`] }
      })
    })
  const LEGS_FULL = rig('', false)
  const LEGS_LIGHT = anyLight ? rig('l', true) : []
  const LEGS_MAJOR = rig('m', false, true)
  const LEGS_PRANCE = rig('j', false, false, true)
  const LEGS_PRANCE_LIGHT = anyLight ? rig('jl', true, false, true) : []
  /** A majorette's legs: booted, prancing. */
  const prance = (x: number, row: number): string => {
    const set = o.light.includes(row) ? LEGS_PRANCE_LIGHT : LEGS_PRANCE
    const body = [...set].sort((p, q) => Number(q.far) - Number(p.far)).map(p => `<g class="ph${p.n}"><use href="#${p.parts[0]}"/><g class="pk${p.n}"><use href="#${p.parts[1]}"/></g></g>`).join('')
    return x ? `<g transform="translate(${Math.round(x)})">${body}</g>` : body
  }
  const legs = (x: number, rear: boolean, row: number, light = false): string => {
    const set = row === MAJOR_ROW ? LEGS_MAJOR : light || o.light.includes(row) ? LEGS_LIGHT : LEGS_FULL
    const pair = set.filter((_, i) => (i > 1) === rear).sort((p, q) => Number(q.far) - Number(p.far))
    const body = pair
      .map(p => {
        const [fm, sn] = p.parts
        const [ct, ck] = row === MAJOR_ROW ? ['mj', 'mq'] : ['t', 'k']
        return `<g class="${ct}${p.n}"><use href="#${fm}"/><g class="${ck}${p.n}"><use href="#${sn}"/></g></g>`
      })
      .join('')
    return x ? `<g transform="translate(${Math.round(x)})">${body}</g>` : body
  }

  // The drum major, three copies: his body and mace stay groups (with their glow
  // as group passes), his legs are the rig, scaled with him.
  // (his drawing on whole units too, like the pieces)
  const wholeAll = (markup: string): string => markup.replace(/ d="([Mlz\d.\s-]*)"/g, (_, dd: string) => ` d="${whole(dd)}"`)
  DEFS += `<g id="DM">${wholeAll(MAJOR_BODY)}</g><g id="MC">${wholeAll(MACE)}</g>`
  const groupAt = (id: string, x: number): string => `<use href="#${id}" x="${f(x)}"/>`

  // ---------- the drawing ----------
  // A row is one file (or the major) at one depth: placed and scaled on the
  // floor, marching, and inside that each moving piece as its own group of copies.

  /** Copies of something at `anchor`, `spacing` apart: enough that one loop never shows an edge at scale `s`. */
  const copies = (s: number, anchor: number, back: number, front: number): number[] => {
    const lo = 800 - 840 / s
    const hi = 800 + 840 / s
    const xs: number[] = []
    for (let k = -4; k <= 6; k++) {
      const x = anchor - k * o.spacing
      if (x - back < hi && x + front + o.spacing > lo) {
        xs.push(x)
      }
    }
    return xs
  }
  const kitCss = (i: number, s: number): string => {
    const kit = KITS[i % KITS.length] ?? { bone: BONE, hat: CYAN, feather: PINK }
    const dim = (1 - s) * 0.6
    return `stroke:${mix(kit.bone, '#1b0a3a', dim)};color:${mix(kit.hat, '#1b0a3a', dim)};--f:${mix(kit.feather, '#1b0a3a', dim)}`
  }
  const onFloor = (s: number): string => `transform="translate(800,${f(groundY(s))}) scale(${s}) translate(-800,0)"`

  // On files without the true rig, the legs walk by pose swap: every leg in the
  // file drawn as plain bones (thigh, shin, foot) in each of POSES poses of the
  // step, one group a pose, shown in turn on the shared tick. All the band is in
  // step, so a pose shows every member's legs at the same moment of the stride.
  const POSES = 4
  const stick = (z: number, th: number, sh: number): V[] => {
    const hip: V = [2, HIP_Y, z]
    const knee = add(hip, rotZ(KNEE, th))
    const ankle = add(hip, rotZ(add(KNEE, rotZ(KNEE, sh)), th))
    // the foot as a short stroke forward of the ankle
    const toe = add(hip, rotZ(add(KNEE, rotZ(add(KNEE, [9, -2, 0]), sh)), th))
    return [hip, knee, ankle, toe]
  }
  type Gait = 'walk' | 'prance' | 'rear'
  const legPts = (gait: Gait, near: boolean, p: number): V[] => {
    if (gait === 'rear') {
      // (called inside facing(180), where the near side is z = -12)
      const q = near ? p + 50 : p
      return stick(near ? -12 : 12, angleAt(THIGH, -q), angleAt(SHIN_BEND, -q))
    }
    const q = near ? p : p + 50
    const t = (((q / 100) % 1) + 1) % 1
    const up = gait === 'prance' ? lift(t) : 0
    return stick(near ? 12 : -12, angleAt(THIGH, q) + 30 * up, angleAt(SHIN_BEND, q) - 30 * up)
  }
  // Each gait's legs in each pose are drawn once in <defs> (far leg dimmed,
  // near leg), and a pose group places them at every member that walks so.
  const gaitPose = new Map<string, string>()
  const poseId = (gait: Gait, k: number): string => {
    const key = `${gait}${k}`
    let id = gaitPose.get(key)
    if (!id) {
      id = `g${gait[0]}${k}`
      const line = (near: boolean): string =>
        whole(d([{ pts: facing(gait === 'rear' ? 180 : 0, () => legPts(gait, near, ((k + 0.5) * 100) / POSES).map(pt => turned(pt))) }]))
      DEFS += `<g id="${id}"><path stroke-opacity=".5" d="${line(false)}"/><path d="${line(true)}"/></g>`
      gaitPose.set(key, id)
    }
    return id
  }
  const poses = (members: readonly (readonly [number, Gait])[]): string => {
    if (!members.length) {
      return ''
    }
    let out = ''
    for (let k = 0; k < POSES; k++) {
      out += `<g class="ps${k}">${members.map(([x, gait]) => `<use href="#${poseId(gait, k)}" x="${Math.round(x)}"/>`).join('')}</g>`
    }
    return out
  }

  /** One file of the band at depth `s`. */
  const fileRow = (i: number, s: number): string => {
    const kit = (o.light.includes(i) ? LIGHTKIT : FULL) ?? LIGHTKIT ?? FULL
    if (!kit) {
      return ''
    }
    const xs = copies(s, FRONT - fileShift(i), REAR_SPAN, BANNER_X + 100)
    const rearXs = REAR_GUARD[i] ?? []
    const majXs = MAJORETTES[i] ?? []
    const isBearer = i === 0 || i === DEPTHS.length - 1
    const rigged = (o.rig ?? [0, 1, 2, 3, 4]).includes(i)
    const d = pc(i / TICK)
    CSS += `.r${i}{${kitCss(i, s)}}`
    if (i) {
      CSS += `.r${i} .sp{animation-delay:-${d}s}`
    }
    let out = `<g class="r${i}" ${onFloor(s)}><g class="mv">`
    out += `<g class="bob">${xs.map(x => place(kit.band, x, i) + (isBearer ? place(kit.looks.vT, x + BANNER_X, i) + place(kit.bearer, x + BANNER_X, i) : '')).join('')}</g>`
    // The majorettes, each one group that now and then spins on the spot (a
    // flat-figure turn about her own centre line): body and skirt bobbing, the
    // booted legs prancing, the baton in the raised hand.
    const spinClass = (mx: number): string => (mx === MAJORETTE_X + RANK ? 'w0' : mx === MAJORETTE_X ? 'w2' : 'w1')
    out += xs
      .flatMap(x =>
        majXs.map(
          mx =>
            `<g transform="translate(${Math.round(x + mx)})"><g class="pr ${spinClass(mx)}"><g class="bob">${place(kit.majorette, 0, i)}</g>${rigged ? prance(0, i) : ''}` +
            `<g class="bob"><g transform="translate(${Math.round(sx(BATON_HAND))},${Math.round(sy(BATON_HAND))})"><g class="bz"><g class="bs"><use href="#BT"/></g></g></g></g></g></g>`,
        ),
      )
      .join('')
    if (isBearer && rigged) {
      out += xs.map(x => legs(x + BANNER_X, false, i)).join('')
    }
    // The three colour guards toss in unison: the front guard (one a file), the
    // middle guard a rank ahead of the French horns (one a file), and the rear
    // guard, five on a die. Those doing the full routine share the front guard's
    // looks and legs, switched by the same groups; the others march twirling
    // (body and arms holding the pole) while their flags toss. The middle and
    // rear guards always have the light bones.
    const midKit = LIGHTKIT ?? kit
    const routine = o.routine ?? 3
    type Member = { x: number; light: boolean; full: boolean; pattern: number; cls: string }
    const members: Member[] = []
    const rearPattern = (rx: number): number => (i === 2 ? 2 : i === 3 ? (rx === REAR_FRONT ? 4 : 5) : rx === REAR_FRONT ? 1 : 6)
    for (const x of xs) {
      members.push({ x, light: false, full: true, pattern: i, cls: '' })
      members.push({ x: x + MID_X, light: true, full: routine >= 2, pattern: i, cls: 'fm' })
      for (const rx of rearXs) {
        members.push({ x: x + rx, light: true, full: routine >= 3, pattern: rearPattern(rx), cls: 'fq' })
      }
    }
    const lookOf = (m: Member, v: 'vT' | 'vH' | 'vU' | 'rear' | 'v9'): string => place((m.light ? midKit : kit).looks[v], m.x, i)
    const full = members.filter(m => m.full)
    const plain = members.filter(m => !m.full)
    for (const v of ['vT', 'vH', 'vU', 'rear', 'v9'] as const) {
      out += `<g class="o ${v}">${full.map(m => lookOf(m, v)).join('')}</g>`
    }
    if (rigged) {
      out += xs.map(x => RANK_XS.map(rx => legs(x + rx, false, i)).join('')).join('')
      out += `<g class="wo">${full.map(m => legs(m.x, false, i, m.light)).join('')}</g>`
      out += `<g class="wo rear">${full.map(m => legs(m.x, true, i, m.light)).join('')}</g>`
    } else {
      // everyone walking forward all the time, then the guards doing the routine
      const walkers: (readonly [number, Gait])[] = [
        ...xs.flatMap(x => RANK_XS.map(rx => [x + rx, 'walk'] as const)),
        ...(isBearer ? xs.map(x => [x + BANNER_X, 'walk'] as const) : []),
        ...plain.map(m => [m.x, 'walk'] as const),
        ...xs.flatMap(x => majXs.map(mx => [x + mx, 'prance'] as const)),
      ]
      out += poses(walkers)
      out += `<g class="wo">${poses(full.map(m => [m.x, 'walk'] as const))}</g>`
      out += `<g class="wo rear">${poses(full.map(m => [m.x, 'rear'] as const))}</g>`
    }
    if (plain.length) {
      out += `<g class="bob">${plain.map(m => lookOf(m, 'vT') + lookOf(m, 'vH')).join('')}</g>`
      if (rigged) {
        out += plain.map(m => legs(m.x, false, i, m.light)).join('')
      }
    }
    const at = (k: Kind): number => RANK_XS[BAND.indexOf(k)] ?? 0
    out += `<g class="slide">${xs.map(x => place(SLIDE_P, x + at('trombone'), i)).join('')}</g>`
    // the drumsticks, each beating about its hand
    // the drumsticks and the flags bob together, under one group a row
    let held = ''
    for (const [h, hand] of STICK_HANDS.entries()) {
      held += xs.map(x => `<g transform="translate(${Math.round(x + at('drum') + sx(hand))},${Math.round(sy(hand))})"><g class="dr${h + 1}">${place(STICK_P[h] ?? [], 0, i)}</g></g>`).join('')
    }
    // every guard's flag: the big toss, and inside it the quick pops (q1-q3) on
    // its pattern's times; the middle and rear guards' flags in their own colours
    for (const m of members) {
      held += `<g${m.cls ? ` class="${m.cls}"` : ''} transform="translate(${Math.round(m.x + sx(GRIP))},${Math.round(sy(GRIP))})"><g class="tz"><g class="z${m.pattern}"><g class="sp">${place(FLAG_P, 0, i)}</g></g></g></g>`
    }
    out += `<g class="bob">${held}</g>`
    // doots from every other file, one group per kind of horn, each on its own beat
    if (i % 2) {
      for (const [n, kinds, word] of [[0, ['trombone'], 'doot'], [1, ['trumpet'], 'doot'], [2, ['horn'], 'doot'], [3, ['sousaphone'], 'doot'], [2, ['drum'], 'rat-a-tat']] as const) {
        const ranks = BAND.flatMap((k, r) => ((kinds as readonly Kind[]).includes(k) ? [r] : []))
        const bell = BELLS[kinds[0]]
        out += `<g class="dt n${n}">${xs.flatMap(x => ranks.map(r => doot(bell, x + (RANK_XS[r] ?? 0), word))).join('')}</g>`
      }
    }
    return `${out}</g></g>`
  }

  const majorRow = (): string => {
    const s = MAJOR_DEPTH
    const xs = copies(s, FRONT + MAJOR_LEAD - (STAGGER_TOTAL * (1 / s - 1)) / (1 / (DEPTHS[0] ?? 0.65) - 1), 60, 150)
    return (
      `<g class="r${MAJOR_ROW}" ${onFloor(s)}><g class="mv">` +
      `<g class="bob">${xs.map(x => groupAt('DM', x)).join('')}</g>` +
      xs.map(x => `<g transform="translate(${f(x)}) scale(${MAJOR_SCALE})">${legs(0, false, MAJOR_ROW)}</g>`).join('') +
      `<g class="mace">${xs.map(x => groupAt('MC', x)).join('')}</g>` +
      '</g></g>'
    )
  }

  // The banner hangs between the bearers' poles, which stand on the far and
  // near files. A point on a file moves across the screen at that file's
  // scale times the march, so the far pole drifts slower than the near one and
  // the cloth between them stretches, narrows and turns edge-on as the band
  // passes the vanishing point, as a real banner across the street would. That
  // is one affine map in x for every point of the cloth (each pole's line moves
  // as a whole): translateX(B) scaleX(A), linear in the march, so a single
  // from/to keyframe pair on the march's own steps keeps it on the poles. The
  // lettering rides at the cloth's centre, upright, and narrows with the cloth
  // (never mirrored) through a few keyframes where the width crosses its limits.
  const BANNER_CSS: string[] = []
  const banner = (): string => {
    const far = 0
    const near = DEPTHS.length - 1
    const s0 = DEPTHS[far] ?? 0.45
    const s1 = DEPTHS[near] ?? 1
    const a0 = FRONT - fileShift(far) + BANNER_X
    const a1 = FRONT - fileShift(near) + BANNER_X
    const ks = [...new Set([s0, s1].flatMap((sc, j) => copies(sc, j ? a1 : a0, REAR_SPAN, BANNER_X + 100).map(x => Math.round(((j ? a1 : a0) - x) / o.spacing))))].sort((a, b) => a - b)
    const poleX = (sc: number, a: number, k: number, m: number): number => 800 + sc * (a - k * o.spacing + sx(POLE_AT) - 800 + m)
    const yAt = (sc: number, y: number): number => groundY(sc) + sc * sy([POLE_AT[0], y, POLE_AT[2]])
    const pct = (m: number): string => pc((m / o.spacing) * 100)
    let out = ''
    for (const k of ks) {
      const xf = (m: number): number => poleX(s0, a0, k, m)
      const xn = (m: number): number => poleX(s1, a1, k, m)
      const w = (m: number): number => xn(m) - xf(m)
      const mRef = Math.abs(w(0)) >= Math.abs(w(o.spacing)) ? 0 : o.spacing
      const fr = xf(mRef)
      const nr = xn(mRef)
      const ft = yAt(s0, CLOTH_TOP)
      const fb = yAt(s0, CLOTH_BOTTOM)
      const nt = yAt(s1, CLOTH_TOP)
      const nb = yAt(s1, CLOTH_BOTTOM)
      // the cloth, with a scalloped lower edge and a fringe below it
      const SC = 6
      let edge = ''
      let fringe = ''
      for (let j = SC; j > 0; j--) {
        const u0 = j / SC
        const u1 = (j - 1) / SC
        const um = (u0 + u1) / 2
        const px = (u: number): number => fr + (nr - fr) * u
        const py = (u: number): number => fb + (nb - fb) * u
        edge += `Q${f(px(um))} ${f(py(um) + 6 + 4 * um)} ${f(px(u1))} ${f(py(u1))}`
      }
      for (let j = 0; j <= 18; j++) {
        const u = j / 18
        const y0 = fb + (nb - fb) * u + 2
        fringe += `M${f(fr + (nr - fr) * u)} ${f(y0)}v${f(4 + 6 * u)}`
      }
      // The word is printed on the cloth, in the cloth's own frame: each letter
      // sized to the cloth's height where it sits and slanted with its edges, so
      // the letters grow toward the near pole as the edges spread. It is printed
      // on both faces: one reading left to right as the cloth is drawn here, one
      // laid out for when the cloth has swung round past the vanishing point
      // (its group's scale turns negative); a step at that tick swaps them.
      const top = (u: number): number => ft + (nt - ft) * u
      const bot = (u: number): number => fb + (nb - fb) * u
      const xAt = (u: number): number => fr + (nr - fr) * u
      const slopeT = (nt - ft) / (nr - fr)
      const slopeB = (nb - fb) / (nr - fr)
      const WORD = 'doot'
      const ASC = 74 // the letters' height, in the font's units at 100px
      const ADV = 60 // a letter's advance, in the same units
      const print = (mirrored: boolean): string =>
        [...WORD]
          .map((ch, j) => {
            // slots left to right across 70% of the cloth as it lies on screen
            const left = Math.min(fr, nr)
            const right = Math.max(fr, nr)
            const slot = mirrored ? WORD.length - 1 - j : j
            const cx = left + (right - left) * (0.15 + (0.7 * (slot + 0.5)) / WORD.length)
            const u = (cx - fr) / (nr - fr)
            const h = bot(u) - top(u)
            const base = bot(u) - 0.2 * h
            const cap = top(u) + 0.2 * h
            const sxl = ((right - left) * 0.7 * 0.92) / WORD.length / ADV
            const ax = mirrored ? -sxl : sxl
            const slope = 0.2 * slopeT + 0.8 * slopeB
            return `<text transform="matrix(${ax.toFixed(4)},${(slope * ax).toFixed(4)},0,${((base - cap) / ASC).toFixed(4)},${f(cx)},${f(base)})">${ch}</text>`
          })
          .join('')
      const body = `M${f(fr)} ${f(ft)}L${f(nr)} ${f(nt)}L${f(nr)} ${f(nb)}${edge}z`
      const flips = (w(0) > 0) !== (w(o.spacing) > 0)
      const n = BANNER_CSS.length
      let faces = `<g class="bw">${print(false)}</g>`
      if (flips) {
        // the march at which the cloth turns edge-on, and which face shows on each side of it
        const mFlip = (-w(0) / (w(o.spacing) - w(0))) * o.spacing
        const startsFront = Math.sign(w(0)) === Math.sign(w(mRef))
        const key = (front: boolean): string => `@keyframes bf${n}${front ? 'a' : 'b'}{0%{opacity:${startsFront === front ? 1 : 0}}${pct(mFlip)}%{opacity:${startsFront === front ? 0 : 1}}}`
        BANNER_CSS.push(`${key(true)}${key(false)}.bf${n}a{animation:bf${n}a ${o.spacing / SPEED}s step-end infinite}.bf${n}b{animation:bf${n}b ${o.spacing / SPEED}s step-end infinite}`)
        faces = `<g class="bw bf${n}a">${print(false)}</g><g class="bw bf${n}b">${print(true)}</g>`
      }
      const cloth =
        `<path fill="#ff2e97" fill-opacity=".45" d="${body}"/>` +
        faces +
        `<path stroke="${GOLD}" stroke-width="2.2" d="${body}"/>` +
        `<path stroke="${GOLD}" stroke-opacity=".7" d="${fringe}"/>` +
        `<path stroke="${GOLD}" stroke-opacity=".5" d="M${f(fr)} ${f(ft + 4)}L${f(nr)} ${f(nt + 7)}"/>`
      const cl = (m: number): string => {
        const A = w(m) / (nr - fr)
        return `transform:translateX(${f(xf(m) - A * fr)}px) scaleX(${A.toFixed(4)})`
      }
      BANNER_CSS.push(`@keyframes bc${n}{0%{${cl(0)}}100%{${cl(o.spacing)}}}.bc${n}{animation:bc${n} ${steps(o.spacing / SPEED)}}`)
      out += `<g class="bc${n}"><g class="bb">${cloth}</g></g>`
    }
    return `<g class="bn" fill="none">${out}</g>`
  }

  // Far files first, the drum major after the middle file, the banner just
  // before the near file so the near bearer stands in front of it.
  const PARADE = DEPTHS.map((sc, i) => (i === DEPTHS.length - 1 ? banner() : '') + fileRow(i, sc) + (i === (DEPTHS.length - 1) / 2 ? majorRow() : '')).join('')

  const STYLE = `
${Array.from({ length: MAJOR_ROW + 1 }, (_, i) => `.r${i}`).join(',')}{fill:none;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round}
.r${MAJOR_ROW}{stroke:${BONE};color:${PINK}}
.fe{stroke:var(--f)}
${CSS}
.mv{animation:march ${steps(loopS)}}
.bob{animation:bob ${tenths(1)}}
.o{animation:bob ${tenths(1)},vH ${held(TOSS_S)}}
.o.vT{animation-name:bob,vT}.o.vU{animation-name:bob,vU}.o.rear{animation-name:bob,rear}.o.v9{animation-name:bob,v9}
.wo{animation:vF ${held(TOSS_S)}}
.wo.rear{animation-name:rear}
${RIG_CSS}
.tz{animation:toss ${f(TOSS_S)}s steps(${Math.round(TOSS_EVERY * TICK)}) infinite}
.sp{animation:spin ${steps(1)}}
.slide{animation:slide ${tenths(1)}}
.dr1,.dr2{animation:beat ${held(0.5)}}.dr2{animation-delay:-.25s}
.mace{animation:mace ${tenths(1)}}
.dt{font:italic 900 22px ui-sans-serif,system-ui,sans-serif;fill:${GOLD};stroke:none;opacity:0;animation:doot 2s steps(${Math.round(0.2 * TICK)}) infinite}
.n1{animation-delay:-.5s}.n2{animation-delay:-1s}.n3{animation-delay:-1.5s}
${HILL_CSS}
.gs{transform-origin:800px ${HORIZON}px;animation:gs ${steps(GRID_S)}}
@keyframes march{to{transform:translateX(${o.spacing}px)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes hill{to{transform:translateX(-1600px)}}
@keyframes gs{to{transform:skewX(-${RAIL_ANGLE.toFixed(3)}deg)}}
${STEP}
${PRANCE}
${BATON_TOSS}
${PIROUETTE}
.bs{animation:spin ${f(0.5)}s steps(${Math.round(0.5 * TICK)}) infinite}
.bz{animation:bz ${f(TOSS_S)}s steps(${Math.round(TOSS_EVERY * TICK)}) infinite;animation-delay:-${f(TOSS_S - 12.4)}s}
${BOB}
${BANNER_BOB}
${BANNER_CSS.join('\n')}
.bb{animation:bb ${tenths(1)}}
.bw{font:italic 900 100px ui-sans-serif,system-ui,sans-serif;fill:#ffe08a;fill-opacity:.95;stroke:#4a0f45;stroke-width:5px;stroke-opacity:.8;paint-order:stroke;text-anchor:middle}
.fq{color:#ff8a5c}.fm{color:#b98cff}
${POP_CSS}
@keyframes psw{0%{opacity:1}25%,100%{opacity:0}}
.ps0,.ps1,.ps2,.ps3{opacity:0;animation:psw 1s step-end infinite}
.ps1{animation-delay:-.75s}.ps2{animation-delay:-.5s}.ps3{animation-delay:-.25s}
${POP}
${TIMELINE}
${TOSS}
${SLIDE}
${BEAT}
${MACE_BEAT}
${DOOT}
`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"><style>${STYLE}</style>` +
    '<defs>' +
    '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#090119"/><stop offset=".55" stop-color="#2b0a52"/>' +
    '<stop offset=".9" stop-color="#7a1f7d"/><stop offset="1" stop-color="#ff4f9a"/></linearGradient>' +
    '<linearGradient id="sun" gradientUnits="userSpaceOnUse" x1="0" y1="190" x2="0" y2="590"><stop offset="0" stop-color="#fff07a"/><stop offset=".5" stop-color="#ff8a5c"/>' +
    '<stop offset="1" stop-color="#ff2e97"/></linearGradient>' +
    '<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c0638"/><stop offset="1" stop-color="#07010f"/></linearGradient>' +
    DEFS +
    HILL_DEFS +
    '</defs>' +
    '<rect width="1600" height="521" fill="url(#sky)"/>' +
    STARS.map((st, i) => `<g fill="#fff" opacity="${[0.85, 0.55, 0.3][i] ?? 0.5}">${st}</g>`).join('') +
    `<path fill="url(#sun)" d="${SUN}"/>` +
    HILL_LAYERS +
    '<rect y="520" width="1600" height="380" fill="url(#floor)"/>' +
    `<g stroke="#ff3fa4" fill="none">${halo(RUNGS, 'stroke-width="1.4" stroke-opacity=".5"', 0.5)}<g class="gs">${halo(RAILS, 'stroke-width="1.4" stroke-opacity=".5"', 0.5)}</g></g>` +
    `<g stroke="${CYAN}">${halo(`M0 ${HORIZON}H1600`, 'stroke-width="2.2"')}</g>` +
    PARADE +
    '</svg>'
  )
}

export const SCENE_ALT =
  'A synthwave dusk where the camera tracks along a marching band of 3D wireframe skeletons passing five abreast: a drum major in full dress, two bearers carrying a big "doot" banner, five baton-twirling, pirouetting majorettes set like the five on a die, a rank of flag twirlers who toss their flags high and then pop them one by one, then ranks of flutes, clarinets, saxophones and trumpets, a second rank of flag twirlers tossing in unison with the first, then French horns, trombones and sousaphones dooting, a drumline, and a rear guard of five flag twirlers set like the five on a die who toss with the others, over a scrolling neon grid.'

// The rungs, leanest first; each names what it draws. With the glow gone,
// they differ only in how many files have the full bodies (the far files keep
// the light ones). In the app, scenes around 350k true drawn chars have stopped.
const RUNG_OPTIONS: readonly { what: string; o: SceneOptions; isDefault?: boolean }[] = [
  { what: 'light bodies in every file', o: { spacing: 2 * LOOP, light: [0, 1, 2, 3, 4] } },
  { what: 'full bodies on the nearest file', o: { spacing: 2 * LOOP, light: [0, 1, 2, 3] }, isDefault: true },
  { what: 'full bodies on the nearest two files', o: { spacing: 2 * LOOP, light: [0, 1, 2] } },
  { what: 'full bodies on the nearest three files', o: { spacing: 2 * LOOP, light: [0, 1] } },
  { what: 'full bodies on the nearest four files', o: { spacing: 2 * LOOP, light: [0] } },
]

/** Every rung built and measured; for the checking scripts, not the app (it is slow). */
export const sceneLadder = (): readonly { label: string; svg: string }[] =>
  RUNG_OPTIONS.map(r => {
    const svg = build(r.o)

    return { label: `${Math.round(drawnChars(svg) / 1000)}k: ${r.what}`, svg }
  })

// What /doot detail <n> chooses between, leanest first. The app stops a scene it
// finds too heavy, and where that line sits varies by machine and by moment, so
// the person picks the richest level their app keeps marching.
const DETAIL_OPTIONS: readonly SceneOptions[] = [
  // light bodies; every file walks by pose swap; only the front guard turns in the toss
  { spacing: 2 * LOOP, light: [0, 1, 2, 3, 4], routine: 1, rig: [] },
  // full bodies and the true leg rig on the nearest file; the front guard turns
  { spacing: 2 * LOOP, light: [0, 1, 2, 3], routine: 1, rig: [4] },
  // the same, with the middle guard turning too
  { spacing: 2 * LOOP, light: [0, 1, 2, 3], routine: 2, rig: [4] },
  // the true rig on the nearest two files; all three guards turn
  { spacing: 2 * LOOP, light: [0, 1, 2, 3], routine: 3, rig: [3, 4] },
]

export const DETAIL_LEVELS = DETAIL_OPTIONS.length
export const DEFAULT_DETAIL = 2

const built = new Map<number, string>()

/** The scene at a detail level, 1 (leanest) to DETAIL_LEVELS; built on first ask. */
export const sceneAt = (level: number): string => {
  const o = DETAIL_OPTIONS[level - 1] ?? DETAIL_OPTIONS[DEFAULT_DETAIL - 1]
  const key = DETAIL_OPTIONS[level - 1] ? level : DEFAULT_DETAIL
  let svg = built.get(key)

  if (svg === undefined && o) {
    svg = build(o)
    built.set(key, svg)
  }

  return svg ?? ''
}

export const SCENE_SVG = sceneAt(DEFAULT_DETAIL)
