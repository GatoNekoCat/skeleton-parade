import type { CoreEngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { DEFAULT_DETAIL, DETAIL_LEVELS, SCENE_ALT, sceneAt } from './scene'


const SCENE = 'skeleton-parade'

// A night-only look: deep violet surfaces, hot pink accent, cyan and gold beside it.
const { theme, problems } = makeColors({
  label: 'Skeleton Parade',
  only: 'dark',
  roles: { accent: '#ff3fa4', danger: '#ff4d5e', success: '#2fe6a8', warning: '#ffc247', pro: '#3fd8ff' },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#130526',
        'surface-1': '#1a0933',
        'surface-2': '#210d3e',
        'surface-3': '#271146',
        'text-primary': '#f7ecff',
        'text-secondary': '#d9c6f2',
        'text-muted': '#b29dd4',
      },
    },
  },
})

// `glass` is the veil between the parade and the words: lower `opacity` or
// `blur` to see more skeleton, raise them for calmer reading.
const GLASS = { blur: 2, tint: '#130526', opacity: 0.66 }

const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: SCENE, glass: GLASS },
}

const VERBS = [
  'Dooting',
  'Marching',
  'Oiling the valves',
  'Emptying the spit valve',
  'Rattling in step',
  'Tuning the trombones',
  'Polishing the sousaphone',
  'Twirling the mace',
  'Counting off',
  'Doot-doot-dooting',
]

const FANFARES = [
  '💀🎺 doot doot!',
  '💀🎺 DOOT doot-doot DOOT. The band salutes you.',
  '🎺💀🎺💀🎺 doot-doot-doot-doot-DOOOOOT',
  '💀 The drum major raises the mace. 🎺 doot. 🎺 doot. 🎺 doot doot doot!',
  '🎷 the saxes made the cut. 🥁 rat-a-tat. 🎺 doot.',
]

// The horn line: one note a tool call, so a run of calls plays a little bugle
// tune in Bb major pentatonic. Each name is a file in `sounds/` (doot-<name>.wav,
// already mixed down to -9 dBFS, so it plays at gain 1).
const TUNE = ['bb3', 'd4', 'f4', 'd4', 'g4', 'f4', 'd4', 'c4']

// A burst of parallel tool calls would stack into a honk; one doot per gap.
const DOOT_GAP_MS = 180

const MUTED_KEY = 'muted'
const DETAIL_KEY = 'detail'
type SoundDollar = Pick<CoreEngineInterface, 'audio' | 'clock' | 'store'>
type StageDollar = Pick<CoreEngineInterface, 'theme'>

// Helpers handed `$` must sit at the top of the file, where the validator can follow them.
// Mute lives in $.store so it outlasts the session; this is its read-once copy.
// How much the scene draws, 1 (leanest) up; kept in $.store like the mute.
let detail = DEFAULT_DETAIL

// Setting the look again under a new scene name makes the app draw the scene
// afresh. By hand only (/doot restart, /doot detail): each fresh draw seems to
// cost the session something it does not get back, and after a hundred or so in
// one session no scene would keep running, so nothing restages on a timer.
let takes = 0

const restage = async ($: StageDollar) => {
  takes += 1
  await $.theme.set({ ...LOOK, backdrop: { scene: `${SCENE}-take-${takes}`, glass: GLASS } }).catch(() => undefined)
}

let isMuted: boolean | undefined
let lastDootAt = -Infinity
let isClaiming = false
let note = 0

const readMuted = async ($: SoundDollar) => {
  if (isMuted === undefined) {
    isMuted = (await $.store.get(MUTED_KEY)) === true
  }

  return isMuted
}

// Resolves false when the store refused it, so the mute holds for this session only.
const setMuted = async ($: SoundDollar, value: boolean) => {
  isMuted = value
  try {
    await $.store.set(MUTED_KEY, value)

    return true
  } catch {
    return false
  }
}

// Never awaited by a tool call and never rejects: a surface with no player
// (a Windows or Linux terminal) or a refused clip is not worth a failed hook.
const doot = async ($: SoundDollar) => {
  // The clock is a host round trip, so calls arriving while one is checking
  // are part of the same burst and drop out here.
  if (isClaiming) {
    return
  }
  isClaiming = true
  let isTurn = false

  try {
    if (!(await readMuted($))) {
      const now = await $.clock.now()

      isTurn = now - lastDootAt >= DOOT_GAP_MS
      if (isTurn) {
        lastDootAt = now
      }
    }
  } catch {
    // No store or clock answer: stay quiet this time.
  } finally {
    isClaiming = false
  }
  if (!isTurn) {
    return
  }
  const name = TUNE[note % TUNE.length] ?? 'bb3'

  note += 1
  // A play that is refused (no player on this surface, a missing file) is just dropped.
  await $.audio.play({ asset: `sounds/doot-${name}.wav` }).catch(() => undefined)
}

export const register: Register = on => {
  // These start over on a reload, which is fine for a doot count.
  let doots = 0
  let beat = 0

  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    const kept = await $.store.get(DETAIL_KEY).catch(() => undefined)

    if (typeof kept === 'number' && Number.isInteger(kept) && kept >= 1 && kept <= DETAIL_LEVELS) {
      detail = kept
    }
    await $.theme.set(LOOK)
    await $.command.register({
      name: 'doot',
      description: 'Call for a fanfare from the skeleton band (on/off for the sound, restart to march again, detail <n> for how much is drawn)',
      argumentHint: `[on|off|restart|detail 1-${DETAIL_LEVELS}]`,
    })

    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    // startsWith: `/doot restart` sets the scene again under a numbered name.
    if (!e.props.scene.startsWith(SCENE) || (e.surface !== 'desktop' && e.surface !== 'mobile')) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)

    return <Svg source={sceneAt(detail)} alt={SCENE_ALT} isInteractive />
  })

  // The spinner doots, except where the desktop is naming a real step.
  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    if (e.props.message !== null || (e.surface !== 'terminal' && e.props.word !== 'Working')) {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, word: VERBS[beat % VERBS.length] ?? 'Dooting' } })
  })

  on('turn.start', ($, e, next) => {
    beat += 1

    return next(e)
  })

  // One doot a tool call, tallied in the status line.
  on('tool.call', ($, e, next) => {
    doots += 1
    beat += 1
    $.ui.status(`💀🎺 ${doots} doot${doots === 1 ? '' : 's'}`)
    // Fire and forget: the call goes on without waiting for the horn.
    void doot($)

    return next(e)
  })

  on('command.run', { command: 'doot' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg.startsWith('detail')) {
      const level = Number(arg.slice('detail'.length).trim())

      if (!Number.isInteger(level) || level < 1 || level > DETAIL_LEVELS) {
        return { text: `💀 Detail is at ${detail}. Give a level from 1 (leanest) to ${DETAIL_LEVELS} (richest).` }
      }
      detail = level
      await $.store.set(DETAIL_KEY, level).catch(() => undefined)
      await restage($)

      return { text: `💀🥁 Detail ${level} of ${DETAIL_LEVELS}. The band forms up again.` }
    }
    if (arg === 'restart') {
      // The app sometimes stops a scene for good; a new scene name makes it draw afresh.
      await restage($)

      return { text: '💀🥁 From the top! The band forms up and steps off again.' }
    }
    if (arg === 'off' || arg === 'on') {
      const isKept = await setMuted($, arg === 'off')
      const caveat = isKept ? '' : ' (for this session only: the store refused it)'

      if (arg === 'on') {
        void doot($)

        return { text: `💀🎺 The horns are back. doot.${caveat}` }
      }

      return { text: `💀🤫 The band mimes along. /doot on brings the horns back.${caveat}` }
    }
    doots += 1
    void doot($)

    return { text: FANFARES[doots % FANFARES.length] ?? '💀🎺 doot' }
  })
}
