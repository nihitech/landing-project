function clean(v,f=""){return String(v??f).trim();}
function channel(v){const c=clean(v||"WHATSAPP").toUpperCase();return["WHATSAPP","EMAIL","SMS","SYSTEM"].includes(c)?c:"WHATSAPP";}
function direction(v){const d=clean(v||"OUTBOUND").toUpperCase();return["OUTBOUND","INBOUND","AUTO_REPLY","SYSTEM"].includes(d)?d:"OUTBOUND";}
function status(v){const s=clean(v||"QUEUED").toUpperCase();return["QUEUED","SENT","DELIVERED","READ","FAILED","RECEIVED"].includes(s)?s:"QUEUED";}
function renderTemplate(t,data={}){return String(t||"").replace(/\{\{(\w+)\}\}/g,(_,k)=>data[k]??"");}
function waUrl(phone,msg){const d=String(phone||"").replace(/\D/g,"").slice(-10);return d?`https://wa.me/91${d}?text=${encodeURIComponent(msg||"")}`:"";}
function mailto(email,subject,body){return email?`mailto:${email}?subject=${encodeURIComponent(subject||"")}&body=${encodeURIComponent(body||"")}`:"";}
async function logCommunication(db,p={}){const r=await db.query(`INSERT INTO communication_logs(lead_id,customer_name,phone,email,channel,direction,template_key,subject,message_body,provider_name,provider_message_id,status,sent_by,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,[p.lead_id||null,clean(p.customer_name),clean(p.phone),clean(p.email),channel(p.channel),direction(p.direction),clean(p.template_key),clean(p.subject),clean(p.message_body),clean(p.provider_name||"MANUAL"),clean(p.provider_message_id),status(p.status),p.sent_by||null,JSON.stringify(p.metadata||{})]);return r.rows[0];}
module.exports={channel,direction,status,renderTemplate,waUrl,mailto,logCommunication};
