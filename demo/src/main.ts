import { createApp } from 'vue'
import App from './App.vue'

// Imported explicitly: several views use only primitives, which ship no CSS of
// their own, and the package barrel deliberately does not import this file.
import '../../src/components/preset/table.css'
import './styles.css'

createApp(App).mount('#app')
