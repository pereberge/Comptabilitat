<script setup>
import {onBeforeUnmount,onMounted,reactive,ref} from 'vue';
import {api} from '../services/accounting.js';
import {downloadInvoiceEmail,downloadInvoicePdf,invoiceDeliveryError,invoiceMailto} from '../services/invoice-delivery.js';
import {reportDate as date} from '../services/report-format.js';
import FormDialog from './FormDialog.vue';
const props=defineProps({invoice:Object,invoiceId:[String,Number]}),emit=defineEmits(['close']);
const invoice=ref(null),loading=ref(true),busy=ref(false),error=ref(''),notice=ref(''),formElement=ref(null),attachment=ref('generated'),form=reactive({to:'',subject:'',message:''});let alive=true;
onMounted(async()=>{try{const loaded=props.invoice||await api('/invoices/'+props.invoiceId);if(!alive)return;invoice.value=loaded;form.to=loaded.direction==='issued'?loaded.party_email||'':'';form.subject=('Factura '+loaded.reference+' · '+loaded.issuer_snapshot.name).slice(0,200);form.message='Hola,\n\nAdjunto la factura '+loaded.reference+' de fecha '+date(loaded.invoice_date)+'.\n\nGracias.\n'+loaded.issuer_snapshot.name;attachment.value=loaded.direction==='received'&&loaded.documents.length?String(loaded.documents[0].id):'generated';}catch(cause){if(alive)error.value=invoiceDeliveryError(cause);}finally{if(alive)loading.value=false;}});
function options(){return attachment.value==='generated'?{source:'generated'}:{source:'original',document_id:Number(attachment.value)};}
async function prepare(openMail=false){
 if(busy.value||!invoice.value||!formElement.value.reportValidity())return;busy.value=true;error.value='';notice.value='';
 try{if(openMail){const saved=await downloadInvoicePdf(invoice.value.id,options());if(alive){notice.value='PDF descargado: '+saved.filename+'. Adjunta este archivo al correo que se abre.';window.location.href=invoiceMailto(form);}}else{const saved=await downloadInvoiceEmail(invoice.value.id,{...form,...options()});if(alive)notice.value='Borrador descargado: '+saved.filename+'. Ábrelo con un programa compatible con .eml, revisa el destinatario y envíalo.';}}
 catch(cause){if(alive)error.value=invoiceDeliveryError(cause);}finally{if(alive)busy.value=false;}
}
onBeforeUnmount(()=>{alive=false;});
</script>
<template><Teleport to="body"><FormDialog class="invoice-email-dialog" title="Preparar correo con la factura" :busy="busy" @close="emit('close')">
 <p v-if="loading" role="status">Cargando factura…</p><p v-if="error" role="alert" class="notice error-notice">{{ error }}</p>
 <template v-if="invoice"><p class="invoice-email-context">Factura {{ invoice.reference }} · {{ invoice.party_name }}</p><p class="muted">El borrador .eml incluye el PDF adjunto. Lo revisarás y enviarás desde tu programa de correo.</p>
  <form ref="formElement" @submit.prevent="prepare()"><fieldset :disabled="busy"><label>Para<input v-model="form.to" name="invoice_email_to" type="email" maxlength="254" autocomplete="email" placeholder="correo@cliente.com"><small v-if="!form.to">Puedes completar el destinatario ahora o al abrir el borrador.</small></label><label>Asunto<input v-model="form.subject" name="invoice_email_subject" maxlength="200" required></label><label>Mensaje<textarea v-model="form.message" name="invoice_email_message" rows="7" maxlength="6000"></textarea></label><label v-if="invoice.documents.length">PDF adjunto<select v-model="attachment" name="invoice_email_attachment"><option value="generated">{{ invoice.direction==='issued'?'Factura preparada en PDF':'Resumen de los datos contables en PDF' }}</option><option v-for="document in invoice.documents" :key="document.id" :value="String(document.id)">Original · {{ document.source_name }}</option></select></label><p v-else class="muted">Adjunto: {{ invoice.direction==='issued'?'factura en PDF':'resumen de la factura recibida en PDF' }}.</p>
   <p v-if="notice" class="success-note" role="status">{{ notice }}</p><div class="actions invoice-email-actions"><button class="button primary" :disabled="busy">{{ busy?'Preparando…':'Descargar correo con PDF (.eml)' }}</button><button type="button" class="button" :disabled="busy" @click="prepare(true)">Abrir correo y descargar PDF</button><button type="button" class="button" :disabled="busy" @click="emit('close')">Cerrar</button></div><p class="muted">Si usas «Abrir correo y descargar PDF», tendrás que adjuntar el archivo descargado. El remitente y el envío se gestionan en tu cuenta de correo.</p>
  </fieldset></form>
 </template>
</FormDialog></Teleport></template>