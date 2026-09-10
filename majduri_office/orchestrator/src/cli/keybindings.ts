import { useState } from "react"
import { useInput } from "ink"

interface Keybindings {
  [key: string]: () => void
}

export function useKeybindings(keybindings: Keybindings) {
  useInput((input, key) => {
    const combo = []
    if (key.ctrl) combo.push("ctrl")
    if (key.meta) combo.push("meta")
    if (key.shift) combo.push("shift")
    combo.push(input)

    const keyString = combo.join("+")
    if (keybindings[keyString]) {
      keybindings[keyString]()
    }
  })
}
