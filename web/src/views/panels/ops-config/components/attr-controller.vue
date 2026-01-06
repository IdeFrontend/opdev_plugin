<script setup lang="ts" generic="T extends FormAttributeType">
import i18next from 'i18next';

import type {
  FormAttribute, FormAttributeType,
} from '@web/views/panels/ops-config/types';

defineProps<{
  attr: FormAttribute<T>;
}>();

const modelValue = defineModel();
</script>

<template>
  <a-form-item :label="attr.label[i18next.language]">
    <a-switch
      v-if="attr.type === 'boolean'"
      v-model:checked="modelValue as unknown as boolean"
    />
    <a-input v-else-if="attr.type === 'string'" />
    <a-input-number v-else-if="attr.type === 'number'" />
    <a-select v-else-if="attr.type === 'enum'">
      <template v-for="option in attr.options">
        <a-select-option :value="option.value">
          {{
            option.label[i18next.language]
          }}
        </a-select-option>
      </template>
    </a-select>
  </a-form-item>
</template>
