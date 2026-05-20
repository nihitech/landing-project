-- NIKRION Vehicle Intelligence Binding support indexes
-- Corrected for real database tables.

CREATE INDEX IF NOT EXISTS idx_vehicle_models_category ON vehicle_models(vehicle_category);
CREATE INDEX IF NOT EXISTS idx_vehicle_models_status ON vehicle_models(status);
CREATE INDEX IF NOT EXISTS idx_vehicle_models_name ON vehicle_models(model_name);

CREATE INDEX IF NOT EXISTS idx_vehicle_variants_model ON vehicle_variants(model_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_variants_name ON vehicle_variants(variant_name);
CREATE INDEX IF NOT EXISTS idx_vehicle_variants_fuel_type ON vehicle_variants(fuel_type);

CREATE INDEX IF NOT EXISTS idx_vehicle_colors_model ON vehicle_colors(model_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_colors_name ON vehicle_colors(color_name);

CREATE INDEX IF NOT EXISTS idx_vehicle_stock_summary_model ON vehicle_stock_summary(model_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_stock_summary_variant ON vehicle_stock_summary(variant_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_stock_summary_color ON vehicle_stock_summary(color_id);
