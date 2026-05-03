import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * Single source of truth for the current viewport size and the "is this mobile?" flag.
 * Components branch on `isMobile` to swap to a portrait-friendly layout.
 *
 * Threshold matches Tailwind's `md` breakpoint (768 px). Anything narrower → mobile.
 */
const MOBILE_BREAKPOINT_PX = 768;

export function useResponsive() {
  const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const height = ref(typeof window !== 'undefined' ? window.innerHeight : 768);

  const onResize = () => {
    width.value = window.innerWidth;
    height.value = window.innerHeight;
  };

  onMounted(() => {
    window.addEventListener('resize', onResize, { passive: true });
    onResize();
  });
  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize);
  });

  const isMobile = computed(() => width.value < MOBILE_BREAKPOINT_PX);

  return { width, height, isMobile };
}
