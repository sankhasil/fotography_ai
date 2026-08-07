// Deterministic, client-only session aliases: {emoji} {Adjective} {Noun}.
// Derived from the session ID via FNV-1a, so the same ID always renders the
// same alias across reloads and terminal-created sessions get one too.

const EMOJIS = [
  '🐙', '🦄', '🐬', '🦊', '🐼', '🐨', '🦁', '🐯', '🐸', '🦖',
  '🐲', '🦋', '🐝', '🦉', '🐺', '🦓', '🐳', '🦈', '🐊', '🦒',
  '🐘', '🦘', '🐧', '🦩', '🦚', '🦜', '🦂', '🐍', '🦀', '🦑',
  '🦔', '🦇', '🐈', '🐕', '🐇', '🦆', '🦅', '🌵', '🌸', '🍄',
  '🍉', '🍇', '🥑', '🌮', '🌈', '⚡', '🔥', '🌊', '🪐', '🚀',
]

const ADJECTIVES = [
  'ambitious', 'brazen', 'curious', 'dizzy', 'eager', 'fancy', 'gritty', 'happy',
  'ironic', 'jolly', 'keen', 'lazy', 'mellow', 'nifty', 'odd', 'proud',
  'quirky', 'radiant', 'sassy', 'tidy', 'upbeat', 'vivid', 'witty', 'zany',
  'ancient', 'bold', 'calm', 'daring', 'epic', 'frozen', 'glowing', 'hidden',
  'icy', 'jagged', 'luminous', 'mighty', 'neon', 'oceanic', 'peppy', 'quiet',
  'rapid', 'silent', 'thunderous', 'unruly', 'velvet', 'wild', 'young', 'breezy',
  'charming', 'drowsy', 'electric', 'fiery', 'gentle', 'heroic', 'infinite', 'jubilant',
  'kooky', 'limber', 'mystic', 'noble', 'obscure', 'pixelated', 'rainbow', 'shiny',
  'tiny', 'unfazed', 'velvety', 'wobbly', 'yummy', 'zealous', 'abrupt', 'bitter',
  'clever', 'dusty', 'emerald', 'fluffy', 'gloomy', 'hazy', 'jaunty', 'kinetic',
  'loyal', 'magnetic', 'nimble', 'opulent', 'plucky', 'reclusive', 'snappy', 'tender',
  'ultimate', 'vigorous', 'whimsical', 'crimson', 'daring', 'frosty', 'golden', 'hollow',
  'ivory', 'jovial', 'limber', 'mellow', 'naughty', 'outgoing', 'pearly', 'rustic',
  'silky', 'twilight', 'unique', 'violet', 'wavy', 'yellow', 'amiable', 'bubbly',
  'candid', 'deft', 'exotic', 'fleet', 'glad', 'hearty', 'jittery', 'knightly',
  'lofty', 'merry', 'nifty', 'orderly', 'puzzled', 'restless', 'sleepy', 'tricky',
  'unusual', 'valiant', 'warm', 'youthful', 'blazing', 'canny', 'dreamy', 'eternal',
  'fearless', 'gloomy', 'heroic', 'innocent', 'jumbo', 'kindly', 'lively', 'majestic',
  'naive', 'optimistic', 'peaceful', 'reliable', 'sturdy', 'truthful', 'vocal', 'wondrous',
]

const NOUNS = [
  'badger', 'cactus', 'dragon', 'ember', 'falcon', 'geyser', 'harbor', 'island',
  'jaguar', 'kettle', 'lagoon', 'marmot', 'nebula', 'otter', 'penguin', 'quarry',
  'raven', 'sailboat', 'tornado', 'urchin', 'volcano', 'walrus', 'yacht', 'zephyr',
  'acorn', 'boulder', 'canyon', 'duckling', 'eclipse', 'firefly', 'glacier', 'heron',
  'iguana', 'jackal', 'koala', 'lantern', 'meadow', 'nugget', 'oracle', 'panda',
  'quokka', 'ranger', 'sphinx', 'turtle', 'umbra', 'viper', 'whale', 'xylophone',
  'almond', 'biscuit', 'comet', 'dolphin', 'egret', 'fountain', 'gorilla', 'hazel',
  'ibis', 'jasmine', 'kiwi', 'llama', 'marble', 'nightjar', 'oasis', 'puffin',
  'quetzal', 'rookery', 'saffron', 'toucan', 'umbrella', 'vortex', 'willow', 'zebra',
  'antler', 'beacon', 'caribou', 'dune', 'fennel', 'gazebo', 'haddock', 'indigo',
  'juniper', 'kayak', 'lynx', 'mango', 'narwhal', 'orchid', 'pelican', 'quill',
  'robin', 'sandal', 'thistle', 'urchin', 'violet', 'wombat', 'yarrow', 'zenith',
  'anchor', 'bramble', 'cougar', 'delta', 'eucalyptus', 'flamingo', 'granite', 'hippo',
  'iris', 'jubilee', 'koi', 'lichen', 'mongoose', 'nougat', 'opossum', 'prairie',
  'quartz', 'raspberry', 'salmon', 'tapir', 'union', 'vine', 'whelk', 'yarn',
  'armadillo', 'blossom', 'cheetah', 'dodo', 'foxglove', 'gecko', 'hibiscus', 'impala',
]

function hash(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function pick<T>(list: T[], h: number): T {
  return list[h % list.length]
}

function aliasFor(id: string): string {
  const h = hash(id)
  const emoji = pick(EMOJIS, h)
  const adjective = pick(ADJECTIVES, h >>> 8)
  const noun = pick(NOUNS, h >>> 16)
  return `${emoji} ${adjective} ${noun}`
}

export function sessionAlias(id: string): string {
  return aliasFor(id)
}

export function aliases(sessions: Array<{ id: string }>): Map<string, string> {
  const map = new Map<string, string>()
  for (const session of sessions) map.set(session.id, aliasFor(session.id))
  return map
}
