<template>
  <div class="wp-overlay" @click.self="$emit('close')">
    <div class="wp-panel">
      <div class="wp-header">
        <span class="wp-title">{{ title }}</span>
        <button class="wp-close" @click="$emit('close')">×</button>
      </div>
      <iframe
        :src="src"
        class="wp-frame"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; src: string }>();
defineEmits(['close']);
</script>

<style scoped>
.wp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wp-panel {
  background: var(--surface);
  border-radius: 12px;
  width: 960px;
  max-width: 95vw;
  height: 82vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.25);
}

.wp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--faint);
  flex-shrink: 0;
}

.wp-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--dark);
  letter-spacing: 0.02em;
}

.wp-close {
  background: none;
  border: none;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: var(--mid);
  padding: 0 2px;
}

.wp-close:hover {
  color: var(--dark);
}

.wp-frame {
  flex: 1;
  border: none;
  width: 100%;
}
</style>
