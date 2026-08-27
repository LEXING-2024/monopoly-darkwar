<script setup lang="ts">
import { store } from '../store'
import BaseModal from './BaseModal.vue'
</script>

<template>
  <BaseModal v-if="store.noMoneyToast" width="min(400px, 92vw)">
      <div class="modal-title">💰 资金不足</div>
      <div class="modal-body">
        <p class="big">
          {{ store.noMoneyToast.what }}需要 ￥{{ store.noMoneyToast.need }}，
          你现有 ￥{{ store.noMoneyToast.cash }}，无法执行！
        </p>
      </div>
      <div class="modal-actions">
        <button class="btn primary" @click="store.noMoneyToast = null">确定</button>
      </div>
  </BaseModal>
</template>

<style scoped>
.modal-title { font-size: 20px; font-weight: bold; color: #5a3a1a; margin-bottom: 10px; }
.big { font-size: 15px; color: #4a3018; line-height: 1.55; }
.modal-actions { display: flex; gap: 10px; margin-top: 16px; justify-content: center; }
</style>
