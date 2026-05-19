import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './styles/theme.css';
import { installChikResetCommand } from './dev/resetStorage';

installChikResetCommand();

createApp(App).use(router).mount('#app');
