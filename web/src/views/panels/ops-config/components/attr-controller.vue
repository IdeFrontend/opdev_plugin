<script setup lang="ts" generic="T extends FormAttributeType">
import i18next from 'i18next';

import type {
  FormAttribute, FormAttributeType,
} from '@web/views/panels/ops-config/types';

defineProps<{
  attr: FormAttribute<T>;
}>();

const modelValue = defineModel();

/** Resolve label for current locale; supports both 'zh-cn' and legacy 'zh' keys. */
function getI18nLabel(labels: Record<string, string>): string {
  const lang = i18next.language;
  return labels[lang] ?? labels['zh-cn'] ?? labels['zh'] ?? labels['en'] ?? '';
}
</script>

<template>
  <a-form-item :label="getI18nLabel(attr.label as Record<string, string>)">
    <a-switch
      v-if="attr.type === 'boolean'"
      v-model:checked="modelValue as unknown as boolean"
    />
    <a-input v-else-if="attr.type === 'string'" />
    <a-input-number v-else-if="attr.type === 'number'" />
    <a-select v-else-if="attr.type === 'enum'">
      <template v-for="option in attr.options" :key="String(option.value)">
        <a-select-option :value="option.value">
          {{ getI18nLabel(option.label as Record<string, string>) }}
        </a-select-option>
      </template>
    </a-select>
  </a-form-item>
</template>
