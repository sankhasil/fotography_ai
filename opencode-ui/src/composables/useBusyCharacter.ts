import { computed } from 'vue'

import { useModel } from '@/composables/useModel'

// Each opencode model gets a mascot for the cartoony busy figure. Unknown
// models fall back to the stick figure.
export type BusyCharacter = 'pickle-rick' | 'octopus' | 'penguin' | 'dolphin' | 'stick-figure'

// ponytail: substring match keeps this robust to model-id variants (e.g.
// laguna-s-2.1-free, laguna-xs) without a hard-coded list. Order matters:
// 'pickle' must win over nothing else in the set today.
const CHARACTER_BY_MODEL: Array<[RegExp, BusyCharacter]> = [
  [/pickle/, 'pickle-rick'],
  [/laguna/, 'octopus'],
  [/north/, 'penguin'],
  [/deepseek/, 'dolphin'],
]

export function characterForModel(modelID: string | null | undefined): BusyCharacter {
  if (!modelID) return 'stick-figure'
  const match = CHARACTER_BY_MODEL.find(([pattern]) => pattern.test(modelID.toLowerCase()))
  return match ? match[1] : 'stick-figure'
}

export function useBusyCharacter() {
  const { selected } = useModel()
  return computed(() => characterForModel(selected.value?.modelID))
}
