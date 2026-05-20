-- NIKRION Branch Manager Assignment Sync
-- This patch is mainly backend/frontend logic.
-- Optional index for manager lookups:

CREATE INDEX IF NOT EXISTS idx_branches_manager_id ON branches(manager_id);
CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id);
