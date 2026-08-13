import { createApp } from 'vue'
import App from './App.vue'

// Imported explicitly because the "Composed" example uses only primitives,
// which ship no CSS of their own.
import '../../src/components/preset/table.css'
import './styles.css'

createApp(App).mount('#app')
