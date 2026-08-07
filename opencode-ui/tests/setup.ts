import { config } from '@vue/test-utils'

// v-motion is registered globally by the MotionPlugin in main.ts. Stub the
// directive so component tests render without importing the plugin.
config.global.directives = { motion: {} }
