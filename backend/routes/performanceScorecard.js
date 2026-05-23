const express = require("express");
const router = express.Router();

const db = require("../config/db");
const auth = require("../middleware/auth");
const roleAccess = require("../services/roleAccess");

function clean(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function roleOf(req) {
    return roleAccess.roleOf(req.user);
}

function isManagerView(req) {
    return roleAccess.isAdmin(req.user) ||
        roleAccess.isManager(req.user) ||
        roleAccess.isDigitalMarketing(req.user);
}

function dateClause(alias, values, from, to) {
    const clauses = [];
    if (from) {
        values.push(from);
        clauses.push(`${alias}.created_at >= $${values.length}`);
    }
    if (to) {
        values.push(to);
        clauses.push(`${alias}.created_at < ($${values.length}::date + INTERVAL '1 day')`);
    }
    return clauses;
}

function scorePercent(value, max) {
    if (!max || max <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((Number(value || 0) / Number(max)) * 100)));
}

function weightedScore(parts) {
    let score = 0;
    let total = 0;

    for (const p of parts) {
        score += Number(p.value || 0) * Number(p.weight || 0);
        total += Number(p.weight || 0);
    }

    return total ? Math.round(score / total) : 0;
}

router.get("/me", auth, async (req, res) => {
    try {
        const values = [];
        const from = req.query.from;
        const to = req.query.to;
        const role = roleOf(req);

        const leadClauses = ["1=1"];
        const callClauses = ["1=1"];
        const queryClauses = ["1=1"];

        leadClauses.push(...dateClause("l", values, from, to));
        const callBaseIndex = values.length;
        callClauses.push(...dateClause("cl", values, from, to));
        const queryBaseIndex = values.length;
        queryClauses.push(...dateClause("pq", values, from, to));

        const userId = req.user.id;

        if (!isManagerView(req)) {
            values.push(userId);
            leadClauses.push(`l.assigned_to = $${values.length}`);
            callClauses.push(`cl.created_by = $${values.length}`);
            queryClauses.push(`pq.raised_by = $${values.length}`);
        }

        const leadResult = await db.query(`
            SELECT
                COUNT(*)::int AS total_leads,
                COUNT(*) FILTER (WHERE UPPER(COALESCE(l.status,'NEW'))='NEW')::int AS new_leads,
                COUNT(*) FILTER (WHERE UPPER(COALESCE(l.status,'')) IN ('CONTACTED','FOLLOW-UP','QUALIFIED','TEST-DRIVE','BOOKED','CLOSED'))::int AS active_leads,
                COUNT(*) FILTER (WHERE UPPER(COALESCE(l.status,''))='QUALIFIED')::int AS qualified_leads,
                COUNT(*) FILTER (WHERE UPPER(COALESCE(l.status,''))='TEST-DRIVE')::int AS test_drive_leads,
                COUNT(*) FILTER (WHERE UPPER(COALESCE(l.status,''))='BOOKED')::int AS booked_leads,
                COUNT(*) FILTER (WHERE UPPER(COALESCE(l.status,''))='CLOSED')::int AS closed_leads,
                COUNT(*) FILTER (WHERE UPPER(COALESCE(l.status,''))='LOST')::int AS lost_leads,
                COUNT(*) FILTER (WHERE (l.next_followup_at < NOW() OR l.next_followup_date < NOW()) AND UPPER(COALESCE(l.status,'')) NOT IN ('CLOSED','LOST'))::int AS missed_followups
            FROM leads l
            WHERE ${leadClauses.join(" AND ")}
        `, values);

        const callResult = await db.query(`
            SELECT
                COUNT(*)::int AS total_calls,
                COUNT(*) FILTER (WHERE call_status='COMPLETED')::int AS completed_calls,
                COUNT(*) FILTER (WHERE recording_url IS NOT NULL AND recording_url <> '')::int AS recorded_calls,
                COALESCE(SUM(call_duration_seconds),0)::int AS total_call_seconds
            FROM call_logs cl
            WHERE ${callClauses.join(" AND ")}
        `, values);

        const queryResult = await db.query(`
            SELECT
                COUNT(*)::int AS total_queries,
                COUNT(*) FILTER (WHERE query_status='ANSWERED')::int AS answered_queries,
                COUNT(*) FILTER (WHERE query_status='OPEN')::int AS open_queries
            FROM process_queries pq
            WHERE ${queryClauses.join(" AND ")}
        `, values).catch(() => ({ rows: [{ total_queries: 0, answered_queries: 0, open_queries: 0 }] }));

        const bookingResult = await db.query(`
            SELECT
                COUNT(*)::int AS total_bookings,
                COUNT(*) FILTER (WHERE b.inventory_id IS NOT NULL)::int AS allocated_bookings,
                COUNT(*) FILTER (WHERE UPPER(COALESCE(b.booking_status,''))='DELIVERED')::int AS delivered_bookings
            FROM bookings b
            LEFT JOIN leads l ON l.id = b.lead_id
            WHERE ${leadClauses.join(" AND ")}
        `, values).catch(() => ({ rows: [{ total_bookings: 0, allocated_bookings: 0, delivered_bookings: 0 }] }));

        const leads = leadResult.rows[0] || {};
        const calls = callResult.rows[0] || {};
        const queries = queryResult.rows[0] || {};
        const bookings = bookingResult.rows[0] || {};

        const conversionScore = scorePercent(Number(leads.booked_leads || 0) + Number(leads.closed_leads || 0), Number(leads.total_leads || 0));
        const followupScore = 100 - scorePercent(leads.missed_followups, leads.total_leads);
        const callScore = scorePercent(calls.completed_calls, Math.max(1, calls.total_calls));
        const queryScore = scorePercent(queries.answered_queries, Math.max(1, queries.total_queries));
        const allocationScore = scorePercent(bookings.allocated_bookings, Math.max(1, bookings.total_bookings));

        let performanceScore = weightedScore([
            { value: conversionScore, weight: 35 },
            { value: followupScore, weight: 25 },
            { value: callScore, weight: 20 },
            { value: allocationScore, weight: 10 },
            { value: queryScore, weight: 10 }
        ]);

        if (role === "telecaller") {
            performanceScore = weightedScore([
                { value: callScore, weight: 45 },
                { value: scorePercent(leads.qualified_leads, Math.max(1, leads.total_leads)), weight: 35 },
                { value: followupScore, weight: 20 }
            ]);
        }

        if (role === "digital_marketing") {
            performanceScore = weightedScore([
                { value: conversionScore, weight: 30 },
                { value: followupScore, weight: 25 },
                { value: queryScore, weight: 20 },
                { value: allocationScore, weight: 25 }
            ]);
        }

        res.json({
            role,
            period: { from: from || null, to: to || null },
            score: performanceScore,
            leads,
            calls,
            queries,
            bookings,
            ratios: {
                conversion_score: conversionScore,
                followup_score: followupScore,
                call_score: callScore,
                query_score: queryScore,
                allocation_score: allocationScore
            }
        });
    } catch (err) {
        console.error("PERFORMANCE ME ERROR:", err);
        res.status(500).json({ message: "Failed to load performance scorecard" });
    }
});

router.get("/team", auth, async (req, res) => {
    try {
        if (!isManagerView(req)) {
            return res.status(403).json({ message: "No permission to view team performance" });
        }

        const values = [];
        const from = req.query.from;
        const to = req.query.to;

        const leadDate = dateClause("l", values, from, to);
        const clauses = ["1=1", ...leadDate];

        if (!roleAccess.isAdmin(req.user) && req.user.branch_id) {
            values.push(req.user.branch_id);
            clauses.push(`u.branch_id = $${values.length}`);
        }

        const result = await db.query(`
            SELECT
                u.id AS user_id,
                u.name AS user_name,
                u.role,
                u.branch_id,
                COUNT(l.id)::int AS total_leads,
                COUNT(l.id) FILTER (WHERE UPPER(COALESCE(l.status,''))='BOOKED')::int AS booked_leads,
                COUNT(l.id) FILTER (WHERE UPPER(COALESCE(l.status,''))='CLOSED')::int AS closed_leads,
                COUNT(l.id) FILTER (WHERE UPPER(COALESCE(l.status,''))='QUALIFIED')::int AS qualified_leads,
                COUNT(l.id) FILTER (WHERE (l.next_followup_at < NOW() OR l.next_followup_date < NOW()) AND UPPER(COALESCE(l.status,'')) NOT IN ('CLOSED','LOST'))::int AS missed_followups,
                COUNT(cl.id)::int AS total_calls,
                COUNT(cl.id) FILTER (WHERE cl.call_status='COMPLETED')::int AS completed_calls
            FROM users u
            LEFT JOIN leads l ON l.assigned_to = u.id AND ${clauses.join(" AND ")}
            LEFT JOIN call_logs cl ON cl.created_by = u.id
            WHERE COALESCE(u.status,'ACTIVE')='ACTIVE'
            GROUP BY u.id, u.name, u.role, u.branch_id
            ORDER BY booked_leads DESC, total_leads DESC
            LIMIT 200
        `, values);

        const rows = result.rows.map(r => {
            const conversion = scorePercent(Number(r.booked_leads || 0) + Number(r.closed_leads || 0), r.total_leads);
            const followup = 100 - scorePercent(r.missed_followups, r.total_leads);
            const calls = scorePercent(r.completed_calls, Math.max(1, r.total_calls));
            return {
                ...r,
                performance_score: weightedScore([
                    { value: conversion, weight: 40 },
                    { value: followup, weight: 35 },
                    { value: calls, weight: 25 }
                ])
            };
        });

        res.json(rows);
    } catch (err) {
        console.error("TEAM PERFORMANCE ERROR:", err);
        res.status(500).json({ message: "Failed to load team performance" });
    }
});

router.get("/source", auth, async (req, res) => {
    try {
        const values = [];
        const clauses = ["1=1", ...dateClause("l", values, req.query.from, req.query.to)];

        if (!isManagerView(req)) {
            values.push(req.user.id);
            clauses.push(`l.assigned_to = $${values.length}`);
        }

        const result = await db.query(`
            SELECT
                COALESCE(NULLIF(l.source,''),'UNKNOWN') AS source,
                COUNT(*)::int AS total_leads,
                COUNT(*) FILTER (WHERE UPPER(COALESCE(l.status,''))='QUALIFIED')::int AS qualified,
                COUNT(*) FILTER (WHERE UPPER(COALESCE(l.status,''))='BOOKED')::int AS booked,
                COUNT(*) FILTER (WHERE UPPER(COALESCE(l.status,''))='CLOSED')::int AS closed
            FROM leads l
            WHERE ${clauses.join(" AND ")}
            GROUP BY COALESCE(NULLIF(l.source,''),'UNKNOWN')
            ORDER BY total_leads DESC
        `, values);

        res.json(result.rows);
    } catch (err) {
        console.error("SOURCE PERFORMANCE ERROR:", err);
        res.status(500).json({ message: "Failed to load source performance" });
    }
});

module.exports = router;
