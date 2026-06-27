-- ============================================================
-- 05_seed_data.sql — 在庫データの投入テンプレート
--
-- これはサンプルです。実際の店舗の在庫（サイズと本数）が分かったら
-- この内容を実数に置き換えてSQL Editorで実行してください。
-- ============================================================

insert into public.equipment_items (category, size_label, total_quantity) values
  ('ski', '140cm', 3),
  ('ski', '150cm', 5),
  ('ski', '160cm', 6),
  ('ski', '170cm', 4),
  ('snowboard', '140cm', 3),
  ('snowboard', '150cm', 5),
  ('snowboard', '155cm', 4),
  ('boots', '24.0cm', 4),
  ('boots', '25.0cm', 5),
  ('boots', '26.0cm', 5),
  ('boots', '27.0cm', 4),
  ('boots', '28.0cm', 3)
on conflict (category, size_label) do nothing;
