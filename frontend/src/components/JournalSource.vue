<script setup>
import {t} from '../locales/accounting.js';
defineProps({entry:{type:Object,required:true}});
</script>
<template><small v-if="entry.source_journal_code" class="journal-source">{{ t.originalJournal }}: {{ entry.source_journal_code }} · {{ t.originalReference }}: {{ entry.source_entry_reference }}<template v-if="entry.source_line_number"> · {{ t.originalLine }}: {{ entry.source_line_number }}</template></small></template>
<style scoped>.journal-source{display:block;margin-top:4px;color:#65748a;font-size:11px;font-weight:400;white-space:nowrap}</style>
