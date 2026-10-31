import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// Import Bootsrap styles and JS
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'

// Our global styles
import './assets/styles.css'
import { startColorMode } from './lib/colorMode'

// Light or dark colours before the first paint
startColorMode()

const app = createApp(App)

app.use(router)

app.mount('#app')
