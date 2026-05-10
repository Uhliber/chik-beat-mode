import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'splash',
    component: () => import('@/views/SplashScreen.vue'),
  },
  {
    path: '/menu',
    name: 'menu',
    component: () => import('@/views/MainMenu.vue'),
  },
  {
    path: '/play',
    name: 'play',
    component: () => import('@/views/PlayView.vue'),
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
