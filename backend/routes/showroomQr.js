
const express = require("express");
const crypto = require("crypto");
const QRCode = require("qrcode");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middleware/auth");
const assignmentEngine = require("../services/assignmentEngine");
const { calculateScore, getLeadPriority } = require("../services/scoring");

let logger = null;
try { logger = require("../utils/activityLogger"); } catch(e) {}

const CONSENT_TEXT = "I agree that the showroom/dealer may use my enquiry information for contacting me, service improvement, future vehicle suggestions, analytics, customer journey insights, and AI-assisted business intelligence. I understand that my data will be used only for business/service improvement and customer support purposes.";

function clean(v, f=""){ return String(v ?? f).trim(); }
function role(v){ return clean(v).toLowerCase(); }
function phone(v){ return String(v || "").replace(/\D/g,"").slice(-10); }
function parseId(v){ if(v==="" || v===null || v===undefined) return null; const n=Number(v); return Number.isInteger(n)&&n>0?n:NaN; }
function cat(v){ const c=clean(v||"AD").toUpperCase(); return ["AD","EV"].includes(c)?c:"AD"; }
function isAdmin(req){ return req.user?.is_higher_authority===true || ["admin","super_admin","owner","director","ceo"].includes(role(req.user?.role)); }
function hasPerm(req,k){ if(isAdmin(req)) return true; return Array.isArray(req.user?.permissions) && req.user.permissions.includes(k); }
function canManage(req,res,next){ if(isAdmin(req)||["receptionist","manager","team_leader"].includes(role(req.user?.role))||hasPerm(req,"showroom_qr.manage")) return next(); return res.status(403).json({message:"No permission to manage showroom QR"}); }
function canReview(req,res,next){ if(isAdmin(req)||["receptionist","manager","team_leader","telecaller"].includes(role(req.user?.role))||hasPerm(req,"showroom_qr.review")) return next(); return res.status(403).json({message:"No permission to review showroom enquiries"}); }
async function audit(p){ try{ if(logger?.logActivity) await logger.logActivity(p); }catch(e){} }
function baseUrl(req){ return (req.headers.origin || `${req.headers["x-forwarded-proto"]||req.protocol||"https"}://${req.headers["x-forwarded-host"]||req.headers.host}`).replace(/\/$/,""); }
function code(){ return `QR-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`; }

async function ensureSchema(){
 await db.query(`
 CREATE TABLE IF NOT EXISTS showroom_qr_sessions(
 id SERIAL PRIMARY KEY, session_code VARCHAR(80) UNIQUE NOT NULL, branch_id INTEGER REFERENCES branches(id),
 session_date DATE DEFAULT CURRENT_DATE, session_name VARCHAR(200), qr_status VARCHAR(40) DEFAULT 'ACTIVE',
 expires_at TIMESTAMP, created_by INTEGER REFERENCES users(id), closed_by INTEGER REFERENCES users(id),
 closed_at TIMESTAMP, remarks TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
 await db.query(`
 CREATE TABLE IF NOT EXISTS showroom_qr_submissions(
 id SERIAL PRIMARY KEY, session_id INTEGER REFERENCES showroom_qr_sessions(id) ON DELETE SET NULL, session_code VARCHAR(80),
 submission_method VARCHAR(50) DEFAULT 'CUSTOMER_PHONE', submission_status VARCHAR(40) DEFAULT 'SUBMITTED',
 customer_name VARCHAR(200), phone VARCHAR(30), alternate_phone VARCHAR(30), email VARCHAR(200), area VARCHAR(150), district VARCHAR(150), pincode VARCHAR(30),
 vehicle_category VARCHAR(20), fuel_type VARCHAR(80), car_interest VARCHAR(200), variant_interest VARCHAR(200), preferred_color VARCHAR(150),
 source VARCHAR(80) DEFAULT 'SHOWROOM_QR', lead_type VARCHAR(80) DEFAULT 'SHOWROOM_QR_ENQUIRY', notes TEXT,
 consent_accepted BOOLEAN DEFAULT false, consent_text TEXT, consent_accepted_at TIMESTAMP, consent_ip VARCHAR(100), consent_user_agent TEXT,
 receptionist_id INTEGER REFERENCES users(id), reviewed_by INTEGER REFERENCES users(id), reviewed_at TIMESTAMP,
 assigned_to INTEGER REFERENCES users(id), assigned_branch_id INTEGER REFERENCES branches(id), lead_id INTEGER REFERENCES leads(id),
 created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
 await db.query(`
 ALTER TABLE leads
 ADD COLUMN IF NOT EXISTS qr_session_id INTEGER REFERENCES showroom_qr_sessions(id),
 ADD COLUMN IF NOT EXISTS qr_submission_id INTEGER REFERENCES showroom_qr_submissions(id),
 ADD COLUMN IF NOT EXISTS enquiry_origin VARCHAR(80),
 ADD COLUMN IF NOT EXISTS submission_method VARCHAR(80),
 ADD COLUMN IF NOT EXISTS consent_accepted BOOLEAN DEFAULT false,
 ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMP,
 ADD COLUMN IF NOT EXISTS consent_text TEXT`);
 await db.query(`CREATE INDEX IF NOT EXISTS idx_showroom_qr_sessions_code ON showroom_qr_sessions(session_code)`);
 await db.query(`CREATE INDEX IF NOT EXISTS idx_showroom_qr_sessions_branch ON showroom_qr_sessions(branch_id)`);
 await db.query(`CREATE INDEX IF NOT EXISTS idx_showroom_qr_submissions_session ON showroom_qr_submissions(session_id)`);
 await db.query(`CREATE INDEX IF NOT EXISTS idx_showroom_qr_submissions_phone ON showroom_qr_submissions(phone)`);
}

async function defaultBranch(){
 const r=await db.query(`SELECT id FROM branches WHERE branch_code='MAIN' ORDER BY id ASC LIMIT 1`);
 return r.rows[0]?.id || null;
}
async function leastLoaded(branchId, vehicleCategory){
 if(!branchId) return null;
 const r=await db.query(`
 SELECT u.id,u.branch_id,COUNT(l.id)::int AS lead_count FROM users u
 LEFT JOIN leads l ON l.assigned_to=u.id AND l.status NOT IN ('CLOSED','LOST')
 WHERE LOWER(u.role)='sales' AND COALESCE(u.status,'ACTIVE')='ACTIVE' AND u.branch_id=$1
 AND (COALESCE(u.vehicle_category_scope,'ALL')='ALL' OR UPPER(u.vehicle_category_scope)=$2)
 GROUP BY u.id,u.branch_id ORDER BY lead_count ASC,u.id ASC LIMIT 1`,[branchId,vehicleCategory]);
 return r.rows[0] || null;
}


function publicFormUrl(req, sessionCode) {
    return `${baseUrl(req)}/showroom-qr.html?code=${encodeURIComponent(sessionCode)}`;
}

router.post("/sessions", auth, canManage, async(req,res)=>{
 try{
  await ensureSchema();
  const branchId=parseId(req.body.branch_id||req.user?.branch_id)||await defaultBranch();
  if(!branchId) return res.status(400).json({message:"Branch is required"});
  const ex=await db.query(`SELECT * FROM showroom_qr_sessions WHERE branch_id=$1 AND session_date=CURRENT_DATE AND qr_status='ACTIVE' ORDER BY id DESC LIMIT 1`,[branchId]);
  if(ex.rows.length) return res.json({message:"Active QR session already exists",session:ex.rows[0],public_url:`${baseUrl(req)}/showroom-qr.html?code=${encodeURIComponent(ex.rows[0].session_code)}`});
  const sessionCode=code();
  const r=await db.query(`INSERT INTO showroom_qr_sessions(session_code,branch_id,session_name,expires_at,created_by,remarks) VALUES($1,$2,$3,CURRENT_DATE+INTERVAL '1 day',$4,$5) RETURNING *`,
   [sessionCode,branchId,clean(req.body.session_name,`Showroom QR - ${new Date().toLocaleDateString("en-IN")}`),req.user.id,clean(req.body.remarks)]);
  await audit({req,user_id:req.user.id,action:"SHOWROOM_QR_SESSION_CREATED",module_name:"SHOWROOM_QR",entity_type:"SHOWROOM_QR_SESSION",entity_id:r.rows[0].id,branch_id:branchId,new_value:sessionCode,remarks:`Daily QR session created`});
  res.status(201).json({message:"Showroom QR session created",session:r.rows[0],public_url:`${baseUrl(req)}/showroom-qr.html?code=${encodeURIComponent(sessionCode)}`});
 }catch(e){ console.error("QR SESSION ERROR:",e); res.status(500).json({message:"Failed to create QR session"}); }
});


router.get("/sessions/:id/qr", auth, canManage, async(req,res)=>{
 try{
  await ensureSchema();
  const id=parseId(req.params.id);
  if(!id) return res.status(400).json({message:"Invalid QR session"});
  const r=await db.query(`SELECT * FROM showroom_qr_sessions WHERE id=$1 LIMIT 1`,[id]);
  if(!r.rows.length) return res.status(404).json({message:"QR session not found"});
  const session=r.rows[0];
  const url=publicFormUrl(req, session.session_code);
  const svg=await QRCode.toString(url,{type:"svg",margin:2,errorCorrectionLevel:"M",width:280});
  const data_url=await QRCode.toDataURL(url,{margin:2,errorCorrectionLevel:"M",width:280});
  res.json({session_id:session.id,session_code:session.session_code,url,svg,data_url});
 }catch(e){
  console.error("QR GENERATE ERROR:",e);
  res.status(500).json({message:"Failed to generate QR"});
 }
});


router.get("/sessions", auth, canManage, async(req,res)=>{
 try{
  await ensureSchema();
  const vals=[]; const clauses=["1=1"];
  if(!isAdmin(req)&&req.user?.branch_id){ vals.push(req.user.branch_id); clauses.push(`s.branch_id=$${vals.length}`); }
  const r=await db.query(`
  SELECT s.*,b.branch_name,b.branch_code,u.name AS created_by_name,COUNT(q.id)::int AS submissions_count
  FROM showroom_qr_sessions s
  LEFT JOIN branches b ON b.id=s.branch_id
  LEFT JOIN users u ON u.id=s.created_by
  LEFT JOIN showroom_qr_submissions q ON q.session_id=s.id
  WHERE ${clauses.join(" AND ")}
  GROUP BY s.id,b.branch_name,b.branch_code,u.name
  ORDER BY s.created_at DESC LIMIT 100`,vals);
  res.json(r.rows);
 }catch(e){ console.error("QR SESSIONS LIST ERROR:",e); res.status(500).json({message:"Failed to load QR sessions"}); }
});

router.get("/public/session/:code", async(req,res)=>{
 try{
  await ensureSchema();
  const r=await db.query(`SELECT s.id,s.session_code,s.session_name,s.qr_status,s.session_date,s.expires_at,b.branch_name,b.branch_code FROM showroom_qr_sessions s LEFT JOIN branches b ON b.id=s.branch_id WHERE s.session_code=$1 LIMIT 1`,[clean(req.params.code)]);
  if(!r.rows.length) return res.status(404).json({message:"QR session not found"});
  const s=r.rows[0];
  if(s.qr_status!=="ACTIVE" || (s.expires_at && new Date(s.expires_at).getTime()<Date.now())) return res.status(400).json({message:"QR session expired or closed"});
  res.json({session:s,consent_text:CONSENT_TEXT});
 }catch(e){ console.error("PUBLIC SESSION ERROR:",e); res.status(500).json({message:"Failed to load QR session"}); }
});

router.post("/public/submit/:code", async(req,res)=>{
 try{
  await ensureSchema();
  const data=req.body||{};
  const sr=await db.query(`SELECT * FROM showroom_qr_sessions WHERE session_code=$1 LIMIT 1`,[clean(req.params.code)]);
  if(!sr.rows.length) return res.status(404).json({message:"QR session not found"});
  const s=sr.rows[0];
  if(s.qr_status!=="ACTIVE" || (s.expires_at && new Date(s.expires_at).getTime()<Date.now())) return res.status(400).json({message:"QR session expired or closed"});
  const p=phone(data.phone);
  if(!clean(data.customer_name||data.name)||p.length!==10) return res.status(400).json({message:"Customer name and valid phone are required"});
  if(data.consent_accepted!==true && data.consent_accepted!=="true") return res.status(400).json({message:"Consent is required"});
  const r=await db.query(`
  INSERT INTO showroom_qr_submissions(session_id,session_code,submission_method,customer_name,phone,alternate_phone,email,area,district,pincode,vehicle_category,fuel_type,car_interest,variant_interest,preferred_color,notes,consent_accepted,consent_text,consent_accepted_at,consent_ip,consent_user_agent,assigned_branch_id)
  VALUES($1,$2,'CUSTOMER_PHONE',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,$16,NOW(),$17,$18,$19) RETURNING id,submission_status`,
  [s.id,s.session_code,clean(data.customer_name||data.name),p,phone(data.alternate_phone),clean(data.email),clean(data.area),clean(data.district),clean(data.pincode),cat(data.vehicle_category),clean(data.fuel_type),clean(data.car_interest),clean(data.variant_interest),clean(data.preferred_color),clean(data.notes),CONSENT_TEXT,clean(req.headers["x-forwarded-for"]||req.socket?.remoteAddress),clean(req.headers["user-agent"]),s.branch_id]);
  res.status(201).json({message:"Showroom enquiry submitted",submission_id:r.rows[0].id,status:r.rows[0].submission_status});
 }catch(e){ console.error("PUBLIC QR SUBMIT ERROR:",e); res.status(500).json({message:"Failed to submit showroom enquiry"}); }
});


router.post("/assisted-submit/:sessionId", auth, canManage, async(req,res)=>{
 try{
  await ensureSchema();
  const sessionId=parseId(req.params.sessionId);
  if(!sessionId) return res.status(400).json({message:"Invalid QR session"});
  const sr=await db.query(`SELECT * FROM showroom_qr_sessions WHERE id=$1 LIMIT 1`,[sessionId]);
  if(!sr.rows.length) return res.status(404).json({message:"QR session not found"});
  const s=sr.rows[0];
  if(s.qr_status!=="ACTIVE") return res.status(400).json({message:"QR session is not active"});
  const data=req.body||{};
  const p=phone(data.phone);
  if(!clean(data.customer_name||data.name)||p.length!==10) return res.status(400).json({message:"Customer name and valid phone are required"});
  if(data.consent_accepted!==true && data.consent_accepted!=="true") return res.status(400).json({message:"Consent confirmation is required"});
  const reason=clean(data.assisted_reason||"CUSTOMER_PHONE_UNAVAILABLE");
  const notes=[clean(data.notes), `Assisted entry reason: ${reason}`].filter(Boolean).join("\\n");
  const r=await db.query(`
  INSERT INTO showroom_qr_submissions(session_id,session_code,submission_method,customer_name,phone,alternate_phone,email,area,district,pincode,vehicle_category,fuel_type,car_interest,variant_interest,preferred_color,notes,consent_accepted,consent_text,consent_accepted_at,consent_ip,consent_user_agent,receptionist_id,assigned_branch_id)
  VALUES($1,$2,'RECEPTIONIST_SYSTEM',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,$16,NOW(),$17,$18,$19,$20) RETURNING *`,
  [s.id,s.session_code,clean(data.customer_name||data.name),p,phone(data.alternate_phone),clean(data.email),clean(data.area),clean(data.district),clean(data.pincode),cat(data.vehicle_category),clean(data.fuel_type),clean(data.car_interest),clean(data.variant_interest),clean(data.preferred_color),notes,CONSENT_TEXT,clean(req.headers["x-forwarded-for"]||req.socket?.remoteAddress),clean(req.headers["user-agent"]),req.user.id,s.branch_id]);
  await audit({req,user_id:req.user.id,action:"SHOWROOM_ASSISTED_ENQUIRY_CREATED",module_name:"SHOWROOM_QR",entity_type:"SHOWROOM_QR_SUBMISSION",entity_id:r.rows[0].id,branch_id:s.branch_id,remarks:`Receptionist assisted enquiry created. Reason: ${reason}`});
  res.status(201).json({message:"Assisted showroom enquiry created",submission:r.rows[0]});
 }catch(e){ console.error("ASSISTED QR ERROR:",e); res.status(500).json({message:"Failed to create assisted showroom enquiry"}); }
});


router.get("/submissions", auth, canReview, async(req,res)=>{
 try{
  await ensureSchema();
  const vals=[]; const clauses=["1=1"];
  if(!isAdmin(req)&&req.user?.branch_id){ vals.push(req.user.branch_id); clauses.push(`q.assigned_branch_id=$${vals.length}`); }
  const r=await db.query(`
  SELECT q.*,s.session_name,s.session_date,b.branch_name,b.branch_code,au.name AS assigned_user_name
  FROM showroom_qr_submissions q
  LEFT JOIN showroom_qr_sessions s ON s.id=q.session_id
  LEFT JOIN branches b ON b.id=q.assigned_branch_id
  LEFT JOIN users au ON au.id=q.assigned_to
  WHERE ${clauses.join(" AND ")}
  ORDER BY q.created_at DESC LIMIT 500`,vals);
  res.json(r.rows);
 }catch(e){ console.error("SUBMISSIONS LIST ERROR:",e); res.status(500).json({message:"Failed to load QR submissions"}); }
});

router.post("/submissions/:id/convert", auth, canReview, async(req,res)=>{
 const client=await db.connect();
 try{
  await ensureSchema();
  const id=parseId(req.params.id);
  if(!id) return res.status(400).json({message:"Invalid submission"});
  await client.query("BEGIN");
  const sr=await client.query(`SELECT * FROM showroom_qr_submissions WHERE id=$1 FOR UPDATE`,[id]);
  if(!sr.rows.length){ await client.query("ROLLBACK"); return res.status(404).json({message:"Submission not found"}); }
  const s=sr.rows[0];
  if(s.lead_id){ await client.query("ROLLBACK"); return res.status(400).json({message:"Already converted"}); }
  const branchId=parseId(req.body.branch_id||s.assigned_branch_id)||await defaultBranch();
  const vehicleCategory=cat(s.vehicle_category);
  let assignedTo=parseId(req.body.assigned_to);
  if(Number.isNaN(assignedTo)){ await client.query("ROLLBACK"); return res.status(400).json({message:"Invalid assigned user"}); }
  if(!assignedTo){ const u=await leastLoaded(branchId,vehicleCategory); assignedTo=u?.id||null; }
  const score=calculateScore({name:s.customer_name,phone:s.phone,car_interest:s.car_interest,action_type:"SHOWROOM_QR_ENQUIRY",source:"SHOWROOM_QR"});
  const priority=getLeadPriority(score).toUpperCase();
  const dup=await client.query(`SELECT id FROM leads WHERE phone=$1 ORDER BY created_at DESC LIMIT 1`,[s.phone]);
  let leadId;
  if(dup.rows.length){
    leadId=dup.rows[0].id;
    await client.query(`UPDATE leads SET updated_at=NOW(), notes=COALESCE(notes,'') || $1, qr_session_id=$2, qr_submission_id=$3, consent_accepted=$4, consent_accepted_at=$5, consent_text=$6 WHERE id=$7`,
     [`\nShowroom QR enquiry reviewed ${new Date().toLocaleString("en-IN")}`,s.session_id,s.id,s.consent_accepted,s.consent_accepted_at,s.consent_text,leadId]);
  } else {
    const lr=await client.query(`
    INSERT INTO leads(name,phone,alternate_phone,email,area,district,pincode,vehicle_category,fuel_type,car_interest,variant_interest,preferred_color,source,lead_type,action_type,score,priority,status,assigned_to,branch_id,assigned_branch_id,notes,qr_session_id,qr_submission_id,enquiry_origin,submission_method,consent_accepted,consent_accepted_at,consent_text,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'SHOWROOM_QR','SHOWROOM_QR_ENQUIRY','SHOWROOM_QR_ENQUIRY',$13,$14,'NEW',$15,$16,$16,$17,$18,$19,'SHOWROOM_QR',$20,$21,$22,$23,NOW(),NOW()) RETURNING id`,
    [s.customer_name,s.phone,s.alternate_phone,s.email,s.area,s.district,s.pincode,vehicleCategory,s.fuel_type,s.car_interest,s.variant_interest,s.preferred_color,score,priority,assignedTo,branchId,s.notes,s.session_id,s.id,s.submission_method,s.consent_accepted,s.consent_accepted_at,s.consent_text]);
    leadId=lr.rows[0].id;
  }
  await client.query(`UPDATE showroom_qr_submissions SET submission_status='CONVERTED',reviewed_by=$1,reviewed_at=NOW(),assigned_to=$2,assigned_branch_id=$3,lead_id=$4,updated_at=NOW() WHERE id=$5`,[req.user.id,assignedTo,branchId,leadId,id]);
  await audit({req,user_id:req.user.id,lead_id:leadId,action:"SHOWROOM_QR_CONVERTED_TO_LEAD",module_name:"SHOWROOM_QR",entity_type:"LEAD",entity_id:leadId,branch_id:branchId,new_value:"NEW",remarks:`QR submission converted. Assigned to ${assignedTo||"Unassigned"}. Assignment: ${assignment?.assignment_reason || "AUTO"}. Confidence: ${assignment?.confidence_score || 0}`});
  await client.query("COMMIT");
  res.json({message:"QR submission converted to lead",lead_id:leadId,assigned_to:assignedTo,branch_id:branchId});
 }catch(e){ await client.query("ROLLBACK"); console.error("QR CONVERT ERROR:",e); res.status(500).json({message:"Failed to convert QR submission"}); }
 finally{ client.release(); }
});

module.exports = router;
