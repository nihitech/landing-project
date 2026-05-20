
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middleware/auth");

let logger=null; try{ logger=require("../utils/activityLogger"); }catch(e){}
let scoring=null; try{ scoring=require("../services/scoring"); }catch(e){}

function clean(v,f=""){return String(v??f).trim();}
function role(v){return clean(v).toLowerCase();}
function isAdmin(req){return req.user?.is_higher_authority===true||["admin","super_admin","owner","director","ceo"].includes(role(req.user?.role));}
function hasPerm(req,k){return isAdmin(req)||(Array.isArray(req.user?.permissions)&&req.user.permissions.includes(k));}
function parseId(v){if(v===""||v===null||v===undefined)return null;const n=Number(v);return Number.isInteger(n)&&n>0?n:NaN;}
function phone(v){return String(v||"").replace(/\D/g,"").slice(-10);}
function cat(v){const c=clean(v||"AD").toUpperCase();return["AD","EV"].includes(c)?c:"AD";}
function src(v){const s=clean(v||"FIELD_VISIT").toUpperCase().replace(/[\s-]+/g,"_");return["STALL","EVENT","WORKSHOP","PROMOTION","REFERRAL","FIELD_VISIT","FIELD_ACTIVITY","KNOWN_CONTACT","PHONE_ENQUIRY","WALKING_CONTACT","OTHER"].includes(s)?s:"FIELD_VISIT";}
function status(v,f="PENDING_VALIDATION"){const s=clean(v||f).toUpperCase();return["PENDING_VALIDATION","OTP_SENT","OTP_VERIFIED","CONVERTED","REJECTED","DUPLICATE"].includes(s)?s:f;}
function otp(){return String(Math.floor(100000+Math.random()*900000));}
function hash(v){return crypto.createHash("sha256").update(String(v)).digest("hex");}
async function audit(p){try{if(logger?.logActivity) await logger.logActivity(p);}catch(e){}}
function canCreate(req,res,next){const r=role(req.user?.role);if(isAdmin(req)||["sales","sales_executive","sales_consultant","manager","team_leader","field","field_executive"].includes(r)||hasPerm(req,"quick_enquiry.create"))return next();return res.status(403).json({message:"No permission to create quick enquiries"});}
function canReview(req,res,next){const r=role(req.user?.role);if(isAdmin(req)||["telecaller","crm_executive","manager","team_leader","branch_manager"].includes(r)||hasPerm(req,"quick_enquiry.review"))return next();return res.status(403).json({message:"No permission to review quick enquiries"});}
function scoreSafe(d){try{if(scoring?.calculateScore)return scoring.calculateScore(d);}catch(e){} let s=30;if(d.phone)s+=10;if(d.car_interest)s+=10;if(d.source==="REFERRAL")s+=15;return Math.min(s,100);}
function prioritySafe(s){try{if(scoring?.getLeadPriority)return scoring.getLeadPriority(s).toUpperCase();}catch(e){} return s>=70?"HOT":s>=45?"WARM":"COLD";}

async function ensureSchema(){
 await db.query(`CREATE TABLE IF NOT EXISTS quick_enquiries(
 id SERIAL PRIMARY KEY, quick_code VARCHAR(80) UNIQUE, customer_name VARCHAR(200), phone VARCHAR(30), alternate_phone VARCHAR(30), email VARCHAR(200),
 area VARCHAR(150), district VARCHAR(150), pincode VARCHAR(30), vehicle_category VARCHAR(20), fuel_type VARCHAR(80), car_interest VARCHAR(200), variant_interest VARCHAR(200), preferred_color VARCHAR(150),
 source_type VARCHAR(80), source_details TEXT, referral_name VARCHAR(200), referral_phone VARCHAR(30), field_activity_id INTEGER REFERENCES field_activities(id),
 capture_latitude NUMERIC(12,8), capture_longitude NUMERIC(12,8), notes TEXT, quick_status VARCHAR(50) DEFAULT 'PENDING_VALIDATION',
 branch_id INTEGER REFERENCES branches(id), created_by INTEGER REFERENCES users(id), assigned_to INTEGER REFERENCES users(id), reviewed_by INTEGER REFERENCES users(id), reviewed_at TIMESTAMP,
 otp_hash VARCHAR(100), otp_sent_at TIMESTAMP, otp_verified_at TIMESTAMP, otp_verified_by INTEGER REFERENCES users(id), otp_attempts INTEGER DEFAULT 0,
 lead_id INTEGER REFERENCES leads(id), rejection_reason TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
 await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS quick_enquiry_id INTEGER REFERENCES quick_enquiries(id), ADD COLUMN IF NOT EXISTS enquiry_origin VARCHAR(80), ADD COLUMN IF NOT EXISTS field_activity_id INTEGER REFERENCES field_activities(id), ADD COLUMN IF NOT EXISTS field_activity_source VARCHAR(100), ADD COLUMN IF NOT EXISTS lead_capture_latitude NUMERIC(12,8), ADD COLUMN IF NOT EXISTS lead_capture_longitude NUMERIC(12,8)`);
 await db.query(`CREATE INDEX IF NOT EXISTS idx_quick_enquiries_phone ON quick_enquiries(phone)`);
 await db.query(`CREATE INDEX IF NOT EXISTS idx_quick_enquiries_status ON quick_enquiries(quick_status)`);
 await db.query(`CREATE INDEX IF NOT EXISTS idx_quick_enquiries_branch ON quick_enquiries(branch_id)`);
}

async function defaultBranch(){const r=await db.query(`SELECT id FROM branches WHERE branch_code='MAIN' ORDER BY id ASC LIMIT 1`);return r.rows[0]?.id||null;}
async function userBranch(id){const r=await db.query(`SELECT branch_id FROM users WHERE id=$1 LIMIT 1`,[id]);return r.rows[0]?.branch_id||null;}
async function leastLoaded(branchId,vehicleCategory){if(!branchId)return null;const r=await db.query(`SELECT u.id,u.branch_id,COUNT(l.id)::int AS lead_count FROM users u LEFT JOIN leads l ON l.assigned_to=u.id AND l.status NOT IN ('CLOSED','LOST') WHERE LOWER(u.role)='sales' AND COALESCE(u.status,'ACTIVE')='ACTIVE' AND u.branch_id=$1 AND (COALESCE(u.vehicle_category_scope,'ALL')='ALL' OR UPPER(u.vehicle_category_scope)=$2) GROUP BY u.id,u.branch_id ORDER BY lead_count ASC,u.id ASC LIMIT 1`,[branchId,vehicleCategory]);return r.rows[0]||null;}

router.get("/",auth,async(req,res)=>{
 try{await ensureSchema();const vals=[];const clauses=["1=1"];if(!isAdmin(req)){const r=role(req.user?.role);if(["sales","sales_executive","sales_consultant","field","field_executive"].includes(r)){vals.push(req.user.id);clauses.push(`q.created_by=$${vals.length}`);}else if(req.user?.branch_id){vals.push(req.user.branch_id);clauses.push(`q.branch_id=$${vals.length}`);}}
 if(req.query.status){vals.push(status(req.query.status));clauses.push(`q.quick_status=$${vals.length}`);}
 if(req.query.search){vals.push(`%${clean(req.query.search).toLowerCase()}%`);clauses.push(`(LOWER(COALESCE(q.customer_name,'')) LIKE $${vals.length} OR LOWER(COALESCE(q.phone,'')) LIKE $${vals.length} OR LOWER(COALESCE(q.source_type,'')) LIKE $${vals.length})`);}
 const r=await db.query(`SELECT q.*,b.branch_name,cu.name AS created_by_name,au.name AS assigned_user_name,fa.activity_name AS field_activity_name FROM quick_enquiries q LEFT JOIN branches b ON b.id=q.branch_id LEFT JOIN users cu ON cu.id=q.created_by LEFT JOIN users au ON au.id=q.assigned_to LEFT JOIN field_activities fa ON fa.id=q.field_activity_id WHERE ${clauses.join(" AND ")} ORDER BY q.created_at DESC LIMIT 500`,vals);res.json(r.rows);
 }catch(e){console.error("QUICK LIST ERROR:",e);res.status(500).json({message:"Failed to load quick enquiries"});}
});

router.post("/",auth,canCreate,async(req,res)=>{
 try{await ensureSchema();const d=req.body||{};const p=phone(d.phone);if(!clean(d.customer_name||d.name)||p.length!==10)return res.status(400).json({message:"Customer name and valid phone are required"});
 const vc=cat(d.vehicle_category);let branchId=parseId(d.branch_id)||req.user?.branch_id||await userBranch(req.user.id)||await defaultBranch();if(Number.isNaN(branchId)||!branchId)return res.status(400).json({message:"Branch is required"});
 let assigned=parseId(d.assigned_to);if(Number.isNaN(assigned))return res.status(400).json({message:"Invalid assigned user"});if(!assigned)assigned=req.user.id;
 const code=`QE-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
 const r=await db.query(`INSERT INTO quick_enquiries(quick_code,customer_name,phone,alternate_phone,email,area,district,pincode,vehicle_category,fuel_type,car_interest,variant_interest,preferred_color,source_type,source_details,referral_name,referral_phone,field_activity_id,capture_latitude,capture_longitude,notes,quick_status,branch_id,created_by,assigned_to) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'PENDING_VALIDATION',$22,$23,$24) RETURNING *`,
 [code,clean(d.customer_name||d.name),p,phone(d.alternate_phone),clean(d.email),clean(d.area),clean(d.district),clean(d.pincode),vc,clean(d.fuel_type),clean(d.car_interest),clean(d.variant_interest),clean(d.preferred_color),src(d.source_type),clean(d.source_details),clean(d.referral_name),phone(d.referral_phone),parseId(d.field_activity_id),d.capture_latitude||null,d.capture_longitude||null,clean(d.notes),branchId,req.user.id,assigned]);
 await audit({req,user_id:req.user.id,action:"QUICK_ENQUIRY_CREATED",module_name:"QUICK_ENQUIRY",entity_type:"QUICK_ENQUIRY",entity_id:r.rows[0].id,branch_id:branchId,new_value:"PENDING_VALIDATION",remarks:`Quick enquiry created: ${r.rows[0].customer_name}`});
 res.status(201).json({message:"Quick enquiry created",quick_enquiry:r.rows[0]});
 }catch(e){console.error("QUICK CREATE ERROR:",e);res.status(500).json({message:"Failed to create quick enquiry"});}
});

router.post("/:id/send-otp",auth,canReview,async(req,res)=>{
 try{await ensureSchema();const id=parseId(req.params.id);const r=await db.query(`SELECT * FROM quick_enquiries WHERE id=$1 LIMIT 1`,[id]);if(!r.rows.length)return res.status(404).json({message:"Quick enquiry not found"});const o=otp();await db.query(`UPDATE quick_enquiries SET quick_status='OTP_SENT',otp_hash=$1,otp_sent_at=NOW(),otp_attempts=0,updated_at=NOW() WHERE id=$2`,[hash(o),id]);await audit({req,user_id:req.user.id,action:"QUICK_ENQUIRY_OTP_SENT",module_name:"QUICK_ENQUIRY",entity_type:"QUICK_ENQUIRY",entity_id:id,branch_id:r.rows[0].branch_id,new_value:"OTP_SENT",remarks:"OTP sent"});res.json({message:"OTP generated",dev_otp:process.env.NODE_ENV==="production"?undefined:o});
 }catch(e){console.error("OTP SEND ERROR:",e);res.status(500).json({message:"Failed to send OTP"});}
});

router.post("/:id/verify-otp",auth,canReview,async(req,res)=>{
 try{await ensureSchema();const id=parseId(req.params.id);const o=clean(req.body.otp);if(!o)return res.status(400).json({message:"OTP required"});const r=await db.query(`SELECT * FROM quick_enquiries WHERE id=$1 LIMIT 1`,[id]);if(!r.rows.length)return res.status(404).json({message:"Quick enquiry not found"});const q=r.rows[0];if(!q.otp_hash)return res.status(400).json({message:"OTP not generated"});if(Number(q.otp_attempts||0)>=5)return res.status(400).json({message:"Maximum OTP attempts exceeded"});if(q.otp_hash!==hash(o)){await db.query(`UPDATE quick_enquiries SET otp_attempts=COALESCE(otp_attempts,0)+1 WHERE id=$1`,[id]);return res.status(400).json({message:"Invalid OTP"});}
 await db.query(`UPDATE quick_enquiries SET quick_status='OTP_VERIFIED',otp_verified_at=NOW(),otp_verified_by=$1,updated_at=NOW() WHERE id=$2`,[req.user.id,id]);await audit({req,user_id:req.user.id,action:"QUICK_ENQUIRY_OTP_VERIFIED",module_name:"QUICK_ENQUIRY",entity_type:"QUICK_ENQUIRY",entity_id:id,branch_id:q.branch_id,new_value:"OTP_VERIFIED",remarks:"OTP verified"});res.json({message:"OTP verified"});
 }catch(e){console.error("OTP VERIFY ERROR:",e);res.status(500).json({message:"Failed to verify OTP"});}
});

router.post("/:id/convert",auth,canReview,async(req,res)=>{
 const client=await db.connect();
 try{await ensureSchema();const id=parseId(req.params.id);await client.query("BEGIN");const r=await client.query(`SELECT * FROM quick_enquiries WHERE id=$1 FOR UPDATE`,[id]);if(!r.rows.length){await client.query("ROLLBACK");return res.status(404).json({message:"Quick enquiry not found"});}const q=r.rows[0];if(q.lead_id){await client.query("ROLLBACK");return res.status(400).json({message:"Already converted"});}if(q.quick_status!=="OTP_VERIFIED"&&req.body.force_convert!==true&&req.body.force_convert!=="true"){await client.query("ROLLBACK");return res.status(400).json({message:"OTP verification required before conversion"});}
 const vc=cat(q.vehicle_category);const branchId=parseId(req.body.branch_id||q.branch_id)||await defaultBranch();let assigned=parseId(req.body.assigned_to||q.assigned_to);if(!assigned){const u=await leastLoaded(branchId,vc);assigned=u?.id||null;}const sc=scoreSafe({phone:q.phone,car_interest:q.car_interest,source:q.source_type});const pr=prioritySafe(sc);
 const dup=await client.query(`SELECT id FROM leads WHERE phone=$1 ORDER BY created_at DESC LIMIT 1`,[q.phone]);let leadId;
 if(dup.rows.length){leadId=dup.rows[0].id;await client.query(`UPDATE leads SET updated_at=NOW(),notes=COALESCE(notes,'')||$1,quick_enquiry_id=$2,enquiry_origin='QUICK_ENQUIRY',field_activity_id=COALESCE($3,field_activity_id),field_activity_source=COALESCE($4,field_activity_source) WHERE id=$5`,[`\\nQuick enquiry converted. Source: ${q.source_type}`,q.id,q.field_activity_id,q.source_type,leadId]);}
 else{const lr=await client.query(`INSERT INTO leads(name,phone,alternate_phone,email,area,district,pincode,vehicle_category,fuel_type,car_interest,variant_interest,preferred_color,source,lead_type,action_type,score,priority,status,assigned_to,branch_id,assigned_branch_id,notes,quick_enquiry_id,enquiry_origin,field_activity_id,field_activity_source,lead_capture_latitude,lead_capture_longitude,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'DETAILED_ENQUIRY','QUICK_ENQUIRY',$14,$15,'NEW',$16,$17,$17,$18,$19,'QUICK_ENQUIRY',$20,$21,$22,$23,NOW(),NOW()) RETURNING id`,[q.customer_name,q.phone,q.alternate_phone,q.email,q.area,q.district,q.pincode,vc,q.fuel_type,q.car_interest,q.variant_interest,q.preferred_color,q.source_type,sc,pr,assigned,branchId,q.notes,q.id,q.field_activity_id,q.source_type,q.capture_latitude,q.capture_longitude]);leadId=lr.rows[0].id;}
 await client.query(`UPDATE quick_enquiries SET quick_status='CONVERTED',reviewed_by=$1,reviewed_at=NOW(),assigned_to=$2,branch_id=$3,lead_id=$4,updated_at=NOW() WHERE id=$5`,[req.user.id,assigned,branchId,leadId,id]);await audit({req,user_id:req.user.id,lead_id:leadId,action:"QUICK_ENQUIRY_CONVERTED_TO_LEAD",module_name:"QUICK_ENQUIRY",entity_type:"LEAD",entity_id:leadId,branch_id:branchId,new_value:"CONVERTED",remarks:`Quick enquiry converted. Source: ${q.source_type}`});await client.query("COMMIT");res.json({message:"Quick enquiry converted to lead",lead_id:leadId,assigned_to:assigned,branch_id:branchId});
 }catch(e){await client.query("ROLLBACK");console.error("CONVERT ERROR:",e);res.status(500).json({message:"Failed to convert quick enquiry"});}finally{client.release();}
});

module.exports=router;
