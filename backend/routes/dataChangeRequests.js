const express=require("express");
const router=express.Router();
const db=require("../config/db");
const auth=require("../middleware/auth");
const dataGov=require("../services/dataActionGovernance");
let logger=null;try{logger=require("../utils/activityLogger");}catch(e){}
function clean(v,f=""){return String(v??f).trim();}
function parseId(v){const id=Number(v);return Number.isInteger(id)&&id>0?id:NaN;}
async function ensureSchema(){await db.query(`CREATE TABLE IF NOT EXISTS data_change_requests(id SERIAL PRIMARY KEY,entity_type VARCHAR(80) NOT NULL,entity_id INTEGER,action_type VARCHAR(40) NOT NULL,requested_by INTEGER REFERENCES users(id),approved_by INTEGER REFERENCES users(id),request_status VARCHAR(40) DEFAULT 'PENDING',current_payload JSONB DEFAULT '{}'::jsonb,requested_payload JSONB DEFAULT '{}'::jsonb,reason TEXT,approver_remarks TEXT,created_at TIMESTAMP DEFAULT NOW(),reviewed_at TIMESTAMP,updated_at TIMESTAMP DEFAULT NOW())`);await db.query(`CREATE INDEX IF NOT EXISTS idx_data_change_requests_status ON data_change_requests(request_status)`);await db.query(`CREATE INDEX IF NOT EXISTS idx_data_change_requests_entity ON data_change_requests(entity_type,entity_id)`);await db.query(`CREATE INDEX IF NOT EXISTS idx_data_change_requests_requested_by ON data_change_requests(requested_by)`);}
async function audit(p){try{if(logger?.logActivity)await logger.logActivity(p);}catch(e){}}
router.get("/rights",auth,async(req,res)=>{res.json(dataGov.actionRights(req.user));});
router.get("/",auth,async(req,res)=>{try{await ensureSchema();const vals=[],clauses=["1=1"];if(!dataGov.canApproveDataChange(req.user)){vals.push(req.user.id);clauses.push(`r.requested_by=$${vals.length}`);}if(req.query.status){vals.push(clean(req.query.status).toUpperCase());clauses.push(`r.request_status=$${vals.length}`);}const r=await db.query(`SELECT r.*,rb.name AS requested_by_name,ab.name AS approved_by_name FROM data_change_requests r LEFT JOIN users rb ON rb.id=r.requested_by LEFT JOIN users ab ON ab.id=r.approved_by WHERE ${clauses.join(" AND ")} ORDER BY r.created_at DESC LIMIT 300`,vals);res.json(r.rows);}catch(e){console.error("DATA CHANGE LIST ERROR:",e);res.status(500).json({message:"Failed to load data change requests"});}});
router.post("/",auth,async(req,res)=>{try{await ensureSchema();const entityType=clean(req.body.entity_type).toUpperCase();const actionType=clean(req.body.action_type).toUpperCase();if(!entityType||!["EDIT","DELETE"].includes(actionType))return res.status(400).json({message:"Valid entity_type and action_type are required"});const r=await db.query(`INSERT INTO data_change_requests(entity_type,entity_id,action_type,requested_by,current_payload,requested_payload,reason) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[entityType,req.body.entity_id||null,actionType,req.user.id,JSON.stringify(req.body.current_payload||{}),JSON.stringify(req.body.requested_payload||{}),clean(req.body.reason)]);await audit({req,user_id:req.user.id,action:"DATA_CHANGE_REQUEST_CREATED",module_name:"GOVERNANCE",entity_type:"DATA_CHANGE_REQUEST",entity_id:r.rows[0].id,new_value:"PENDING",remarks:`${actionType} request submitted for ${entityType}`});res.status(201).json({message:"Data change request submitted for approval",request:r.rows[0]});}catch(e){console.error("DATA CHANGE CREATE ERROR:",e);res.status(500).json({message:"Failed to submit data change request"});}});

async function ensureApprovalApplicationColumns(){
 await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false, ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP, ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id), ADD COLUMN IF NOT EXISTS delete_reason TEXT`);
 await db.query(`CREATE INDEX IF NOT EXISTS idx_leads_is_deleted ON leads(is_deleted)`);
}
function allowedLeadEditFields(){return["name","customer_name","phone","alternate_phone","email","address","area","district","pincode","source","assigned_to","branch_id","assigned_branch_id","budget","finance_required","exchange_required","vehicle_category","car_interest","variant_interest","preferred_color","fuel_type","payment_status"];}
async function applyApprovedLeadChange(client,request,approverId){
 const entityId=Number(request.entity_id); if(!entityId) throw new Error("Invalid lead id");
 const actionType=clean(request.action_type).toUpperCase();
 if(actionType==="EDIT"){
  const payload=request.requested_payload||{}; const allowed=allowedLeadEditFields(); const setClauses=[]; const values=[];
  Object.entries(payload).forEach(([key,value])=>{if(allowed.includes(key)){values.push(value);setClauses.push(`${key}=$${values.length}`);}});
  if(!setClauses.length) throw new Error("No approved editable lead fields found");
  values.push(entityId);
  await client.query(`UPDATE leads SET ${setClauses.join(", ")}, updated_at=NOW() WHERE id=$${values.length}`,values);
  return{applied:true,action:"EDIT",fields:setClauses.length};
 }
 if(actionType==="DELETE"){
  await client.query(`UPDATE leads SET is_deleted=true,deleted_at=NOW(),deleted_by=$1,delete_reason=$2,status=CASE WHEN status IN ('CLOSED','LOST') THEN status ELSE 'LOST' END,updated_at=NOW() WHERE id=$3`,[approverId,clean(request.reason||"Approved delete request"),entityId]);
  return{applied:true,action:"DELETE"};
 }
 throw new Error("Unsupported lead action type");
}
async function applyApprovedRequest(client,request,approverId){
 const entityType=clean(request.entity_type).toUpperCase();
 if(entityType==="LEAD") return applyApprovedLeadChange(client,request,approverId);
 return{applied:false,reason:"NO_APPLIER_FOR_ENTITY"};
}

router.post("/:id/review",auth,async(req,res)=>{
 const client=await db.connect();
 try{
  await ensureSchema(); await ensureApprovalApplicationColumns();
  if(!dataGov.canApproveDataChange(req.user)) return res.status(403).json({message:"You do not have approval authority"});
  const id=parseId(req.params.id); if(Number.isNaN(id)) return res.status(400).json({message:"Invalid request id"});
  const status=clean(req.body.request_status).toUpperCase();
  if(!["APPROVED","REJECTED"].includes(status)) return res.status(400).json({message:"Status must be APPROVED or REJECTED"});
  await client.query("BEGIN");
  const reqRes=await client.query(`SELECT * FROM data_change_requests WHERE id=$1 FOR UPDATE`,[id]);
  if(!reqRes.rows.length){await client.query("ROLLBACK");return res.status(404).json({message:"Pending request not found"});}
  const changeRequest=reqRes.rows[0];
  if(changeRequest.request_status!=="PENDING"){await client.query("ROLLBACK");return res.status(400).json({message:"Request already reviewed"});}
  let applyResult={applied:false};
  if(status==="APPROVED") applyResult=await applyApprovedRequest(client,changeRequest,req.user.id);
  const r=await client.query(`UPDATE data_change_requests SET request_status=$1,approved_by=$2,approver_remarks=$3,reviewed_at=NOW(),updated_at=NOW() WHERE id=$4 RETURNING *`,[status,req.user.id,clean(req.body.approver_remarks),id]);
  await audit({req,user_id:req.user.id,action:`DATA_CHANGE_REQUEST_${status}`,module_name:"GOVERNANCE",entity_type:"DATA_CHANGE_REQUEST",entity_id:id,new_value:status,remarks:`${clean(req.body.approver_remarks)} Applied: ${applyResult.applied?"YES":"NO"}`});
  await client.query("COMMIT");
  res.json({message:status==="APPROVED"&&applyResult.applied?`Request approved and ${applyResult.action.toLowerCase()} applied`:`Request ${status.toLowerCase()}`,request:r.rows[0],apply_result:applyResult});
 }catch(e){await client.query("ROLLBACK");console.error("DATA CHANGE REVIEW/APPLY ERROR:",e);res.status(500).json({message:e.message||"Failed to review data change request"});}
 finally{client.release();}
});

module.exports=router;