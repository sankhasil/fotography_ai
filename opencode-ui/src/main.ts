import { MotionPlugin } from "@vueuse/motion";
import { createApp } from "vue";

import App from "./App.vue";
import "./style.css";

createApp(App).use(MotionPlugin).mount("#app");
